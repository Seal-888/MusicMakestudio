# 캡컷 draft 포맷 — 실제 파일에서 해독한 내용

`테스트1_플레이리스트` 프로젝트(MP3 3곡 + PNG 2장 + 곡 제목 자막)를 뜯어 정리한 것.
4단계 구현은 이 문서를 기준으로 한다.

## 폴더에 들어가는 것

```
com.lveditor.draft/<프로젝트이름>/
├── draft_info.json          ← 타임라인 본체 (43KB)
├── draft_meta_info.json     ← 미디어 목록
├── draft_virtual_store.json ← 거의 고정값
├── timeline_layout.json     ← 거의 고정값
├── <곡1>.mp3                ← 원본을 폴더 안으로 복사
├── <곡2>.mp3
├── <이미지>.PNG
└── <프로젝트이름>_자막.srt
```

**미디어 파일을 폴더 안으로 복사해야 한다.** JSON은 원본 위치가 아니라 이 폴더 안의
절대 경로를 가리킨다. 사용자에게 계정 폴더명을 묻는 이유가 이것.

```
/Users/<사용자명>/Movies/CapCut/User Data/Projects/com.lveditor.draft/<프로젝트>/<파일명>
```

## 시간 단위

**마이크로초.** 1초 = 1,000,000.
예) 101519979 = 101.519979초

## 트랙 3개

| 트랙 | 세그먼트 | 배치 |
|---|---|---|
| `audio` | 곡 하나당 1개 | 앞 곡이 끝나는 지점부터 이어 붙임 |
| `video` | 이미지 하나당 1개 | 전체 길이를 이미지 수로 균등 분할 |
| `text` | 곡 하나당 1개 | 각 곡 시작점에 5초 (5000000) |

`text` 트랙만 `flag: 1`, 나머지는 `0`. 텍스트 세그먼트의 `render_index`는 14000,
나머지는 0.

검증: 곡 101.52 + 99.00 + 109.96 = 310.48초 = 전체 `duration` 310479937 ✓
이미지 2장 × 155239968 = 310479936 ✓ (반올림 오차 1 허용)

## materials

- `videos[]` — 이미지도 여기 들어간다. `type: "photo"`, `duration: 10800000000`(3시간, 정지 이미지 고정값), 실제 `width`/`height` 필요
- `audios[]` — `type: "extract_music"`, `duration`은 실제 길이(µs)
- `texts[]` — `type: "subtitle"`, `add_type: 2`

세그먼트 하나당 `canvases`, `speeds`, `sound_channel_mappings`, `vocal_separations`,
`material_animations`, `placeholder_infos`를 각각 하나씩 만들어 `extra_material_refs`로 연결한다.
(세그먼트 5개 → 이 배열들이 각 5개)

## 자막 스타일 — 두 군데에 같은 값을 써야 한다

`texts[]` 항목 안에서 스타일이 **두 번** 표현된다. 둘이 어긋나면 캡컷이 이상하게 연다.

1. `content` — JSON을 문자열로 넣은 필드
```json
"{\"styles\":[{\"fill\":{\"content\":{\"solid\":{\"color\":[1,1,1]},\"render_type\":\"solid\"}},
  \"range\":[0,7],\"strokes\":[{\"width\":0.128,\"mode\":0,
  \"content\":{\"solid\":{\"color\":[0,0,0]},\"render_type\":\"solid\"}}],\"size\":5}],
  \"text\":\"테스트1\"}"
```
- 색은 **0~1 실수 배열** `[r,g,b]` (255 아님)
- `range`는 `[0, 글자수]`
- `size`는 아래 `font_size`와 같은 값

2. 최상위 필드
```
text_color: "#FFFFFF"   border_color: "#000000"   border_width: 0.128
font_size: 5            text_size: 30             alignment: 1
```

## 자막 위치

세그먼트의 `clip.transform.y`로 정한다. 화면 세로 −1(하단) ~ +1(상단).

| 위치 | y |
|---|---|
| 하단 | -0.7069767441860466 |
| 중앙 | 0 |
| 상단 | 0.72 |

상단이 하단의 부호만 바꾼 값이 아니다. 실측값을 그대로 쓴다.

## 폰트

폰트를 지정하면 **두 군데**가 바뀐다. 나머지 폰트 관련 필드
(`font_name`, `font_id`, `font_resource_id`, `fonts`)는 전부 그대로다.

1. 최상위 `font_path` = 전체 경로
2. `content` 안 style 객체에 `font` 키 추가

```json
{"path":"/System/Library/Fonts/AppleSDGothicNeo.ttc","id":""}
```

빈 문자열로 두면 캡컷 기본 폰트로 열린다. 경로가 틀려도 기본 폰트로 열리고
색·크기·위치는 그대로 적용되므로 프로젝트가 깨지지는 않는다.

브라우저는 파일의 전체 경로를 알려주지 않으므로, 파일명만 받아서
OS 표준 폴더 경로를 앞에 붙이거나 사용자가 직접 입력하게 한다.

## 함정 세 가지 — 실제로 틀렸던 것들

**1. `range`는 글자 수가 아니라 자모 분리 기준 길이다.**
"테스트1"은 4글자지만 `range: [0, 7]`. 한글이 초성·중성·종성으로 분해된 길이를 쓴다.
`content.normalize('NFD').length`로 계산해야 맞는다.

**2. `materials`에는 키가 54개 있어야 한다.**
실제로 쓰는 건 11개뿐이지만 나머지 43개도 빈 배열로 넣어야 한다.

**3. `new_version`은 `"171.0.0"`.**

## 검증

실제 캡컷 출력과 생성 결과를 재귀 비교한 결과, UUID·타임스탬프·유니코드 정규화 형태를
빼면 차이가 없다. `duration`도 310479937로 정확히 일치.

## draft_meta_info.json

`draft_materials`는 타입별 배열 6개. 우리가 채울 곳은 두 군데.

- `type: 0` — 음악과 이미지. `{ metetype: "music"|"photo", file_Path, extra_info: 파일명, duration, width, height }`
- `type: 2` — SRT 파일 하나

그 외 `draft_fold_path`, `draft_root_path`, `draft_id`, `draft_name`, `tm_draft_create`도 채운다.

## 캔버스

```json
{"ratio":"original","width":1920,"height":1080,"background":null}
```
9:16으로 만들 때는 1080×1920으로 바꾼다.

## 만들 때 순서

1. 곡 길이를 잰다 (`js/audio.js`의 `measureTracks`)
2. 폴더 선택 (`showDirectoryPicker`)
3. 프로젝트 폴더 생성
4. 미디어 파일 복사 + SRT 작성
5. JSON 4개 작성
6. 캡컷 재시작 안내 — 실행 중이면 새 프로젝트가 목록에 안 보인다
