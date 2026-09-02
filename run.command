#!/bin/bash
# 더블클릭하면 로컬 서버가 뜨고 브라우저가 열립니다.
# 창을 닫으면 서버도 같이 꺼집니다.

cd "$(dirname "$0")" || exit 1
PORT=8383
URL="http://localhost:$PORT"

echo ""
echo "  PLI Music Studio"
echo "  ------------------------------"

HERE="$(pwd -P)"

# 8383에 뭔가 떠 있으면, 그게 "이 폴더"의 서버인지부터 확인합니다.
#
# 예전에는 응답만 오면 브라우저를 열고 끝냈습니다.
# 그래서 다른 폴더(예전 버전)의 서버가 살아 있으면 그쪽 파일이 그대로 열렸고,
# 방금 고친 내용이 반영되지 않는데 원인을 알기 어려웠습니다.
WHO="$(curl -s --max-time 2 "$URL/__whoami" 2>/dev/null)"

if [ -n "$WHO" ]; then
  RUNNING_DIR="$(printf '%s' "$WHO" | sed -n 's/.*"dir"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

  if [ "$RUNNING_DIR" = "$HERE" ]; then
    echo "  이미 켜져 있습니다. 브라우저를 엽니다."
    open "$URL"
    exit 0
  fi

  echo ""
  echo "  ⚠  포트 $PORT 를 다른 폴더가 쓰고 있습니다."
  echo ""
  echo "     지금 도는 곳: ${RUNNING_DIR:-알 수 없음}"
  echo "     열려던 곳:   $HERE"
  echo ""
  echo "     그대로 두면 예전 폴더의 파일이 열립니다."
  echo "     아래를 실행해 끈 뒤 다시 시도하세요:"
  echo ""
  echo "         lsof -ti tcp:$PORT | xargs kill"
  echo ""
  read -r -p "  엔터를 누르면 닫힙니다. "
  exit 1
fi

# 응답이 없더라도 포트를 쥔 프로세스가 있을 수 있습니다(다른 프로그램 등).
if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  echo ""
  echo "  ⚠  포트 $PORT 를 다른 프로그램이 쓰고 있습니다."
  echo "     lsof -i tcp:$PORT   으로 확인한 뒤 끄고 다시 시도하세요."
  echo ""
  read -r -p "  엔터를 누르면 닫힙니다. "
  exit 1
fi

# 쓸 수 있는 서버를 찾습니다.
if command -v python3 >/dev/null 2>&1 && python3 -c "" >/dev/null 2>&1; then
  # serve.py는 캐시 금지 헤더를 붙여서, 파일을 바꾸면 새로고침만으로 바로 반영됩니다.
  SERVER="python3 serve.py $PORT"
elif command -v ruby >/dev/null 2>&1; then
  SERVER="ruby -run -e httpd . -p $PORT -b 127.0.0.1"
elif command -v npx >/dev/null 2>&1; then
  SERVER="npx --yes serve -l $PORT ."
else
  echo ""
  echo "  로컬 서버로 쓸 프로그램을 찾지 못했습니다."
  echo "  터미널에 아래를 한 번 실행한 뒤 다시 시도해 주세요:"
  echo ""
  echo "      xcode-select --install"
  echo ""
  read -r -p "  엔터를 누르면 닫힙니다. "
  exit 1
fi

echo "  주소: $URL"
echo "  끄려면 이 창에서 Control+C 를 누르세요."
echo ""

# 서버가 뜰 시간을 준 뒤 브라우저를 엽니다. Chrome이 있으면 Chrome으로.
(
  sleep 1
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "$URL"
  else
    open "$URL"
  fi
) &

exec $SERVER
