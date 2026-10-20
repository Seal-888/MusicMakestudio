#!/usr/bin/env python3
"""
로컬 전용 정적 서버 + kie.ai 우회 통로.

두 가지 일을 합니다.
1. 캐시 금지 헤더를 붙여서, 파일을 바꾸면 새로고침만으로 바로 반영되게 합니다.
2. 브라우저가 kie.ai를 직접 못 부를 때(CORS) 대신 불러 줍니다.
   /kie/... 로 들어온 요청을 https://api.kie.ai/... 로 그대로 넘깁니다.
   /grab?url=... 은 완성된 mp3를 받아 오는 통로입니다. (공인 https 주소만)

전부 127.0.0.1에서만 돌기 때문에 밖에서는 접근할 수 없습니다.
"""

import functools
import http.server
import ipaddress
import json
import os
import socket
import socketserver
import sys
import urllib.request
import urllib.parse
import urllib.error

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8383

# 항상 이 파일이 놓인 폴더를 내보냅니다.
# 예전에는 실행할 때의 현재 폴더를 썼기 때문에, 다른 위치에서 부르면
# 엉뚱한 폴더가 서비스될 수 있었습니다.
APP_DIR = os.path.dirname(os.path.abspath(__file__))
KIE = "https://api.kie.ai"
ALLOWED_GRAB = ("https://",)
# 이 이름으로 들어온 요청만 받습니다. 아래 _host_ok 설명 참고.
LOCAL_HOSTS = ("localhost", "127.0.0.1")


def _host_ok(host):
    """
    브라우저가 보낸 Host 가 이 컴퓨터를 가리키는지 확인합니다.

    127.0.0.1 에서만 돌아도, 아무 웹사이트나 자기 도메인을 잠깐 127.0.0.1 로
    돌려 놓는 방법(DNS rebinding)으로 이 서버를 부를 수 있습니다.
    그런 요청은 Host 에 그 사이트 이름이 실려 오므로 여기서 걸러집니다.
    """
    return (host or "").split(":")[0] in LOCAL_HOSTS


def _public_url(url):
    """
    /grab 이 집 안 기기(공유기 관리 화면, 사내망 등)를 대신 열어 주지 않도록,
    주소가 가리키는 IP 가 모두 공인 IP 인지 확인합니다.
    """
    host = urllib.parse.urlparse(url).hostname
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    return all(ipaddress.ip_address(i[4][0].split("%")[0]).is_global for i in infos)


class _CheckedRedirect(urllib.request.HTTPRedirectHandler):
    """리다이렉트로 내부 주소로 빠지는 것도 같은 기준으로 막습니다."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not (newurl.startswith(ALLOWED_GRAB) and _public_url(newurl)):
            raise urllib.error.URLError("blocked redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_grab_opener = urllib.request.build_opener(_CheckedRedirect)


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
    def _reject_foreign_host(self):
        if _host_ok(self.headers.get("Host")):
            return False
        self.send_error(403, "forbidden host")
        return True

    def do_GET(self):
        if self._reject_foreign_host():
            return
        # 지금 8383에서 도는 서버가 "어느 폴더"를 내보내는지 알려 줍니다.
        # run.command가 이걸로 다른 폴더의 서버가 살아 있는지 가려냅니다.
        if self.path == "/__whoami":
            body = json.dumps({"app": "plimusic-studio", "dir": APP_DIR}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/kie/"):
            return self.relay("GET")
        if self.path.startswith("/grab?"):
            return self.grab()
        return super().do_GET()

    def do_POST(self):
        if self._reject_foreign_host():
            return
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
        if not _public_url(url):
            return self.send_error(400, "private address")

        try:
            with _grab_opener.open(url, timeout=300) as res:
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
    handler = functools.partial(Handler, directory=APP_DIR)
    with Server(("127.0.0.1", PORT), handler) as httpd:
        print(f"  서버 시작 · http://localhost:{PORT}")
        print(f"  폴더: {APP_DIR}")
        try:
            import re as _re
            _v = open(os.path.join(APP_DIR, "js/version.js")).read()
            print("  버전: " + _re.search(r'VERSION = "([^"]+)"', _v).group(1)
                  + " · " + _re.search(r'BUILT = "([^"]+)"', _v).group(1))
        except Exception:
            pass
        print("  끄려면 Control+C")
        print()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  서버를 껐습니다.")
