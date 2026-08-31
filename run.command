#!/bin/bash
# 더블클릭하면 로컬 서버가 뜨고 브라우저가 열립니다.
# 창을 닫으면 서버도 같이 꺼집니다.

cd "$(dirname "$0")" || exit 1
PORT=8383
URL="http://localhost:$PORT"

echo ""
echo "  PLI Music Studio"
echo "  ------------------------------"

# 이미 켜져 있으면 브라우저만 엽니다.
if curl -s -o /dev/null "$URL" 2>/dev/null; then
  echo "  이미 켜져 있습니다. 브라우저를 엽니다."
  open "$URL"
  exit 0
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
