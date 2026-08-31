# AI 음악 작업실 · 로컬 버전

내 맥에서만 도는 버전. 서버도 로그인도 없고, 브라우저가 API를 직접 부릅니다.

## 시작하기

1. 이 폴더를 원하는 곳에 두세요. (예: `~/Documents/anhmusic-local`)
2. `run.command`를 더블클릭하세요. 터미널이 열리고 브라우저가 뜹니다.
3. 처음이라면 **API 설정**에서 키를 넣고 **테스트**를 눌러 초록불을 확인하세요.

`run.command`가 안 열리면 터미널에서 한 번만:

```bash
cd ~/Documents/anhmusic-local
chmod +x run.command
```

"확인되지 않은 개발자" 경고가 뜨면 파일 우클릭 → **열기**를 고르면 됩니다.

## 왜 파일을 그냥 열면 안 되나요

캡컷 내보내기가 쓰는 폴더 쓰기 기능은 `http://localhost`에서만 동작합니다.
`file://`로 열면 그 기능이 막히고 모듈도 안 불러와집니다. 꼭 `run.command`로 여세요.

## 브라우저

**Chrome 또는 Edge**를 쓰세요. 캡컷 내보내기가 Safari와 Firefox에서는 동작하지 않습니다.

## 키는 어디에 저장되나요

이 브라우저의 localStorage에만 저장됩니다. 어디로도 전송되지 않고, 이 폴더 안에도 기록되지 않습니다.
대신 **브라우저 데이터를 지우면 같이 사라집니다.** API 설정 맨 아래 "파일로 내보내기"로 가끔 백업해 두세요.

## 만들어진 것 / 만들 것

- [x] 1단계 — 뼈대, 화면 이동, API 설정, 연결 테스트, 백업
- [x] 2단계 — 채널 기획 · 레퍼런스 분석 · 비주얼 팔레트 · 음악 만들기 · 영상 만들기
- [x] 3단계 — 타임스탬프 · 스타일 보관함 · 메타데이터 · SEO 최적화
- [x] 4-A단계 — 캡컷 자동 편집기
- [x] 4-B단계 — 가사 자막 (Suno 타임코드 기반)
- [x] 번역 SRT · AI 가사 추출
- [x] 5단계 — 채널 분석기 · 수익 분석

## 폴더 구조

```
index.html          화면 뼈대와 사이드바
css/style.css       전체 스타일
js/app.js           페이지 전환
js/store.js         localStorage (키, 보관함)
js/ui.js            알림 같은 공용 조각
js/api/             Gemini · kie.ai · YouTube · Pexels 호출
js/audio.js         곡 길이 재기 (타임스탬프와 캡컷이 같이 씀)
js/capcut.js        캡컷 프로젝트 생성기
js/capcut-template.js  실제 캡컷 출력에서 뽑은 뼈대
js/prompts.js       Gemini 프롬프트 6종 ← 결과가 마음에 안 들면 여기를 고치세요
js/render.js        결과 화면 공용 조각
js/pages/           화면별 코드
docs/               캡컷 draft 포맷 해독 문서
```

바꿀 일이 가장 많은 곳은 `js/prompts.js`입니다. 결과물 품질은 거의 다 거기서 결정됩니다.
