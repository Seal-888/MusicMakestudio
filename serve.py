#!/usr/bin/env python3
"""
로컬 전용 정적 서버 + kie.ai 우회 통로.

두 가지 일을 합니다.
1. 캐시 금지 헤더를 붙여서, 파일을 바꾸면 새로고침만으로 바로 반영되게 합니다.
2. 브라우저가 kie.ai를 직접 못 부를 때(CORS) 대신 불러 줍니다.
   /kie/... 로 들어온 요청을 https://api.kie.ai/... 로 그대로 넘깁니다.
   /grab?url=... 은 완성된 mp3를 받아 오는 통로입니다.

전부 127.0.0.1에서만 돌기 때문에 밖에서는 접근할 수 없습니다.
"""

import http.server
import socketserver
import sys
import urllib.request
import urllib.parse
import urllib.error

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8383
KIE = "https://api.kie.ai"
ALLOWED_GRAB = ("https://",)


class Handler(http.server.SimpleHTTPRequestHandler):
    # ---------- 공통 ----------
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("  %s %s\n" % (args[1], args[0]))

    # ---------- 라우팅 ----------
    def do_GET(self):
        if self.path.startswith("/kie/"):
            return self.relay("GET")
        if self.path.startswith("/grab?"):
            return self.grab()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/kie/"):
            return self.relay("POST")
        if self.path.startswith("/kie-callback"):
            # kie.ai가 완료를 알려 주는 자리입니다. 우리는 직접 확인하기 때문에
            # 받기만 하고 넘어갑니다. 밖에서는 이 주소에 닿을 수 없습니다.
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"{}")
            return
        self.send_error(404)

    # ---------- kie.ai 중계 ----------
    def relay(self, method):
        target = KIE + self.path[len("/kie"):]
        body = None
        if method == "POST":
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else b""

        req = urllib.request.Request(target, data=body, method=method)
        auth = self.headers.get("Authorization")
        if auth:
            req.add_header("Authorization", auth)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                payload, status = res.read(), res.status
        except urllib.error.HTTPError as e:
            payload, status = e.read(), e.code
        except Exception as e:
            payload = ('{"code":599,"msg":%s}' % _json_str(str(e))).encode()
            status = 599

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    # ---------- 완성된 음원 받아 오기 ----------
    def grab(self):
        query = urllib.parse.urlparse(self.path).query
        url = urllib.parse.parse_qs(query).get("url", [""])[0]
        if not url.startswith(ALLOWED_GRAB):
            return self.send_error(400, "bad url")

        try:
            with urllib.request.urlopen(url, timeout=300) as res:
                data = res.read()
                ctype = res.headers.get("Content-Type", "application/octet-stream")
        except Exception as e:
            return self.send_error(502, str(e))

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def _json_str(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"  서버 시작 · http://localhost:{PORT}")
        print("  끄려면 Control+C")
        print()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  서버를 껐습니다.")
