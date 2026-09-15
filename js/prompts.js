/**
 * 여기가 결과물 품질을 결정하는 곳입니다.
 * 마음에 안 드는 결과가 나오면 코드 말고 이 파일의 문장을 고치세요.
 *
 * 각 항목은 { prompt, schema, temperature, maxOutputTokens } 를 돌려줍니다.
 * temperature는 Gemini 2.x에서만 반영되고, 3.x에서는 구글 권고에 따라 무시됩니다.
 */

/**
 * AI 작사에서 반복해서 나오는 단어들입니다.
 * 처음 보면 그럴듯하지만 어디서나 나오기 때문에 개성을 지웁니다.
 */
const CLICHE_WORDS = [
  'velvet', 'echo', 'amber', 'lazy', 'midnight', 'fade', 'neon', 'shadow',
  'whisper', 'bloom', 'drift', 'glow', 'ember', 'twilight', 'ocean',
  'hollow', 'silk', 'dream', 'paper', 'golden',
];

/**
 * 화자를 누구로 세울지가 가사의 색을 결정합니다.
 * 같은 사건도 누가 말하느냐에 따라 완전히 다른 곡이 됩니다.
 */
export const PERSONAS = {
  villain: {
    label: '빌런 — 여유롭고 후회 없는',
    guide: `1인칭. 이미 이긴 사람의 말투로 씁니다.
- 변명하거나 설명하지 않습니다. 이해받으려 하지 않습니다.
- 후회하지 않습니다. 자조도 하지 않습니다. 자기 선택을 담담하게 말합니다.
- 남의 시선을 신경 쓰지 않습니다. 판단은 듣는 사람 몫으로 남깁니다.
- 감정을 눌러 담지 말고, 아무렇지 않게 내놓습니다. 그게 더 서늘합니다.
- 상대를 미워하지 않습니다. 미움은 아직 마음이 남아 있다는 뜻입니다.
- 소리치지 않습니다. 가장 위험한 말일수록 조용하게.`,
  },
  confessional: {
    label: '고백 — 담백하고 관조적인',
    guide: `1인칭. 새벽에 혼잣말하듯 씁니다.
- 담백하고 절제된 어조. 솔직하되 과잉되지 않습니다.
- 자조적이되 징징대지 않습니다.
- 감정을 눌러 담은 말투로, 말을 아낍니다.
- 편지를 읽듯 조용하게.`,
  },
  observer: {
    label: '관찰 — 한 발 물러선',
    guide: `장면을 밖에서 바라보는 시점으로 씁니다.
- 인물의 행동만 적고 속마음은 적지 않습니다.
- 판단하지 않습니다. 카메라처럼 담담하게.
- 마지막 한 줄에서만 시점을 안으로 들여도 좋습니다.`,
  },
  defiant: {
    label: '반항 — 맞서는',
    guide: `1인칭. 정면으로 맞서는 말투로 씁니다.
- 물러서지 않습니다. 상대에게 직접 말을 겁니다.
- 분노를 설명하지 말고 행동으로 보여 줍니다.
- 후렴에서 한 번은 크게 터뜨립니다.`,
  },
};

/**
 * 인트로가 곡의 첫인상을 결정합니다.
 * 같은 스타일로 여러 곡을 뽑으면 인트로가 가장 먼저 똑같아지므로,
 * 곡마다 다른 방식으로 시작하게 돌려 가며 지정합니다.
 */
/**
 * 인트로를 어떻게 다룰지.
 *
 * 플레이리스트로 이어 들을 때는 인트로가 짧은 편이 좋습니다.
 * 곡마다 전주가 길고 서로 다르면 흐름이 계속 끊깁니다.
 * 대신 편곡과 템포에서 변화를 주면 지루하지 않으면서도 이어집니다.
 */
export const INTRO_MODES = {
  none: {
    label: '전주 없이 바로',
    bars: '0',
    tag: 'Cold Open, No Intro, Straight Into The Vocal',
    style: 'The track begins immediately on the first vocal line with no introduction at all.',
    guide: '모든 곡이 첫 소절부터 바로 시작합니다. 전주를 넣지 않습니다.',
  },
  short: {
    label: '짧게 (4마디)',
    bars: '4',
    tag: 'Short Intro, 4 Bars Only',
    style: 'The track opens with a brief four-bar introduction, vocals entering within the first eight seconds.',
    guide: '모든 곡의 전주를 4마디로 맞춥니다. 8초 안에 보컬이 들어옵니다.',
  },
  normal: {
    label: '보통 (8마디)',
    bars: '8',
    tag: 'Eight Bar Intro, Builds Into The Verse',
    style: 'The track opens with an eight-bar introduction that builds into the first verse.',
    guide: '모든 곡의 전주를 8마디로 맞춥니다.',
  },
  vary: {
    label: '곡마다 다르게',
    guide: '곡마다 다른 방식으로 시작합니다. 낱곡으로 들을 때 좋습니다.',
  },
};

/**
 * 짧은 인트로 안에서도 색깔은 조금씩 다르게 합니다.
 * 길이는 같게 유지하되 무엇이 먼저 들리는지만 바꾸는 것입니다.
 */
const SHORT_OPENERS = [
  ['한 악기만', 'a single instrument alone'],
  ['드럼만', 'drums alone'],
  ['화성만', 'sustained chords with no rhythm'],
  ['보컬 허밍', 'a short wordless vocal figure'],
  ['베이스만', 'the bass line alone'],
  ['공간음', 'a brief atmospheric texture'],
];

const INTRO_TYPES = [
  {
    ko: '악기 없이 보컬 한 줄로 시작',
    tag: 'A Cappella Opening, Voice Alone, No Instruments',
    open: 'The track opens with an unaccompanied vocal line, completely dry and alone, before any instrument enters.',
  },
  {
    ko: '드럼이 먼저 들어오고 나머지가 쌓임',
    tag: 'Drums First, Solo Groove, Instruments Layer In',
    open: 'The track opens with drums alone establishing the groove, other instruments layering in one at a time.',
  },
  {
    ko: '전주 없이 첫 소절부터 바로',
    tag: 'Cold Open, Straight Into The Verse, No Intro',
    open: 'The track begins immediately on the first vocal line with the full band already playing, no introduction at all.',
  },
  {
    ko: '한 악기의 짧은 솔로로 시작',
    tag: 'Solo Instrument Motif, Unaccompanied Melodic Figure',
    open: 'The track opens with a single unaccompanied instrument playing a short melodic motif, everything else silent.',
  },
  {
    ko: '분위기 소리가 천천히 차오름',
    tag: 'Ambient Swell Rising From Silence, Slow Build',
    open: 'The track opens from near silence with an ambient texture slowly swelling in, taking time before the beat arrives.',
  },
  {
    ko: '화성만 깔리다 비트가 들어옴',
    tag: 'Sustained Pads Only, Beat Drops After Four Bars',
    open: 'The track opens with sustained harmonic pads and no rhythm, the beat dropping in only after several bars.',
  },
  {
    ko: '후렴 훅을 먼저 짧게 들려줌',
    tag: 'Chorus Hook Teased First, Then Pulls Back',
    open: 'The track opens by teasing the chorus hook briefly, then pulling back to a sparse arrangement for the verse.',
  },
  {
    ko: '말하듯 읊는 한 줄로 시작',
    tag: 'Spoken Word Line, No Melody, Sparse Backing',
    open: 'The track opens with a spoken, unsung line over minimal backing before the melody begins.',
  },
  {
    ko: '리듬 악기 하나가 반복되며 시작',
    tag: 'Single Percussive Loop, Hypnotic Repetition',
    open: 'The track opens with one percussive element looping alone, hypnotic and bare, drawing the listener in.',
  },
  {
    ko: '큰 소리로 터뜨리고 시작',
    tag: 'Full Band Hit, Immediate Impact, Then Space',
    open: 'The track opens with a single full-band hit, then drops into open space before the verse.',
  },
];


/** 실제 보컬이 흘려 부르는 발음 표기입니다. 영어 가사에서만 씁니다. */
const MUMBLE_RULES = `I don't know → I dunno, want to → wanna, going to → gonna,
got you → gotchu, let me → lemme, give me → gimme, kind of → kinda,
because → cuz, about → bout, -ing → -in (runnin, feelin),
nothing → nothin, probably → prolly`;

const S = {
  str: { type: 'STRING' },
  strList: { type: 'ARRAY', items: { type: 'STRING' } },
  objList: (props) => ({
    type: 'ARRAY',
    items: { type: 'OBJECT', properties: props, required: Object.keys(props) },
  }),
};

function obj(props) {
  return { type: 'OBJECT', properties: props, required: Object.keys(props) };
}

/* ────────────────────────────────
   1. 채널 기획
──────────────────────────────── */
export function channelPlan({ concept, target, genres }) {
  return {
    temperature: 1,
    maxOutputTokens: 8000,
    thinkingLevel: 'medium',
    prompt: `당신은 유튜브 음악 큐레이션 채널을 만들어 온 컨설턴트입니다.
아래 조건으로 신규 채널의 종합 기획안을 짜 주세요.

[조건]
- 채널 컨셉과 분위기: ${concept}
- 타겟 시청자: ${target || '지정 없음 — 컨셉에 가장 잘 맞는 층을 직접 골라 제안하세요'}
- 다룰 음악 장르: ${genres || '지정 없음 — 컨셉에 맞게 제안하세요'}

[작성 지침]
- 모든 답변을 한국어로 씁니다. 채널명 후보만 한글과 영어를 섞어도 됩니다.
- 일반론 말고 이 컨셉에서만 나올 수 있는 내용으로 씁니다.
- 실행할 수 있게 구체적으로 씁니다. "꾸준히 올리세요" 같은 문장은 쓰지 않습니다.

[담을 내용]
- channelNames: 채널명 후보 5개. 짧고 검색으로 찾기 쉬운 이름.
- tagline: 채널을 한 줄로 설명하는 슬로건.
- description: 채널 소개글. 200자 안팎.
- usp: 비슷한 채널과 뭐가 다른지 3가지. 각각 한 줄.
- contentSeries: 정기적으로 밀고 갈 시리즈 5개. 제목과 설명.
- uploadStrategy: 업로드 주기와 요일·시간. 왜 그 시간인지까지.
- titleFormulas: 영상 제목 공식 5개. 실제로 쓸 수 있는 한국어 예시를 함께.
- thumbnailDirection: 썸네일 디자인 방향.
- growthTips: 구독자 0명에서 시작할 때의 초기 전략 5개.
- monetizationIdeas: 수익화 아이디어 4개.

JSON만 출력합니다.`,
    schema: obj({
      channelNames: S.strList,
      tagline: S.str,
      description: S.str,
      usp: S.strList,
      contentSeries: S.objList({ title: S.str, desc: S.str }),
      uploadStrategy: S.str,
      titleFormulas: S.objList({ formula: S.str, example: S.str }),
      thumbnailDirection: S.str,
      growthTips: S.strList,
      monetizationIdeas: S.strList,
    }),
  };
}

/* ────────────────────────────────
   2. 레퍼런스 채널 분석
──────────────────────────────── */
export function referenceAnalysis({ channel, stats, titles, topVideos }) {
  return {
    temperature: 0.8,
    maxOutputTokens: 6000,
    thinkingLevel: 'medium',
    prompt: `당신은 유튜브 음악 채널을 분석해 온 전문가입니다.
아래 채널의 실제 데이터를 보고, 이 니치에서 통하는 공식을 찾아 주세요.

[채널]
- 이름: ${channel.name}
- 소개: ${(channel.description || '').slice(0, 400)}
- 구독자: ${stats.subscribers.toLocaleString()}명
- 총 영상: ${stats.totalVideos}개

[수집한 영상 ${stats.sampleSize}개의 통계]
- 평균 길이: ${stats.avgDurationText}
- 평균 조회수: ${Math.round(stats.avgViews).toLocaleString()}회
- 조회수 중앙값: ${Math.round(stats.medianViews).toLocaleString()}회
- 평균 업로드 간격: ${stats.avgGapDays}일

[제목 목록]
${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

[조회수 상위 10개]
${topVideos.map((v, i) => `${i + 1}. "${v.title}" — ${v.views.toLocaleString()}회, ${v.durationText}`).join('\n')}

[분석 지침]
- 모든 답변을 한국어로 씁니다. 장르는 영문명을 괄호로 함께 적습니다.
- 평균만 보지 말고 상위 영상과 하위 영상의 차이에서 원인을 찾으세요.
- 조회수가 0에 가까운 영상이 섞여 있으면 그 이유도 짚어 주세요.

[담을 내용]
- genreEstimate: 장르 추정. 예) "여성 보컬 Lo-fi 발라드 (Lo-fi, Ballad)"
- moodEstimate: 무드 추정.
- bpmEstimate: BPM 범위와 설명. 예) "70-90 BPM (느린 템포)"
- thumbnailStyle: 썸네일 스타일 패턴.
- titlePattern: 제목 패턴. 이모지, 길이, 반복되는 키워드까지.
- viewPattern: 어떤 영상이 터지고 어떤 영상이 묻히는지.
- successFormula: 이 니치의 성공 공식 5개. 바로 따라 할 수 있게.
- copyableElements: 내 채널에 그대로 옮겨 볼 요소 5개.

JSON만 출력합니다.`,
    schema: obj({
      genreEstimate: S.str,
      moodEstimate: S.str,
      bpmEstimate: S.str,
      thumbnailStyle: S.str,
      titlePattern: S.str,
      viewPattern: S.str,
      successFormula: S.strList,
      copyableElements: S.strList,
    }),
  };
}

/* ────────────────────────────────
   3. 비주얼 팔레트
──────────────────────────────── */
export function visualPalette({ concept, moods, target }) {
  return {
    temperature: 1,
    maxOutputTokens: 6000,
    thinkingLevel: 'medium',
    prompt: `당신은 음악 유튜브 채널의 브랜드 디자이너입니다.
아래 컨셉의 채널이 쓸 비주얼 가이드를 만들어 주세요.

[조건]
- 컨셉: ${concept}
- 무드: ${moods || '컨셉에 맞게 직접 정하세요'}
- 타겟: ${target || '지정 없음'}

[작성 지침]
- profilePrompt만 영어로 쓰고, 나머지는 전부 한국어로 씁니다.
- 색은 실제로 화면에서 같이 놓았을 때 어울리는 조합으로 고릅니다.
- 폰트는 한국어 지원이 되는 것으로 추천합니다.

[담을 내용]
- channelNameIdeas: 컨셉에 맞는 채널명 5개. 한글·영어 섞어도 됩니다.
- profileConcept: 프로필 이미지를 어떤 그림으로 만들면 좋을지 한국어 설명.
- profilePrompt: 그 이미지를 만들기 위한 영문 프롬프트. Midjourney나 DALL-E에 그대로 넣을 수 있게.
- colorPalette: 색 5개 — 메인 1, 서브 2, 강조 1, 배경 1. 각각 hex 코드와 한국어 이름, 어디에 쓸지.
- fontSuggestions: 한국어 폰트 3개. 이름과 무드, 쓰일 자리.
- thumbnailLayouts: 썸네일 레이아웃 3가지. 이름과 설명.
- visualKeywords: 영상에 자주 쓸 비주얼 키워드 8개. 예) "비 내리는 창문", "네온 사인"

JSON만 출력합니다.`,
    schema: obj({
      channelNameIdeas: S.strList,
      profileConcept: S.str,
      profilePrompt: S.str,
      colorPalette: S.objList({ hex: S.str, name: S.str, usage: S.str }),
      fontSuggestions: S.objList({ name: S.str, mood: S.str, usage: S.str }),
      thumbnailLayouts: S.objList({ name: S.str, desc: S.str }),
      visualKeywords: S.strList,
    }),
  };
}

/* ────────────────────────────────
   4. 음악 만들기 (가사 + Suno 스타일)
──────────────────────────────── */

/**
 * 목표 길이별 구성. 역할과 줄 수만 정하고, 실제 태그 문구는
 * 장르·악기에 맞춰 모델이 영어로 지어내게 합니다.
 */
/**
 * 목표 길이별 구성.
 *
 * 곡 길이는 결국 부르는 음절 수가 결정합니다.
 * 영어는 한 줄에 대략 9~11음절, 노래는 분당 100음절 안팎으로 부릅니다.
 * 그래서 3분 30초면 가사만 350음절, 즉 35~40줄이 필요합니다.
 *
 * 범위를 주면 모델이 늘 최소치를 고르기 때문에, 구간마다 정확한 줄 수를 지정합니다.
 * 연주 구간은 가사 없이 시간을 채우므로 길이 확보에 함께 씁니다.
 */
/**
 * 곡의 뼈대를 어떤 순서로 놓을지.
 *
 * 요즘은 후렴을 먼저 들려주고 시작하는 구성이 많습니다.
 * 첫 몇 초에 훅을 던져야 넘기지 않기 때문입니다.
 * 다만 후렴이 여러 번 나오게 되므로, 매번 가사 전문을 다시 적어야
 * Suno가 반복으로 보고 곡을 줄이지 않습니다.
 */
export const SONG_FORMS = {
  standard: {
    label: '기본 (벌스 먼저)',
    note: '천천히 쌓아 올려 후렴에서 터뜨리는 구성입니다.',
  },
  chorusFirst: {
    label: '도입부 코러스',
    note: '후렴을 먼저 들려주고 시작합니다. 첫 몇 초에 훅이 나옵니다.',
  },
};

const SONG_STRUCTURES = {
  '2:00': {
    totalLines: 19,
    sections: [
      ['Intro', '가사 없이 태그만. 8마디 정도의 짧은 전주'],
      ['Verse 1', '정확히 6줄'],
      ['Chorus', '정확히 5줄 · 1행과 5행은 훅 원문 그대로'],
      ['Verse 2', '정확히 6줄'],
      ['Chorus', '후렴 전문을 그대로 다시'],
      ['Outro', '정확히 3줄'],
    ],
  },
  '2:30': {
    totalLines: 25,
    sections: [
      ['Intro', '가사 없이 태그만'],
      ['Verse 1', '정확히 6줄'],
      ['Pre-Chorus', '정확히 4줄'],
      ['Chorus', '정확히 5줄 · 1행과 5행은 훅 원문 그대로'],
      ['Verse 2', '정확히 6줄'],
      ['Chorus', '후렴 전문을 그대로 다시'],
      ['Outro', '정확히 4줄'],
    ],
  },
  '3:00': {
    totalLines: 30,
    sections: [
      ['Intro', '가사 없이 태그만'],
      ['Verse 1', '정확히 6줄'],
      ['Pre-Chorus', '정확히 4줄'],
      ['Chorus', '정확히 5줄 · 1행과 5행은 훅 원문 그대로'],
      ['Verse 2', '정확히 6줄'],
      ['Pre-Chorus', '앞과 다른 가사로 정확히 4줄'],
      ['Chorus', '후렴 전문을 그대로 다시'],
      ['Outro', '정확히 4줄'],
    ],
  },
  '3:30': {
    totalLines: 36,
    sections: [
      ['Intro', '가사 없이 태그만'],
      ['Verse 1', '정확히 7줄'],
      ['Pre-Chorus', '정확히 4줄'],
      ['Chorus', '정확히 5줄 · 1행과 5행은 훅 원문 그대로'],
      ['Verse 2', '정확히 7줄'],
      ['Pre-Chorus', '앞과 다른 가사로 정확히 4줄'],
      ['Chorus', '후렴 전문을 그대로 다시'],
      ['Bridge', '정확히 5줄. 여기서 판을 한 번 뒤집습니다'],
      ['Chorus', '후렴 전문을 그대로 다시. 마지막 줄 뒤에 추임새 한 줄 더'],
      ['Outro', '정확히 4줄'],
    ],
  },
  '4:00': {
    totalLines: 43,
    sections: [
      ['Intro', '가사 없이 태그만. 조금 긴 전주'],
      ['Verse 1', '정확히 7줄'],
      ['Pre-Chorus', '정확히 4줄'],
      ['Chorus', '정확히 5줄 · 1행과 5행은 훅 원문 그대로'],
      ['Verse 2', '정확히 7줄'],
      ['Pre-Chorus', '앞과 다른 가사로 정확히 4줄'],
      ['Chorus', '후렴 전문을 그대로 다시'],
      ['Instrumental Solo', '가사 없이 태그만. 16마디 정도의 간주'],
      ['Bridge', '정확히 5줄. 여기서 판을 한 번 뒤집습니다'],
      ['Chorus', '후렴 전문을 그대로 다시. 마지막 줄 뒤에 추임새 한 줄 더'],
      ['Outro', '정확히 5줄'],
    ],
  },
};

/**
 * 도입부 코러스 구성.
 *
 * 후렴이 네다섯 번 나오므로 그만큼 벌스를 길게 잡아 총 줄 수를 맞춥니다.
 * 첫 후렴은 짧게 잘라 훅만 던지고, 이후 후렴은 전문으로 갑니다.
 */
const CHORUS_FIRST_STRUCTURES = {
  '2:00': {
    totalLines: 19,
    sections: [
      ['Chorus (짧게)', '후렴의 앞 3줄만. 훅만 던지고 넘어갑니다'],
      ['Verse 1', '정확히 6줄'],
      ['Chorus', '후렴 전문 5줄 · 1행과 5행은 훅 원문 그대로'],
      ['Verse 2', '정확히 6줄'],
      ['Outro', '후렴의 마지막 줄을 변주해 3줄'],
    ],
  },
  '2:30': {
    totalLines: 25,
    sections: [
      ['Chorus (짧게)', '후렴의 앞 3줄만'],
      ['Verse 1', '정확히 7줄'],
      ['Pre-Chorus', '정확히 4줄'],
      ['Chorus', '후렴 전문 5줄 · 1행과 5행은 훅 원문 그대로'],
      ['Verse 2', '정확히 7줄'],
      ['Outro', '정확히 4줄'],
    ],
  },
  '3:00': {
    totalLines: 30,
    sections: [
      ['Chorus (짧게)', '후렴의 앞 3줄만'],
      ['Verse 1', '정확히 7줄'],
      ['Pre-Chorus', '정확히 4줄'],
      ['Chorus', '후렴 전문 6줄 · 1행과 6행은 훅 원문 그대로'],
      ['Verse 2', '정확히 7줄'],
      ['Chorus', '후렴 전문을 그대로 다시'],
      ['Outro', '정확히 4줄'],
    ],
  },
  '3:30': {
    totalLines: 36,
    sections: [
      ['Chorus (짧게)', '후렴의 앞 4줄만. 훅을 먼저 던집니다'],
      ['Verse 1', '정확히 7줄'],
      ['Pre-Chorus', '정확히 4줄'],
      ['Chorus', '후렴 전문 6줄 · 1행과 6행은 훅 원문 그대로'],
      ['Verse 2', '정확히 7줄'],
      ['Pre-Chorus', '앞과 다른 가사로 정확히 4줄'],
      ['Chorus', '후렴 전문을 그대로 다시'],
      ['Bridge', '정확히 5줄. 여기서 판을 한 번 뒤집습니다'],
      ['Outro', '후렴을 반쯤 부르다 잦아들게. 정확히 3줄'],
    ],
  },
  '4:00': {
    totalLines: 43,
    sections: [
      ['Chorus (짧게)', '후렴의 앞 4줄만'],
      ['Verse 1', '정확히 8줄'],
      ['Pre-Chorus', '정확히 4줄'],
      ['Chorus', '후렴 전문 6줄 · 1행과 6행은 훅 원문 그대로'],
      ['Verse 2', '정확히 8줄'],
      ['Pre-Chorus', '앞과 다른 가사로 정확히 4줄'],
      ['Chorus', '후렴 전문을 그대로 다시'],
      ['Instrumental Solo', '가사 없이 태그만. 16마디 정도의 간주'],
      ['Bridge', '정확히 6줄'],
      ['Chorus', '후렴 전문을 그대로 다시'],
      ['Outro', '정확히 4줄'],
    ],
  },
};

const DENSITY = {
  light: '한 줄을 짧게. 여백이 느껴지게 씁니다.',
  normal: '보통 길이의 문장으로 씁니다.',
  rich: '이미지가 촘촘하게 씁니다. 구체적인 장면과 감각 묘사를 넣습니다.',
};

/**
 * 1단계 — 곡의 씨앗만 여러 개 뽑습니다.
 *
 * 왜 나눴는가:
 * 예전에는 5곡의 가사와 850자 스타일을 통째로 만든 뒤 4곡을 버렸습니다.
 * 버릴 것까지 다 쓰느라 토큰이 나갔고, 한 번에 여러 곡을 쓰다 보니
 * 곡 하나에 들이는 주의도 그만큼 얇아졌습니다.
 *
 * 그래서 먼저 짧게 씨앗만 뽑아 고르게 하고,
 * 고른 것만 2단계에서 온전히 씁니다. 토큰은 줄고 곡당 집중은 올라갑니다.
 */
/**
 * 주제에 맞는 분위기를 골라 줍니다.
 *
 * 왜 필요한가:
 * 분위기 필과 주제가 부딪히면 거의 언제나 분위기가 이깁니다.
 * '분노'라는 주제에 '여유로운 위협'이 켜져 있으면, 주제를 아무리 고쳐 써도
 * 여유롭게 위협하는 곡만 나옵니다. 화면에서는 둘이 멀찍이 떨어져 있어
 * 부딪히는 줄도 모른 채 계속 다시 만들게 됩니다.
 *
 * 그래서 주제를 읽고 맞는 것을 켜고, 부딪히는 것을 끕니다.
 * 고르는 일만 하므로 출력이 아주 짧습니다.
 */
export function moodPick({ concept, genres = '', options = [], current = [] }) {
  return {
    temperature: 0.4, // 고르는 일입니다. 폭이 넓을 이유가 없습니다.
    maxOutputTokens: 1200,
    thinkingLevel: 'low',
    prompt: `당신은 곡의 분위기를 정하는 음악 프로듀서입니다.
아래 주제에 맞는 분위기를 **주어진 목록 안에서만** 고르세요.

════════ 주제 ════════
${concept}
${genres ? `\n장르: ${genres}` : ''}

════════ 고를 수 있는 것 ════════
${options.join(' · ')}

${current.length ? `════════ 지금 켜져 있는 것 ════════\n${current.join(' · ')}\n` : ''}
════════ 판단 기준 ════════
- 주제가 말하는 **감정 상태 그대로**를 고르세요.
  분노가 주제면 분노가 들리는 분위기를 켭니다. 분노를 지켜보는 분위기가 아닙니다.
- 3~5개면 충분합니다. 많이 켤수록 서로를 지웁니다.
- 주제와 **정면으로 부딪히는 것**은 drop에 넣으세요.
  예를 들어 터지는 감정이 주제인데 여유롭거나 나른한 분위기가 켜져 있으면 꺼야 합니다.
- 목록에 없는 말은 만들어 내지 마세요. 글자 그대로 옮겨 적습니다.

════════ 낼 것 ════════
- pick: 켤 것. 목록에 있는 말 그대로.
- drop: 지금 켜져 있는 것 중 꺼야 할 것. 없으면 빈 배열.
- why: 왜 이렇게 골랐는지 한국어 한 줄. 부딪히는 게 있었다면 그걸 먼저 적으세요.

JSON만 출력합니다.`,
    schema: obj({
      pick: S.strList,
      drop: S.strList,
      why: S.str,
    }),
  };
}

/**
 * 주제를 읽고 음악 설정 전체를 한 번에 골라 줍니다.
 *
 * 왜 한 번에 부르는가:
 * 칸마다 따로 물으면 각자 주제만 보고 고르기 때문에
 * 장르는 트랩인데 악기는 어쿠스틱 기타인 조합이 나옵니다.
 * 설정끼리도 서로 맞아야 하므로 한 자리에서 같이 고르게 합니다.
 * 덤으로 호출도 한 번이면 끝납니다.
 *
 * 가사 언어와 곡 길이는 일부러 빼 두었습니다.
 * 그건 곡이 아니라 채널이 정하는 값입니다.
 */
export function settingsFit({ concept, fields = [], current = {} }) {
  const menu = fields
    .map((f) => `【${f.label}】${f.multi ? ' (여러 개)' : ' (하나)'}\n${f.options.join(' · ')}`)
    .join('\n\n');

  const now = fields
    .filter((f) => current[f.key]?.length)
    .map((f) => `- ${f.label}: ${current[f.key].join(', ')}`)
    .join('\n');

  return {
    temperature: 0.5, // 고르는 일입니다. 지어낼 필요가 없습니다.
    maxOutputTokens: 4000,
    thinkingLevel: 'low',
    prompt: `당신은 곡의 사운드를 설계하는 음악 프로듀서입니다.
아래 주제에 맞는 설정을 **주어진 목록 안에서만** 고르세요.

════════ 주제 ════════
${concept}

${now ? `════════ 지금 켜져 있는 것 ════════\n${now}\n\n` : ''}════════ 고를 수 있는 것 ════════
${menu}

════════ 판단 기준 ════════
- 주제가 말하는 **감정 상태 그대로**를 고르세요.
  터지는 감정이 주제면 터지는 소리를 고릅니다. 그걸 지켜보는 소리가 아닙니다.
- **설정끼리도 서로 맞아야 합니다.** 장르와 악기와 보컬과 템포가 한 곡에서
  같이 울립니다. 따로따로 고르지 말고 하나의 소리를 떠올리며 고르세요.
- 여러 개 고를 수 있는 칸도 3~5개면 충분합니다. 많이 켤수록 서로를 지웁니다.
- 지금 켜져 있는 것이 주제와 부딪히면 과감히 바꾸세요.
  다만 주제와 잘 맞는 것은 그대로 두어도 됩니다.
- 목록에 없는 말은 만들어 내지 마세요. 글자 그대로 옮겨 적습니다.

════════ 낼 것 ════════
각 칸마다 고른 것을 담고, 왜 그렇게 골랐는지 한 줄 덧붙이세요.
- key: 칸 이름 (위 【】 안의 말이 아니라 아래 목록의 영문 key)
${fields.map((f) => `  ${f.key} = ${f.label}`).join('\n')}
- pick: 고른 것. 목록에 있는 말 그대로.
- why: 왜 이걸 골랐는지 한국어 한 줄. 짧게.

마지막에 summary로 이 설정이 어떤 소리가 될지 한국어 한 줄을 덧붙이세요.

JSON만 출력합니다.`,
    schema: obj({
      picks: S.objList({ key: S.str, pick: S.strList, why: S.str }),
      summary: S.str,
    }),
  };
}

/**
 * 영어 가사를 화자에 맞춰 한국어로 옮깁니다.
 *
 * 시각은 이 함수가 만들지 않습니다.
 * 캡컷 자동 자막이 잡아 둔 시각을 그대로 두고 글자만 갈아 끼웁니다.
 * 번호와 글자만 주고받으므로 시각이 밀릴 여지가 없습니다.
 *
 * 자동 자막은 노래를 받아쓴 것이라 글자가 자주 틀립니다.
 * 그래서 정확한 가사 원문을 함께 넘겨 짝을 맞추게 합니다.
 */
export function lyricsSubtitle({ blocks, lyrics, concept = '', persona = 'villain' }) {
  const p = PERSONAS[persona] || PERSONAS.villain;
  const list = blocks.map((b, i) => `${i + 1}. ${b.text.replace(/\n/g, ' ')}`).join('\n');

  return {
    temperature: 0.8,
    maxOutputTokens: 6000,
    thinkingLevel: 'medium',
    prompt: `당신은 노래 가사를 우리말로 옮기는 번역가입니다.
아래 자막 한 칸마다 한국어 한 줄을 냅니다.

════════ 이 곡의 화자 ════════
${concept ? concept + '\n' : ''}
${p.guide}

**이 화자의 말투로 옮기세요.** 사전적 번역이 아닙니다.
같은 뜻이라도 이 사람이 할 법한 말로 바꿔야 합니다.

════════ 어떻게 옮기나 ════════
- **낮춤말로 씁니다.** 존댓말이나 설명하는 어투가 섞이면 힘이 죽습니다.
- 직역해서 어색하면 뜻을 살려 다시 쓰세요. 노래는 문서가 아닙니다.
- 한 줄은 한 호흡입니다. 화면에 뜨는 순간 읽혀야 하므로 **20자 안쪽**으로.
- 되풀이되는 훅은 **매번 똑같이** 옮기세요. 조금씩 바꾸면 훅이 아니게 됩니다.
- 영어 낱말을 그대로 두지 마세요. 고유명사만 예외입니다.
- 추임새(yeah, uh, ooh)는 옮기지 말고 빈 문자열로 두세요.

════════ 정확한 가사 원문 ════════
자동 받아쓰기라 아래 자막의 글자가 틀려 있을 수 있습니다.
이 원문에서 맞는 줄을 찾아 그 뜻으로 옮기세요.

${lyrics}

════════ 옮길 자막 ${blocks.length}칸 ════════
${list}

════════ 낼 것 ════════
- n: 칸 번호 (위 번호 그대로)
- en: 그 칸에 해당하는 **가사 원문의 영어 한 줄**.
  자동 받아쓰기가 틀린 것을 원문의 맞는 줄로 바로잡는 자리입니다.
  원문에서 찾지 못하면 자막에 적힌 그대로 두세요.
  구간 태그([Verse 1] 등)와 추임새만 있는 칸은 빈 문자열.
- ko: 그 칸의 한국어 한 줄. 옮길 것이 없으면 빈 문자열.

**${blocks.length}칸 전부 내세요.** 번호를 건너뛰거나 합치지 마세요.
시각은 적지 마세요. JSON만 출력합니다.`,
    schema: obj({ lines: S.objList({ n: S.str, en: S.str, ko: S.str }) }),
  };
}

export function songSeeds({
  genres, language, moods, concept, persona = 'villain',
  seedCount = 5, avoidTitles = [], referenceStyle = null, seriesNote = '',
}) {
  const p = PERSONAS[persona] || PERSONAS.villain;

  return {
    temperature: 1.25, // 씨앗 단계는 폭이 넓어야 고를 맛이 납니다.
    maxOutputTokens: 3000,
    thinkingLevel: 'low',
    prompt: `당신은 Suno AI로 발매되는 곡을 만들어 온 작사가입니다.
아직 가사를 쓰지 마세요. **어떤 곡을 쓸지 후보 ${seedCount}개**만 냅니다.

════════ 조건 ════════
- 주제: ${concept}
- 장르: ${genres}
- 분위기: ${moods}
- 가사 언어: ${language}

════════ 화자 ════════
${p.guide}
${seriesNote ? `\n════════ 시리즈 ════════\n${seriesNote}\n` : ''}${
      referenceStyle ? `\n════════ 레퍼런스 사운드 ════════\n${referenceStyle}\n` : ''
    }
════════ 후보 ${seedCount}개는 서로 달라야 합니다 ════════
같은 주제라도 **벌어지는 일**을 다르게 잡으세요.
비슷한 후보 다섯 개는 하나만 있는 것과 같습니다.
장면이 다르면 훅도 달라집니다. 훅 다섯 개가 비슷하면 후보도 하나뿐인 셈입니다.

════════ 구경하지 마세요 ════════
이게 가장 자주 어긋나는 지점입니다.

화자는 **그 일을 겪는 중인 사람**입니다. 밖에서 지켜보는 사람이 아닙니다.
"불타는 걸 바라본다", "무너지는 소리를 듣는다", "파편을 감상한다" —
이런 건 전부 틀렸습니다. 아름답게 들리지만 남의 일입니다.

화자가 하는 일을 쓰세요. 지르고, 붙잡고, 던지고, 따지고, 묻습니다.
감정을 **묘사하지 말고 그 감정 상태에서 말하게** 하세요.

- 틀림: 분노를 바라보는 사람의 시선
- 맞음: 지금 소리치는 중인 사람이 뱉는 말

════════ 장면을 바꾸는 방법 ════════
주제 안에서 서로 다른 **순간**을 골라내세요.
어떤 순간이 있을지는 주제가 정합니다. 아래는 갈래를 나누는 축일 뿐입니다.

- 무슨 일이 벌어지는 중인가 (터지기 직전 / 터지는 중 / 터지고 난 직후)
- 누구와 있는가 (상대 앞 / 여럿 앞 / 아무도 없는 데)
- 무엇을 하고 있는가 (몸으로 하는 구체적인 행동 하나)

════════ 후보마다 담을 것 ════════
- title: 제목. 20자 안쪽. 가사에 그대로 나오는 문장은 피합니다.
- scene: **지금 벌어지는 중인 일.** 한국어 한 줄, 현재진행으로 씁니다.
  화자가 어디서 무엇을 하고 있는지 적으세요. 태도나 시선을 적지 마세요.
  (틀림: 담담하게 회상하는 각도 / 맞음: 상대 멱살을 쥔 채 대답을 기다린다)
- to: **누구에게 하는 말인가.** 한국어 몇 글자. (상대 / 나 자신 / 듣는 사람 / 세상)
- hook: 후렴에서 **글자 그대로 되풀이될** 말. (${language})
  문장이어도 되고, 단어 하나를 붙여 되풀이해도 되고, 뜻 없는 소리여도 됩니다.
  (예: I closed the door / Runaway, runaway, runaway / Na na na)
  4~7음절로 짧게. 한 호흡에 따라 부를 수 있어야 합니다.
  이 말 하나로 곡이 기억됩니다. 설명하지 말고, 귀에 걸리게 쓰세요.
- opening: 곡의 첫 줄. 실제 가사 문장으로 (${language}).
  **누군가에게 건네는 말이거나, 화자가 하는 행동입니다.**
  Watch / See / Hear 처럼 풍경을 가리키며 시작하지 마세요.
- soundNote: 어떤 소리로 갈지 한국어 한 줄. (예: 느린 808에 현악, 속삭이는 보컬)

가사 전문이나 스타일 프롬프트는 쓰지 마세요. 위 다섯 가지만 냅니다.
JSON만 출력합니다.`,
    schema: obj({
      seeds: S.objList({
        title: S.str,
        scene: S.str,
        to: S.str,
        hook: S.str,
        opening: S.str,
        soundNote: S.str,
      }),
    }),
  };
}

export function songWriting({
  genres, language, vocal, tempo, moods, era, situations, instruments, concept,
  duration = '3:30', songCount = 1,
  density = 'normal', adlibs = true, negativeTags = false, reference = '',
  avoidTitles = [], referenceStyle = null,
  mumbling = false, rhyme = true, minimal = false,
  persona = 'villain', anchor = true,
  variety = true, batchSeed = 0, introMode = 'short', form = 'standard',
  referenceFirst = false, introInStyle = false, seed = null,
}) {
  const chorusFirst = form === 'chorusFirst';
  const table = chorusFirst ? CHORUS_FIRST_STRUCTURES : SONG_STRUCTURES;
  const plan = table[duration] || table['3:30'];
  const structure = plan.sections;
  const isInstrumental = language === 'instrumental';
  const lyricLang = isInstrumental ? '연주 지시문' : language;

  return {
    temperature: 1.15,
    maxOutputTokens: 9000 * Math.max(1, songCount),
    thinkingLevel: 'medium',
    prompt: `당신은 Suno AI로 실제 발매되는 곡을 만들어 온 작사가입니다.
한 번에 노래 ${songCount}곡을 만들어 주세요.
곡마다 가사와 전용 스타일 프롬프트를 함께 냅니다.

════════ 조건 ════════
- 장르: ${genres}
- 가사 언어: ${isInstrumental ? '없음 (연주곡)' : language}
- 보컬: ${vocal}
- 템포: ${tempo}
- 분위기: ${moods}
- 시대감: ${era}
- 듣는 상황: ${situations || '지정 없음'}
- 주요 악기: ${instruments || '장르에 맞게 알아서'}
- 목표 길이: 약 ${duration}
- 주제: ${concept}

${seed
      ? `════════ 이 곡은 이미 정해졌습니다 — 아래를 그대로 쓰세요 ════════
고르기가 끝난 후보입니다. 방향을 새로 잡지 말고 이걸 완성하세요.

- 제목: ${seed.title}
- 지금 벌어지는 일: ${seed.scene}
- 누구에게 하는 말: ${seed.to}
- 후렴 훅: ${seed.hook}
- 첫 줄: ${seed.opening}
- 소리: ${seed.soundNote}

**후렴 훅과 첫 줄은 위 문장을 그대로 씁니다.** 다듬는 정도는 괜찮지만 갈아엎지 마세요.
제목도 위 것을 씁니다. 이 장면 밖으로 나가지 않습니다.

곡 전체가 **그 장면 안에서** 일어납니다. 지나간 일로 돌리지 마세요.
화자는 그 일을 겪는 중이고, 위에 적힌 상대에게 말하고 있습니다.
스타일 프롬프트는 위 '소리'를 출발점으로 삼아 규격에 맞게 살을 붙입니다.

`
      : ''}${referenceStyle
      ? `════════ 레퍼런스 사운드 — 이 소리에 맞추세요 ════════
아래는 사용자가 목표로 삼는 레퍼런스를 분석한 결과입니다.
${referenceFirst
      ? `**이 레퍼런스가 기준입니다.** 위쪽 조건 목록보다 이쪽을 먼저 따르세요.
장르·보컬·템포·악기가 위 조건과 다르면 **레퍼런스 쪽을 씁니다.**
위 조건은 참고로만 두고, 스타일 프롬프트는 이 레퍼런스의 소리를 재현하도록 씁니다.
가사의 정서와 구조 태그의 연주 지시도 이 사운드에 맞춥니다.`
      : `가사의 정서와 구조 태그의 연주 지시를 **이 사운드에 맞춰** 쓰세요.
위에 적힌 조건과 충돌하면 위의 조건을 따르되, 나머지는 레퍼런스 쪽으로 기울입니다.`}

${referenceStyle}

`
      : ''}════════ 구조 태그 — 여기가 곡의 완성도를 가릅니다 ════════
Suno는 대괄호 태그를 읽고 그 구간의 편곡을 실제로 바꿉니다.
그래서 [Verse] 처럼 역할만 적으면 안 되고, **그 구간을 어떻게 연주할지 영어로 함께 적어야** 합니다.

형식: [역할 - 영어 연주 지시]

이렇게 씁니다:
  [Intro - Upbeat Electro-Swing, Big Brass, Exciting Drum Roll]
  [Verse 1 - Bouncy Rhythm, Playful Female Vocals, Groovy Bass]
  [Pre-Chorus - Rising Energy, Sparkling Synths, Building Up]
  [Chorus - Explosive Hook, High-Energy Brass, Dance Beat]
  [Bridge - Playful Trumpet Solo, Rhythmic Vocals, Funky]
  [Outro - Grand Theatrical Finale, Fading Applause]

이렇게 쓰면 안 됩니다:
  [verse]   [chorus]   [intro]

연주 지시에는 위에 적힌 장르·악기·분위기를 녹여 넣고, 구간마다 다르게 씁니다.
1절과 2절도 에너지가 달라지도록 지시를 바꿉니다.

${chorusFirst
      ? `════════ 후렴으로 시작하는 곡입니다 ════════
이 곡은 전주 없이 **후렴부터** 시작합니다. 첫 몇 초 안에 훅이 나와야 합니다.

- 첫 구간의 태그를 이렇게 씁니다:
  [Chorus - Cold Open, Hook Upfront, Full Energy From The First Bar]
${introInStyle
        ? `- 스타일 프롬프트에는 이 문장을 넣습니다:\n  The track opens cold on the chorus hook at full energy, no build-up, no introduction.`
        : '- 스타일에는 인트로 이야기를 넣지 않습니다. 태그로만 지정합니다.'}
- 첫 후렴은 **뒤에 나오는 후렴보다 짧게** 자릅니다. 훅만 던지고 벌스로 내려갑니다.
- 첫 후렴에서 편성을 다 쓰지 마세요. 뒤의 후렴이 더 커져야 곡이 살아납니다.
  첫 후렴은 조금 덜어 낸 편성으로, 뒤의 후렴에서 꽉 채웁니다.

**후렴이 여러 번 나오지만 매번 가사 전문을 다시 적습니다.**
"반복"이라고 적거나 생략하면 Suno가 곡을 짧게 끝내 버립니다.

`
      : ''}${chorusFirst ? '' : (() => {
      const mode = INTRO_MODES[introMode] || INTRO_MODES.short;

      // 곡마다 다르게 — 낱곡으로 들을 때 쓰는 방식입니다.
      if (introMode === 'vary') {
        return `════════ 곡마다 다르게 시작하기 ════════
**이번 ${songCount}곡은 서로 다른 방식으로 시작해야 합니다.**

${Array.from({ length: songCount }, (_, i) => {
  const t = INTRO_TYPES[(batchSeed + i) % INTRO_TYPES.length];
  return `${i + 1}곡째 — ${t.ko}\n   [Intro] 태그에 넣을 문구: ${t.tag}${introInStyle ? `\n   스타일에 넣을 문장: ${t.open}` : ''}`;
}).join('\n\n')}

${introInStyle
        ? `**두 곳에 모두 반영해야 실제로 다르게 들립니다.**
가사의 [Intro] 태그만 바꾸면 Suno가 무시하고 늘 하던 대로 시작합니다.`
        : `[Intro] 태그로만 지정합니다. 스타일에는 인트로 이야기를 넣지 마세요.`}

`;
      }

      // 전주를 짧게 맞추는 방식 — 플레이리스트용입니다.
      return `════════ 인트로는 짧게, 길이를 맞춥니다 ════════
${mode.guide}

플레이리스트로 이어 들을 때는 전주가 길면 흐름이 끊깁니다.
**${songCount}곡 모두 같은 길이의 인트로를 씁니다.**

[Intro] 태그에 이 문구를 넣습니다:
   ${mode.tag}

${introInStyle ? `스타일 프롬프트에 이 문장을 넣습니다:\n   ${mode.style}` : '스타일에는 인트로 이야기를 넣지 않습니다. 태그로만 지정합니다.'}

${introMode === 'none'
        ? '전주가 없으므로 [Intro] 구간에 가사를 쓰지 않고 바로 [Verse 1]로 넘어가도 됩니다.'
        : `${mode.bars}마디를 넘기지 마세요. Suno는 그냥 두면 전주를 길게 늘리는 버릇이 있습니다.
길이는 모두 같게 두되, **무엇이 먼저 들리는지만 곡마다 바꿉니다.**

${Array.from({ length: songCount }, (_, i) => {
  const o = SHORT_OPENERS[(batchSeed + i) % SHORT_OPENERS.length];
  return `${i + 1}곡째: ${o[0]}으로 시작 (opens with ${o[1]})`;
}).join('\n')}

이렇게 하면 길이는 일정해서 이어 듣기 좋고, 색깔만 조금씩 달라집니다.`}

`;
    })()}${variety
      ? `════════ 인트로 말고 다른 데서 변화 주기 ════════
인트로를 맞췄으니 지루해지지 않도록 아래를 곡마다 바꿉니다.

- **BPM을 서로 다르게** 잡습니다. 위 템포 범위 안에서 곡마다 5~10 정도 벌립니다.
- 후렴이 터지는 방식을 다르게 합니다. (갑자기 커지기 / 서서히 열리기 / 오히려 조용해지기)
- 아웃트로를 다르게 끝냅니다. (여운 남기기 / 뚝 끊기 / 페이드아웃)
- 편성의 중심 악기를 곡마다 바꿉니다.

`
      : ''}════════ 구간마다 하는 일이 다릅니다 ════════
- Verse 1 — 상황을 던져 놓습니다. 설명하지 말고 장면 하나로.
- Pre-Chorus — 한 단계 올립니다. 음절을 조금 촘촘하게.
- Chorus — 훅을 터뜨립니다. 아래 후렴 규칙을 그대로 따르세요.
- Verse 2 — 같은 감정을 다른 각도에서. 새 장면을 하나 더합니다.
- Bridge — 곡 전체에서 가장 솔직한 한두 줄. 여기서 판을 한 번 뒤집습니다.
- Outro — 답을 주지 말고 여운을 남깁니다.

**아웃트로 태그는 세 단으로 씁니다.** 한 번에 사라지면 흐지부지 끝납니다.
  1. 먼저 하나를 뺍니다      — drums drop out
  2. 남은 것을 뺍니다        — guitar and bass fade out
  3. 한 방으로 닫습니다      — final piano chord rings out

마지막 단이 없으면 곡이 닫히지 않고 그냥 작아지다 맙니다.
Final 로 시작하는 한 방을 반드시 넣으세요. 이 곡의 악기 중 하나로요.
  [Outro - Drums Drop Out, Then Bass Fades, Final Piano Chord Rings Out]

════════ 가사 줄 끝에 악기 신호 넣기 ════════
구조 태그가 **구간 전체**를 정한다면, 이건 **그 순간 하나**를 찍습니다.
가사 한 줄 끝에 대괄호로 악기 신호를 답니다.

  Your names are wiped clean from the marble floor [strings enter]
  I burned the bridge and locked the heavy door [bass slide]

지켜야 할 것 세 가지입니다.

1. **줄 끝에만.** 줄 중간에 넣으면 무시됩니다.
2. **두 줄에 하나 이하.** 촘촘하면 통째로 씹힙니다. 한 구간에 한두 개면 충분합니다.
3. **시작되는 것만.** 이게 제일 중요합니다.

   넣을 수 있음 — 그 순간 터지거나 들어오는 것
     [brass stabs] [guitar riff] [drum fill] [strings enter]
     [bass slide] [strings swell] [falsetto ad-lib] [full band enters]

   넣을 수 없음 — 빼거나, 남기거나, 사라지는 것
     [drums drop out] [bass and drums only] [fades out]
   이런 건 구간 전체의 상태라 한 줄에 못 붙입니다. 구조 태그에 쓰세요.

**여기 쓸 악기는 위 조건의 악기 목록에 이미 있어야 합니다.**
없는 악기를 줄 끝에서 부르면 Suno가 무시합니다.

대괄호는 지시이고, 소괄호는 실제로 불리는 가사입니다. 섞지 마세요.

════════ 후렴은 훅이 전부입니다 ════════
여기가 곡이 기억되느냐 마느냐를 가릅니다. 다른 어떤 규칙보다 먼저 지키세요.

**훅을 하나 정하세요.** 문장일 필요는 없습니다. 셋 중 아무 꼴이나 됩니다.

1. 한 문장 — I closed the door / 문은 내가 닫았어
2. 한 단어를 붙여 되풀이 — Runaway, runaway, runaway / 돌아와 돌아와
3. 뜻 없는 소리 — Na na na / Oh-oh-oh / Ey, ey

2번과 3번을 얕보지 마세요. 영어권 히트곡에서 가장 오래 남는 훅은
대개 뜻이 없거나 단어 하나입니다. 뜻이 얕을수록 따라 부르기 쉽습니다.

후렴을 쓸 때:
- **첫 줄은 훅입니다.** 뜸 들이지 않습니다. 후렴이 시작하자마자 훅이 나와야 합니다.
- **마지막 줄도 훅입니다.** 글자 하나 바꾸지 않고 첫 줄과 똑같이 적습니다.
- 사이에 있는 줄에서만 새 문장을 씁니다.
- 훅은 짧아야 합니다. 4~7음절. 한 호흡에 따라 부를 수 있어야 합니다.

**같은 말을 그대로 두 번 적는 것이 맞습니다.** 두 번째를 다른 말로 바꾸지 마세요.
바꾸면 훅이 아니라 그냥 가사가 됩니다.

훅을 후렴 밖에 따로 두고 싶으면 [Post-Chorus] 구간을 만들어
거기에 짧은 말만 되풀이해도 좋습니다.

후렴이 세 번 나오는 곡이면 훅은 최소 여섯 번 들립니다. 그래야 남습니다.
반복이 지루해 보여도 그대로 두세요. 듣는 사람은 가사를 읽지 않고 듣습니다.
${anchor
      ? `
════════ 열쇠말 ════════
훅과는 별개로, 곡 전체를 관통하는 단어나 짧은 구절을 하나 더 정하세요.
이건 후렴에 뭉치는 훅과 달리 **절과 브리지에 흩어 놓습니다.** 서너 번이면 충분합니다.
자리를 바꿔 가며, 매번 조금씩 다른 뜻으로 읽히게 하면 가장 좋습니다.
훅을 대신하는 것이 아니라 훅 밖에서 곡을 묶어 주는 역할입니다.`
      : ''}

════════ 이번 곡의 구성 ════════
${structure.map(([role, note], i) => `${i + 1}. [${role}] — ${note}`).join('\n')}

**가사 줄은 모두 합쳐 ${plan.totalLines}줄입니다.** (후렴 반복까지 세어서)
줄 수가 모자라면 곡이 목표보다 짧게 나옵니다. 위에 적힌 줄 수를 정확히 지켜 주세요.
한 줄은 8~12음절, 부를 때 한 호흡에 들어가는 길이로 씁니다.
너무 짧은 줄만 이어지면 곡이 빨리 끝납니다.

가사 본문은 ${lyricLang}로 씁니다. 태그와 연주 지시는 영어로 씁니다.
맨 끝에 [End] 를 넣어 곡을 닫습니다.

════════ 누가 부르는 노래인가 ════════
${(PERSONAS[persona] || PERSONAS.villain).guide}

════════ 부르지 않을 말은 대괄호에 넣습니다 ════════
Suno는 **소괄호 ( ) 안의 글자를 노래로 부릅니다.**
그래서 연출 지시를 소괄호에 넣으면 그대로 불려 버립니다.

부르지 않을 지시(악기, 분위기, 장면 묘사)는 반드시 **대괄호**에 영어로 넣습니다.
  이렇게: [Soft Piano Intro, Rain Ambience]
  이러면 안 됩니다: (비 내리는 골목, 피아노가 스며든다)

소괄호는 **실제로 부를 짧은 소리에만** 씁니다.
  코러스 따라 부르기: 다 깨부숴 (다 깨부숴)
  추임새: 소리 질러 (Hey!)
  허밍: (Oh-ooh)
이때도 한국어 설명문을 넣지 말고, 부를 수 있는 짧은 말만 넣습니다.

════════ 살아 있는 가사로 만드는 규칙 ════════
1. **훅을 만드세요.** 후렴 첫 줄이나 마지막 줄에 제목이 그대로 들어가는 짧고 외치기 좋은
   한 문장을 넣고, 후렴이 나올 때마다 똑같이 반복합니다.
2. **후렴은 매번 전문을 다시 씁니다.** "반복" 이라고 적으면 Suno가 무시하고 넘어갑니다.
3. ${adlibs
      ? `**추임새를 넣으세요.** (Hey!) (yeah) (uh) 같은 짧은 소리를 **문장이 끝난 뒤 빈 자리**에 놓습니다.
   말이 이어지는 중간에 끼워 넣지 마세요. 비트가 비는 곳에 얹는 것입니다.
   구간마다 한두 개면 충분합니다.`
      : '추임새나 구호는 넣지 않습니다. 가사만 담백하게 씁니다.'}
4. **장면의 소리는 대괄호 지시로 표현합니다.** 인트로와 아웃트로의 분위기는
   [Rain Ambience, Distant Traffic] 처럼 영어 대괄호로 적습니다. 한국어 설명문을 넣지 마세요.
5. **줄 수를 채우세요.** 위에 적힌 줄 수는 최소치입니다. 장면이 이어지면 한두 줄 더 씁니다.
6. ${
      isInstrumental
        ? '연주곡이므로 가사 대신 각 구간의 연주 흐름을 대괄호 지시로 적습니다.'
        : language === 'English'
          ? '가사는 영어로 씁니다. 번역투가 아니라 원어민이 실제로 쓰는 말로 씁니다. 어려운 단어를 쓰지 말고 짧은 단어를 고르세요.'
          : `가사는 ${language}로 쓰되, 훅이나 추임새에는 짧은 영어를 자연스럽게 섞어도 좋습니다.`
    }

${negativeTags || introMode === 'short' || introMode === 'none'
      ? `════════ 가사 맨 앞에 넣을 억제 태그 ════════
Suno는 그냥 두면 전주와 후주를 길게 늘리는 버릇이 있습니다.
아래 줄을 **가사 맨 처음에** 그대로 적어 넣으세요.

[no extended intro]
[no extended outro]${negativeTags ? `
[no humming]
[no vocalization]
[no repeated chorus]` : ''}

이 줄들은 부르는 가사가 아니라 Suno에게 주는 지시입니다.

`
      : ''}════════ 보여 주고, 말하지 않기 ════════
감정을 이름으로 부르지 마세요. 그 감정이 드러나는 **장면과 행동**을 쓰세요.

${language === 'English'
      ? `  이러면 안 됩니다: I'm so lonely tonight
  이렇게: phone face down on the sheets again

  이러면 안 됩니다: I miss you so much
  이렇게: still pour two cups in the mornin

lonely, sad, hurt, miss you, broken 같은 말은 되도록 쓰지 않습니다.`
      : `  이러면 안 됩니다: 너무 슬퍼서 견딜 수가 없어
  이렇게: 네 컵을 아직 못 치웠어

  이러면 안 됩니다: 나는 화가 났어
  이렇게: 문을 닫는 손에 힘이 들어갔다

"슬프다, 아프다, 그립다, 외롭다, 행복하다" 같은 말은 되도록 쓰지 않습니다.`}
대신 그 사람이 무엇을 보고 무엇을 하는지 씁니다.
후렴의 훅 한 줄만 예외로 감정을 직접 말해도 됩니다. 외쳐야 하는 자리이기 때문입니다.

${rhyme
      ? `════════ 라임과 리듬 ════════
- 후렴에 라임을 몰아 놓습니다. 절에서는 말맛을 우선합니다.
- 라임이 튀지 않고 흐름에 녹아들게 합니다. 같은 라임을 네 줄 넘게 이어 가지 않습니다.
- 반복은 두 번이면 귀에 감기고, 세 번이면 강하게 남습니다.
  네 번 넘게 반복할 때는 반드시 한 군데를 바꿉니다.
- 중요한 말을 마디 앞머리에 놓습니다. 조사나 접속사는 뒤로 뺍니다.
- 줄마다 음절 수를 비슷하게 맞춰 부르기 좋게 합니다.

`
      : ''}${minimal
      ? `════════ 여백 ════════
- 단문 위주로 씁니다. 한 줄에 하나의 장면만 담습니다.
- 주어를 생략해도 좋습니다. 문장이 끝나지 않아도 좋습니다.
- 말을 아끼는 것 자체가 기법입니다. 설명하려 들지 마세요.
- 과한 비유나 극단적인 표현을 쓰지 않습니다.
- **다만 줄 수는 줄이지 않습니다.** 한 줄을 짧게 쓰는 것이지 적게 쓰는 것이 아닙니다.
  위에 정한 줄 수는 그대로 채우고, 대신 장면을 하나씩 더 보여 주세요.

`
      : ''}${mumbling && !isInstrumental
      ? `════════ 흘려 부르는 발음으로 적기 ════════
가사를 **실제 보컬이 부르는 소리 그대로** 적습니다. 원래 철자를 괄호로 함께 적지 않습니다.

${MUMBLE_RULES}

자음은 살리고 모음과 어미만 줄입니다. 알아들을 수 없을 만큼 뭉개지 마세요.
${language === 'Korean' ? '한국어 가사에는 적용하지 않고, 섞어 쓰는 영어 부분에만 적용합니다.' : ''}

`
      : ''}════════ 쓰지 말아야 할 말 ════════
아래 단어와 그 한국어 번역어는 **절대 쓰지 않습니다.**
AI가 만든 가사에서 너무 자주 나와서, 쓰는 순간 흔해집니다.

${CLICHE_WORDS.join(', ')}

${language === 'English'
      ? '위 단어들의 변형(fading, whispered, shadows 같은 형태)도 쓰지 않습니다.'
      : `한국어로도 마찬가지입니다. 그림자, 속삭임, 메아리, 벨벳, 실루엣, 황금빛, 어스름,
자정, 네온, 스며들다, 피어나다, 흩어지다, 아련한, 몽롱한 — 이런 말을 피하세요.`}

**일상적인 단어를 쓰세요.** 평범한 말이 뜻밖의 자리에 놓일 때 가장 좋은 문장이 됩니다.
거창하고 추상적인 단어보다, 손에 잡히는 구체적인 사물의 이름을 쓰세요.
${language === 'English'
      ? 'porch light, receipt, shoelace, elevator, cigarette, coffee cup, parking lot 같은 것들입니다.'
      : '편의점, 우산, 계단, 지하철, 담배, 영수증, 라이터, 신발끈 같은 것들입니다.'}

${avoidTitles.length
      ? `
════════ 이미 만든 곡 ════════
아래 제목들은 이미 만들었습니다. **같은 제목과 같은 훅을 다시 쓰지 마세요.**
같은 주제 안에서 다른 장면, 다른 화자, 다른 시간대를 잡아 새로 씁니다.

${avoidTitles.map((t) => `- ${t}`).join('\n')}
`
      : ''}
════════ 곡마다 전용 스타일 프롬프트를 붙입니다 ════════
**곡 하나에 스타일 하나입니다.** 여러 곡이 같은 스타일을 나눠 쓰지 않습니다.

──── 모든 곡이 반드시 지켜야 하는 것 ────
${referenceFirst
      ? `**레퍼런스가 기준입니다.** 아래 값과 레퍼런스가 다르면 레퍼런스를 따르세요.
아래는 참고용이며, 레퍼런스에 없는 항목을 채울 때만 씁니다.`
      : `아래는 사용자가 정한 값입니다. **곡마다 달라지면 안 됩니다.**
가사 내용에 맞춘다고 이 값을 바꾸지 마세요.`}

- 장르: ${genres}
- 보컬: ${vocal}
- 템포: ${tempo}
- 시대감: ${era}
${instruments ? `- 주요 악기: ${instruments}\n  이 악기들이 편성의 중심입니다. 곡마다 그중 어느 것을 앞세울지만 바꿉니다.` : ''}

장르는 모든 곡에 그대로 들어갑니다.
스타일 프롬프트 첫 문장에 이 장르를 반드시 적으세요.
${moods ? `분위기(${moods})는 큰 틀에서 유지하되, 곡마다 그중 어느 결을 강조할지는 달라도 됩니다.` : ''}

──── 곡마다 달라져야 하는 것 ────
가사를 다 쓴 뒤, **그 곡의 내용에 맞춰** 아래를 조정합니다.
위에 적힌 장르·보컬·템포 범위 **안에서** 바꾸는 것입니다.

  가사가 조용히 무너지는 이야기라면 → 편성을 덜어 내고 공간을 넓게
  가사가 몰아붙이는 이야기라면 → 드럼을 앞으로 내고 리듬을 촘촘하게
  가사가 회상하는 이야기라면 → 잔향을 늘리고 고역을 부드럽게

**곡마다 BPM이 달라야 합니다.** 위에 적힌 템포 범위 안에서 5~10씩 벌립니다.
**주도 악기도 곡마다 바꿉니다.** 모든 곡에서 같은 악기가 중심을 잡으면 전부 비슷하게 들립니다.

──── 각 스타일의 규격 ────
**공백 포함 650~850자.** 900자를 절대 넘기지 마세요.
Suno의 Style 칸은 1000자까지만 받습니다. 넘으면 뒷부분이 잘려서
프로덕션 묘사가 통째로 사라집니다. 여유를 두고 쓰세요.

**반드시 들어가야 하는 것 네 가지** — 이것부터 쓰고 나머지를 채웁니다.
  1. 조성 (key) — 예) in a minor key, in D minor
  2. 템포 (BPM 숫자)
  3. 보컬 (성별과 음색)
${introInStyle ? '  4. 곡이 어떻게 시작하는지 (The track opens with...)' : '  4. 편성의 중심을 잡는 악기'}

이 넷이 빠지면 Suno가 제멋대로 정합니다.
글자 수가 모자라면 형용사를 덜어 내되 이 넷은 남기세요.
Suno는 묘사가 자세할수록 그대로 따라갑니다. 대충 쓰면 대충 나옵니다.
아래 다섯 부분이 하나의 자연스러운 영어 문단으로 이어지게 씁니다.

1) A [성별] vocalist sings over a [장르] piece with [분위기를 한 마디로].

2) 템포, 감정, major/minor. 화성이 특징적이면 함께.

${introInStyle
      ? `2-1) **곡이 어떻게 시작하는지 한 문장.** 위에서 이 곡에 배정된 인트로 방식의
   영어 문장을 여기에 그대로 넣습니다. Suno는 편곡을 스타일에서 가져오므로
   이 문장이 있어야 인트로 지시가 확실히 먹힙니다.`
      : `2-1) **곡이 어떻게 시작하는지는 스타일에 적지 않습니다.**
   이 스타일은 여러 곡에 다시 쓸 수 있어야 하므로, 특정 곡의 인트로를 넣지 마세요.
   인트로는 가사의 [Intro] 태그로만 지정합니다.`}

3) 악기 — 여기에 가장 많이 씁니다.
   **악기를 다섯 가지 이상 다루고, 각각 한 문장씩 씁니다.**
   이름만 적지 말고 **어떻게 연주하는지를 동사로** 쓰고, 형용사를 두세 개 겹칩니다.

   이러면 안 됩니다:
     piano, bass, drums, synth

   이렇게 씁니다:
     The synthesizer weaves metallic, shimmering textures with a cool analog edge,
     while the electric guitar layers clean, reverb-drenched arpeggios that float
     weightlessly through the mix. The bass delivers a deep, walking groove anchored
     in jazz harmony. The percussion drives with tight, programmed beats using muted
     kicks and soft, rounded snare taps.

4) 보컬의 질감·음역·창법. 목소리가 어디서 어디로 움직이는지까지.

5) 프로덕션 — 믹싱 성격에서 멈추지 마세요.
   스테레오 폭, 잔향의 성격, 저역과 고역의 처리,
   음의 시작이 얼마나 부드러운지(transient)까지 씁니다.

- BPM 숫자를 넣습니다. 위 템포 범위(${tempo}) 안에서 곡마다 다르게.
${referenceFirst
      ? '- 첫 문장의 장르와 보컬은 **레퍼런스에서 읽은 값**을 씁니다.'
      : `- **첫 문장에 장르(${genres})와 보컬(${vocal})이 반드시 들어갑니다.**
  이것이 빠지면 곡이 채널 색에서 벗어납니다.`}
${introInStyle
      ? '- **"The track opens with..." 문장이 반드시 들어갑니다.** 곡마다 다른 방식이어야 합니다.'
      : '- 인트로 관련 문장은 넣지 않습니다. 스타일을 다른 곡에 다시 쓸 수 있어야 합니다.'}
- 구조 태그([Verse] 등)와 아티스트 이름은 넣지 않습니다.
- 부정형("no noise") 대신 clean, pristine, smooth 같은 긍정형으로 씁니다.
- 한국어 입력값도 영어 키워드로 바꿔 넣습니다.

──── 함께 낼 것 ────
- style: 위 규격대로 쓴 영어 프롬프트
- exclude: 이 곡에서 나오면 안 되는 소리. Suno의 Exclude Styles 칸에 넣을 영어 목록.
  잡음 계열을 기본으로 넣고, 이 곡에 안 맞는 요소를 더합니다.
- styleNote: 이 곡의 스타일을 왜 이렇게 잡았는지 한국어 한 줄.
  가사의 어떤 점 때문에 이렇게 만들었는지 적습니다.

════════ 제목 ════════
곡마다 제목 2개를 냅니다. ${isInstrumental ? '한국어' : language}로 씁니다.

- **15~20자를 넘지 않습니다.** 짧을수록 좋습니다.
- **가사에 그대로 나오는 문장을 제목으로 쓰지 마세요.**
  곡의 정서를 옆에서 비추는 말로 고릅니다.
  가사가 이별을 말한다면 제목은 "이별"이 아니라 그 장면에 있던 사물이나 행동입니다.
- title: 곡의 핵심을 우회적으로 짚는 제목
- titleAlt: 톤이 다른 두 번째 제목
${songCount >= 3
      ? `- ${songCount}곡 중 1~2곡은 뜻밖의 조합으로 조금 실험적인 제목을,
  나머지는 차분하고 단정한 제목을 붙입니다.`
      : ''}

════════ 내보내기 전에 스스로 확인하세요 ════════
- 금지어가 하나도 없는가
- 감정을 이름으로 부른 곳이 없는가 (후렴 훅은 예외)
- 소괄호 안에 부를 수 없는 설명문이 들어가 있지 않은가
- 후렴이 나올 때마다 가사 전문이 다시 적혀 있는가
- 제목이 20자 안쪽이고, 가사에 그대로 나오는 문장이 아닌가
- 한 줄이 한 호흡에 부를 수 있는 길이인가
- **모든 곡의 스타일에 지정된 장르와 보컬이 들어가 있는가**
- 곡마다 BPM이 서로 다른가
- **모든 스타일에 곡이 어떻게 시작하는지가 적혀 있고, 곡마다 다른가**
- **정해진 줄 수를 다 채웠는가** (모자라면 곡이 짧게 끝납니다)
- 줄 끝 악기 신호가 두 줄에 하나를 넘지 않는가
- 줄 끝 신호가 전부 '그 순간 시작되는 것'인가 (빼거나 사라지는 것은 아닌가)
- 아웃트로가 세 단으로 끝나고 마지막에 Final 한 방이 있는가
- **후렴의 첫 줄과 마지막 줄이 글자까지 똑같은 훅인가**
  (단어 반복형이나 소리형 훅도 마찬가지로 그대로 되풀이해야 합니다)
- 훅이 4~7음절로 짧은가
${anchor ? '- 열쇠말이 절과 브리지에 서너 번 흩어져 있는가' : ''}

JSON만 출력합니다.`,
    schema: obj({
      songs: S.objList({
        title: S.str,
        titleAlt: S.str,
        lyrics: S.str,
        style: S.str,
        exclude: S.str,
        styleNote: S.str,
      }),
    }),
  };
}

/**
 * Suno가 멋대로 넣는 잡음을 막는 기본 목록입니다.
 * Exclude styles 칸에 넣습니다.
 */
export const DEFAULT_EXCLUDE =
  'hiss, noise, shimmering, lofi, fx, reverb, vocal noise, vocal hiss, ' +
  'vocal shimmering, drum hiss, hihat hiss, drum noise, fx noise, humming, ' +
  'humming noise, cymbal hiss, cymbal noise, hihat noise, hihat, percussion noise';

/* ────────────────────────────────
   5. 영상 아트워크 매칭
──────────────────────────────── */

/* ────────────────────────────────
   6. SEO 최적화 (제목 · 설명 · 태그)
──────────────────────────────── */
export function seoOptimize({ topic, genre, market, songTitles = [] }) {
  const marketRule = {
    kr: '한국 시청자 대상. 제목·설명·태그 모두 한국어로.',
    global: '영어권 시청자 대상. 제목·설명·태그 모두 영어로.',
    jp: '일본 시청자 대상. 제목·설명·태그 모두 일본어로.',
    cn: '중국 시청자 대상. 제목·설명·태그 모두 중국어(간체)로.',
    both: '한국과 영어권을 함께 노린다. 제목은 한국어와 영어를 한 줄에 같이 넣고, 태그는 두 언어를 섞는다.',
  }[market] || '한국 시청자 대상. 모두 한국어로.';

  return {
    temperature: 0.9,
    maxOutputTokens: 6000,
    thinkingLevel: 'medium',
    prompt: `당신은 유튜브 음악 채널의 SEO를 다뤄 온 전문가입니다.
아래 영상이 검색과 추천에 잘 걸리도록 제목·설명·태그를 만들어 주세요.

[영상]
- 주제와 컨셉: ${topic}
- 장르와 무드: ${genre || '지정 없음'}
${songTitles.length ? `- 수록곡: ${songTitles.join(', ')}` : ''}

[타겟]
${marketRule}

[작성 지침]
- 제목은 60자를 넘기지 않습니다. 앞쪽 30자 안에 핵심 키워드를 넣습니다.
- 사람들이 실제로 검색창에 치는 말로 씁니다. 멋있는 문구보다 검색되는 문구가 먼저입니다.
- 이 장르 플레이리스트를 찾을 때 어떤 상황을 함께 검색하는지 생각해서 넣습니다.
  예) 공부할 때, 비 오는 날, 카페에서, 잠들기 전
- 태그는 검색량이 큰 넓은 말과 경쟁이 적은 좁은 말을 섞습니다.
- 낚시성 표현이나 관련 없는 태그는 넣지 않습니다. 노출에 오히려 손해입니다.

[담을 내용]
- titles: 제목 후보 5개. 서로 다른 각도로.
- description: 영상 설명글. 첫 두 줄에 핵심을 담고, 그 아래 채널 소개와 안내를 붙입니다.
- tags: 유튜브 태그 15개. 쉼표로 나눠 넣을 순수 키워드만.
- hashtags: 제목이나 설명 맨 위에 붙일 해시태그 3개.
- thumbnailText: 썸네일에 넣을 짧은 문구 3개. 각 10자 이내.
- keywordStrategy: 왜 이 키워드들을 골랐는지 한국어 설명 3줄.

JSON만 출력합니다.`,
    schema: obj({
      titles: S.strList,
      description: S.str,
      tags: S.strList,
      hashtags: S.strList,
      thumbnailText: S.strList,
      keywordStrategy: S.strList,
    }),
  };
}

/* ────────────────────────────────
   7. 플리 스타일 분석 (유튜브 영상을 직접 들려주고 Suno 프롬프트 역산)
──────────────────────────────── */
export function playlistStyleAnalysis({ windowNote, promptCount = 3, source = 'youtube' }) {
  return {
    temperature: 0.7,
    maxOutputTokens: 12000,
    thinkingLevel: 'medium',
    prompt: `당신은 레퍼런스 음원을 듣고 그 소리를 재현하는 프롬프트를 짜는 사운드 엔지니어입니다.
함께 넘긴 ${source === 'file' ? '음원 파일' : '유튜브 영상'}의 **소리**를 듣고,
이 소리를 Suno로 다시 만들려면 어떤 프롬프트를 넣어야 하는지 역산해 주세요.

${windowNote}

════════ 반드시 지킬 것 ════════
- 실제로 들리는 것만 쓰세요. 제목이나 썸네일에서 짐작하지 마세요.
- 들리지 않아 확신이 없으면 그 항목에 "불확실"이라고 적으세요. 지어내지 마세요.
- 여러 곡이 이어지는 플레이리스트라면, 곡마다 다른 점보다 **전체를 관통하는 공통 색깔**을 잡으세요.
- 특정 아티스트나 곡 제목을 프롬프트에 넣지 마세요. Suno가 거부합니다.
  대신 그 소리를 만드는 요소(악기, 주법, 믹싱)로 풀어 쓰세요.

════════ Suno 스타일 프롬프트 규격 ════════
sunoPrompts의 각 prompt는 **공백 포함 650~850자**입니다. 900자를 넘기지 마세요.
Suno의 Style 칸 한도가 1000자라 넘으면 뒷부분이 잘립니다.
조성·BPM·보컬·시작 방식 네 가지는 반드시 넣고, 그다음 나머지를 채웁니다.
Suno는 묘사가 자세할수록 그대로 따라갑니다.
아래 다섯 부분이 하나의 자연스러운 영어 문단으로 이어지게 씁니다.

1) A [성별] vocalist sings over a [장르] piece with [분위기].
2) 템포, 감정, major/minor. 화성이 특징적이면 함께.
3) **악기를 다섯 가지 이상, 각각 한 문장씩.**
   이름만 적지 말고 어떻게 연주하는지를 동사로 쓰고, 형용사를 두세 개 겹칩니다.
   예) The bass delivers a deep, walking groove anchored in jazz harmony.
       The percussion drives with tight, programmed beats using muted kicks
       and soft, rounded snare taps.
4) 보컬의 질감·음역·창법. 목소리가 어디서 어디로 움직이는지까지.
5) 프로덕션. 믹싱 성격에서 멈추지 말고 스테레오 폭, 잔향의 성격,
   저역과 고역의 처리, 음의 시작이 얼마나 부드러운지(transient)까지.

- BPM 숫자를 넣습니다. 구조 태그와 아티스트 이름은 넣지 않습니다.
- 깨끗한 소리를 원할 때 "no noise"처럼 부정형으로 쓰지 말고
  clean, pristine, smooth 같은 긍정형으로 표현합니다.

${promptCount}개는 서로 다른 각도로 만듭니다.
label에 어떤 각도인지 한국어로 적으세요.
예) "가장 가까운 재현", "보컬을 더 살린 버전", "연주곡 버전"

════════ 담을 내용 ════════
- overview: 이 소리가 어떤 음악인지 한국어 3~4문장. 처음 듣는 사람에게 설명하듯.
- genre: 장르. 한국어와 영문 장르명을 함께.
- bpm: 체감 BPM 범위와 리듬 느낌. 예) "82-88 BPM, 하프타임 느낌의 느긋한 그루브"
- key: 조성과 화성 느낌. 확신이 없으면 "불확실".
- vocal: 보컬의 성별·음색·창법·더블링·리버브 정도. 연주곡이면 그렇게 적으세요.
- instruments: 실제로 들리는 악기 5~8개. 각각 어떤 역할과 음색인지 한 줄씩.
- production: 믹싱과 마스터링의 성격. 공간감, 저역, 노이즈, 다이내믹, 빈티지/현대적 질감.
- structure: 곡이 어떻게 전개되는지. 인트로 길이, 반복 구조, 빌드업 유무.
- sunoPrompts: 위 규격대로 ${promptCount}개.
- negativePrompt: 이 소리를 낼 때 피해야 할 것. Suno의 Exclude 칸에 넣을 영어 목록.
- tips: 이 소리에 더 가깝게 가기 위한 실전 조언 4개. 한국어.

JSON만 출력합니다.`,
    schema: obj({
      overview: S.str,
      genre: S.str,
      bpm: S.str,
      key: S.str,
      vocal: S.str,
      instruments: S.objList({ name: S.str, role: S.str }),
      production: S.str,
      structure: S.str,
      sunoPrompts: S.objList({ label: S.str, prompt: S.str }),
      negativePrompt: S.str,
      tips: S.strList,
    }),
  };
}

/* ────────────────────────────────
   8. 음원에서 가사 + 타임코드 뽑기
──────────────────────────────── */

/* ────────────────────────────────
   9. 자막 번역
──────────────────────────────── */

/* ────────────────────────────────
   10. 내 채널 분석
──────────────────────────────── */
export function channelAnalyzer({ channel, stats, videos }) {
  return {
    temperature: 0.85,
    maxOutputTokens: 7000,
    thinkingLevel: 'medium',
    prompt: `당신은 유튜브 채널을 키워 온 컨설턴트입니다.
아래는 사용자 본인의 채널 데이터입니다. 무엇이 되고 있고 무엇이 안 되고 있는지 짚어 주세요.

[채널]
- 이름: ${channel.name}
- 구독자: ${stats.subscribers.toLocaleString()}명
- 총 영상: ${stats.totalVideos}개
- 개설: ${stats.publishedAt}

[영상 ${videos.length}개]
- 평균 조회수: ${Math.round(stats.avgViews).toLocaleString()}
- 조회수 중앙값: ${Math.round(stats.medianViews).toLocaleString()}
- 평균 길이: ${stats.avgDurationText}
- 평균 업로드 간격: ${stats.avgGapDays}일

${videos.map((v, i) => `${i + 1}. "${v.title}" · ${v.views.toLocaleString()}회 · 좋아요 ${v.likes} · 댓글 ${v.comments} · ${v.durationText} · ${v.published}`).join('\n')}

[지침]
- 모든 답변을 한국어로 씁니다.
- 위로하지 말고 솔직하게 씁니다. 안 되는 건 안 된다고 하세요.
- 평균이 아니라 **상위와 하위의 차이**에서 원인을 찾으세요.
- 조회수가 낮은 영상들의 공통점을 반드시 짚으세요.
- "꾸준히 올리세요" 같은 일반론은 쓰지 마세요. 이 데이터에서만 나올 수 있는 말을 하세요.

[담을 내용]
- summary: 이 채널의 현재 상태 3~4문장.
- strengths: 잘 되고 있는 것 3개. 근거가 되는 영상이나 숫자를 함께.
- weaknesses: 발목을 잡는 것 3개. 근거와 함께.
- titleInsight: 제목이 성과에 어떻게 작용하고 있는지.
- lengthInsight: 영상 길이와 조회수의 관계.
- uploadInsight: 업로드 주기에 대한 진단.
- nextVideoIdeas: 다음에 만들면 좋을 영상 5개. 제목까지 구체적으로.
- actionPlan: 앞으로 한 달 동안 할 일 5개. 순서대로.

JSON만 출력합니다.`,
    schema: obj({
      summary: S.str,
      strengths: S.strList,
      weaknesses: S.strList,
      titleInsight: S.str,
      lengthInsight: S.str,
      uploadInsight: S.str,
      nextVideoIdeas: S.objList({ title: S.str, why: S.str }),
      actionPlan: S.strList,
    }),
  };
}

/* ────────────────────────────────
   11. 가사 맞추기 — 가사를 이미 알 때
   받아쓰기보다 훨씬 정확합니다. 무엇을 부르는지는 이미 알고 있고,
   모델은 "언제 부르는지"만 찾으면 되기 때문입니다.
──────────────────────────────── */

/* ────────────────────────────────
   12. 이미 쓴 가사를 흘려 부르는 발음으로
──────────────────────────────── */
export function toMumbling({ lyrics }) {
  return {
    temperature: 0.3,
    maxOutputTokens: 6000,
    thinkingLevel: 'low',
    prompt: `아래 영어 가사를 실제 보컬이 부르는 소리 그대로 다시 적어 주세요.

${MUMBLE_RULES}

[지킬 것]
- 자음은 살리고 모음과 어미만 줄입니다.
- 알아들을 수 없을 만큼 뭉개지 마세요.
- 원래 철자를 괄호로 함께 적지 마세요.
- **대괄호 구간 표시는 그대로 둡니다.** 건드리지 마세요.
- 한국어 줄은 손대지 않고 그대로 둡니다.
- 줄 수와 순서를 그대로 유지합니다.

[원래 가사]
${lyrics}

JSON만 출력합니다.`,
    schema: obj({ lyrics: S.str }),
  };
}

/* ────────────────────────────────
   13. 가사를 보고 제목 다시 뽑기
──────────────────────────────── */
export function suggestTitles({ lyrics, language, count = 5 }) {
  return {
    temperature: 1.1,
    maxOutputTokens: 3000,
    thinkingLevel: 'medium',
    prompt: `당신은 인디 아티스트의 매니저이자 현업 프로듀서입니다.
아래 가사에 어울리는 곡 제목을 ${count}개 추천해 주세요.

[지킬 것]
- **가사에 그대로 나오는 문장을 제목으로 쓰지 마세요.**
  곡의 정서를 옆에서 비추는 말로 고릅니다.
- 15~20자를 넘지 않습니다. 짧을수록 좋습니다.
- 거창하고 추상적인 말 대신, 누구나 아는 쉬운 단어를 씁니다.
  평범한 말이 뜻밖의 자리에 놓일 때 가장 좋은 제목이 됩니다.
- 아래 단어는 절대 쓰지 않습니다.
  ${CLICHE_WORDS.join(', ')}
- ${count}개 중 한둘은 뜻밖의 조합으로 조금 실험적으로,
  나머지는 차분하고 단정하게 붙입니다.
- 제목은 ${language || '가사와 같은 언어'}로 씁니다.

각 제목이 가사의 어느 대목과 이어지는지 한 줄로 함께 적어 주세요. 설명은 한국어로.

[가사]
${lyrics}

JSON만 출력합니다.`,
    schema: obj({
      titles: S.objList({ title: S.str, why: S.str }),
    }),
  };
}

/* ────────────────────────────────
   14. 스타일 변주 — 플레이리스트용
   하나의 스타일로 20곡을 뽑으면 전부 비슷해집니다.
   채널의 색은 지키되 곡마다 다른 프롬프트를 쓰는 것이 유일한 해결책입니다.
──────────────────────────────── */

/** 변주를 만들 축. 각각 소리의 다른 부분을 건드립니다. */
const VARIATION_AXES = [
  ['템포', '느리게 또는 빠르게. 원래보다 12~20 BPM 벌립니다'],
  ['주도 악기', '중심을 잡는 악기를 다른 것으로 바꿉니다. 피아노 → 기타, 신스 → 스트링'],
  ['리듬', '박자의 성격을 바꿉니다. 반박자 느낌, 셔플, 4박 정박, 브레이크비트'],
  ['공간감', '가까이 붙은 드라이한 소리 ↔ 넓고 잔향 많은 소리'],
  ['보컬 처리', '겹쳐 쌓기 ↔ 홑겹, 가까이 ↔ 멀리, 또렷 ↔ 흐릿'],
  ['질감', '따뜻한 아날로그 ↔ 차가운 디지털, 거친 ↔ 매끈한'],
  ['편성', '악기를 덜어 낸 최소 편성 ↔ 꽉 채운 편성'],
  ['조성', '단조 ↔ 장조, 또는 화성을 더 복잡하게/단순하게'],
];

export function styleVariations({ base, count = 5, keep = '' }) {
  return {
    temperature: 1.15,
    maxOutputTokens: 1200 * count + 3000,
    thinkingLevel: 'medium',
    prompt: `당신은 한 채널의 사운드를 설계하는 프로듀서입니다.
아래 스타일을 바탕으로, **같은 채널의 곡으로 들리지만 서로 다른** 스타일 프롬프트 ${count}개를 만들어 주세요.

[바탕이 되는 스타일]
${base}

${keep ? `[반드시 지킬 것]\n${keep}\n` : ''}
════════ 왜 필요한가 ════════
하나의 스타일 프롬프트로 여러 곡을 만들면 인트로부터 편곡까지 거의 같게 나옵니다.
플레이리스트로 묶었을 때 한 곡을 조금씩 바꾼 것처럼 들려서 끝까지 듣지 않게 됩니다.
채널의 색은 유지하면서 곡마다 다른 인상을 주는 것이 목표입니다.

════════ 무엇을 지키고 무엇을 바꾸나 ════════
지킬 것 — 이것이 채널의 정체성입니다.
- 보컬의 성별과 기본 음색
- 장르의 큰 갈래
- 전체적인 정서

바꿀 것 — 아래 축을 골라 변주마다 **두세 개씩** 실제로 다르게 만듭니다.
${VARIATION_AXES.map(([k, v]) => `- ${k}: ${v}`).join('\n')}

형용사만 몇 개 바꾸는 것은 변주가 아닙니다.
"dark" 를 "moody" 로 바꾸는 식으로는 소리가 달라지지 않습니다.
악기 구성, 리듬의 성격, 공간감처럼 **실제로 다르게 들리는 것**을 바꾸세요.

════════ 각 프롬프트 규격 ════════
- **공백 포함 650~850자.** 900자를 넘기지 마세요. Style 칸 한도가 1000자입니다.
  조성·BPM·보컬·시작 방식은 반드시 넣습니다.
- 다섯 부분이 하나의 영어 문단으로 이어지게 씁니다.
  1) A [성별] vocalist sings over a [장르] piece with [분위기]
  2) 템포, 감정, major/minor
  3) **악기 다섯 가지 이상, 각각 한 문장.** 이름만 적지 말고 어떻게 연주하는지 동사로.
  4) 보컬의 질감·음역·창법
  5) 프로덕션 — 스테레오 폭, 잔향, 저역·고역 처리, 음의 시작(transient)까지
- BPM 숫자를 넣습니다. **변주마다 BPM이 달라야 합니다.**
- 구조 태그와 아티스트 이름은 넣지 않습니다.
- 부정형("no noise") 대신 clean, pristine, smooth 같은 긍정형으로 씁니다.

[담을 내용]
- label: 이 변주가 어떤 방향인지 한국어로 짧게. 예) "느리고 넓게", "기타 중심으로"
- changed: 바탕에서 무엇을 바꿨는지 한국어 한 줄
- prompt: 위 규격대로 쓴 영어 프롬프트
- bpm: 이 변주의 BPM 숫자

JSON만 출력합니다.`,
    schema: obj({
      variations: S.objList({
        label: S.str,
        changed: S.str,
        prompt: S.str,
        bpm: S.str,
      }),
    }),
  };
}
