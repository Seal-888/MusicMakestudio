#!/usr/bin/env python3
"""
로컬 전용 정적 서버.

캐시 금지 헤더를 붙여서, 파일을 바꾸면 새로고침만으로 바로 반영되게 합니다.
127.0.0.1에서만 돌기 때문에 밖에서는 접근할 수 없습니다.
"""

import functools
import http.server
import json
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8383

# 항상 이 파일이 놓인 폴더를 내보냅니다.
# 예전에는 실행할 때의 현재 폴더를 썼기 때문에, 다른 위치에서 부르면
# 엉뚱한 폴더가 서비스될 수 있었습니다.
APP_DIR = os.path.dirname(os.path.abspath(__file__))
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


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("  %s %s\n" % (args[1], args[0]))

    def do_GET(self):
        if not _host_ok(self.headers.get("Host")):
            return self.send_error(403, "forbidden host")
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
        return super().do_GET()

    def do_HEAD(self):
        if not _host_ok(self.headers.get("Host")):
            return self.send_error(403, "forbidden host")
        return super().do_HEAD()


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
