/**
 * 2단계 생성(후보 → 고르기 → 완성)이 실제로 도는지 확인합니다.
 *
 * 왜 필요한가:
 * 이 흐름은 화면을 두 번 거칩니다. 후보를 그리고, 고른 것만 완성합니다.
 * 중간에 하나라도 어긋나면 "버튼을 눌렀는데 아무 일도 없다"가 되는데,
 * 문법 검사로는 절대 안 잡힙니다.
 *
 * 쓰는 법:
 *   node check-seeds.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

let failed = 0;
const ok = (cond, label) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failed++;
};

/* ── 브라우저 흉내 (smoke-test와 같은 방식) ───── */
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
  url: 'https://test.local/',
  pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.location = window.location;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.CustomEvent = window.CustomEvent;
global.HTMLElement = window.HTMLElement;
global.Blob = window.Blob;
global.URL = window.URL;
global.alert = (m) => console.log(`     [alert] ${m}`);
const fakeCrypto = { randomUUID: () => 'id-' + Math.random().toString(16).slice(2) };
Object.defineProperty(global, 'crypto', { value: fakeCrypto, configurable: true });
Object.defineProperty(window, 'crypto', { value: fakeCrypto, configurable: true });
const store = new Map();
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}});
global.localStorage = window.localStorage;
window.matchMedia = () => ({ matches: false, addEventListener() {} });

/* ── Gemini를 fetch 층에서 가로챕니다 ──────────
 * 모듈을 바꿔치기하는 대신 네트워크만 가로채면
 * gemini.js의 실제 요청 구성과 응답 파싱까지 함께 검증됩니다.
 */
const calls = [];
let seedPromptLen = 0;
const FAKE_SEEDS = [
  { title: '문은 내가 닫았어', scene: '현관에서 상대를 막아선 채 문고리를 쥐고 있다', to: '상대', hook: '문은 내가 닫았어', opening: '불은 껐어', soundNote: '느린 808에 현악' },
  { title: '두 번째 봄', scene: '창틀을 뜯어내며 밖으로 소리치는 중이다', to: '세상', hook: '봄이 또 왔더라', opening: '창을 열었어', soundNote: '피아노 중심, 담백하게' },
  { title: '지켜본 사람', scene: '길 한복판에서 상대의 팔을 붙잡고 대답을 요구한다', to: '상대', hook: '나는 다 봤어', opening: '길 건너에서', soundNote: '차가운 신스 패드' },
];

global.fetch = async (url, opts = {}) => {
  const sent = JSON.parse(opts.body || '{}');
  const prompt = sent.contents?.[0]?.parts?.at(-1)?.text || '';
  const cfg = sent.generationConfig || {};
  calls.push({ prompt, maxOutputTokens: cfg.maxOutputTokens, schema: cfg.responseSchema });

  // 가사 꼴 뽑기 — 일부러 원문 인용 한 줄을 섞어 돌려줍니다(지워지는지 보려고).
  if (cfg.responseSchema?.properties?.devices) {
    return jsonRes({
      name: '짧게 끊는 주고받기 팝',
      sections: ['Verse · 8줄 · 6/11음절 번갈아 · AABB', 'Chorus · 4줄 · 훅 세 번 · AAAA'],
      hook: '두 단어 명령문을 후렴 첫·셋째·끝 줄에',
      lineShape: '문장 조각과 쉼이 많음',
      rhyme: '두 줄씩 맞춤',
      devices: ['되풀이', '주고받기', '호명'],
      voice: 'I count the cars outside your window tonight',
      styleForm: '쉼표로 이은 태그 열 개 남짓, 200자 안팎. 장르 → 보컬 → 악기 → 질감 순',
      styleSound: 'dark pop, breathy female vocal, 808, plucked synth',
      excludeForm: '반대 성별 보컬과 왜곡 계열 세 개',
      summary: '짧은 줄로 끊어 치고 훅을 세 번 박는다.',
    });
  }

  // 주제로 설정 맞추기 — 칸마다 따로 받는 형식
  if (cfg.responseSchema?.properties?.genre && cfg.responseSchema?.properties?.summary) {
    return jsonRes({
      // '다크팝'은 띄어쓰기가 다른 표기입니다. 예전에는 이 칸이 조용히 버려졌습니다.
      genre: { pick: ['다크팝', '트랩'], why: '터지는 감정에 맞는 무거운 저음' },
      mood: { pick: ['에너지 폭발', '다크하고 강렬'], why: '분노를 지켜보지 않고 터뜨림' },
      tempo: { pick: ['빠른 (130-150)'], why: '몰아치는 속도' },
      era: { pick: ['없는시대감'], why: '목록에 없는 값' },
      summary: '무겁고 빠르게 몰아치는 다크 팝.',
    });
  }

  if (cfg.responseSchema?.properties?.pick) {
    return jsonRes({
      pick: ['에너지 폭발', '긴장감 있는', '다크하고 강렬'],
      drop: ['여유로운 위협', '관능적', '없는분위기'],
      why: '주제가 터지는 분노라 여유로운 쪽과 부딪힙니다.',
    });
  }

  const isSeed = !!cfg.responseSchema?.properties?.seeds;
  const payload = isSeed
    ? { seeds: FAKE_SEEDS }
    : {
        songs: [
          {
            title: prompt.match(/- 제목: (.+)/)?.[1]?.trim() || '무제',
            titleAlt: '대체 제목',
            lyrics: '[Verse 1 - Soft Piano]\n첫 줄\n둘째 줄',
            style: 'dark pop, 90 bpm, male vocal, the track opens cold on a single piano note. ' + 'x'.repeat(420),
            exclude: 'hiss',
            styleNote: '메모',
          },
        ],
      };

  return jsonRes(payload);
};

function jsonRes(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }],
    }),
  };
}

// API 키가 있어야 호출이 나갑니다.
window.localStorage.setItem('plimusic:settings', JSON.stringify({ geminiKey: 'TEST-KEY' }));

/* ── 화면을 그립니다 ───────────────────────────── */
const { default: renderMusic } = await import(appUrl('js/pages/music.js'));
const root = dom.window.document.createElement('div');
dom.window.document.body.appendChild(root);
renderMusic(root);

const $ = (sel) => root.querySelector(sel);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const settle = () => new Promise((r) => setTimeout(r, 60));

console.log('\n처음 화면 — 기울지 않은 기본값:');
{
  const on = (name) => [...root.querySelectorAll(`[data-pills="${name}"] .pill.on`)].map((p) => p.dataset.value);
  ok(on('genre').length === 0, '장르가 비어 있음 (다크 팝이 기본이 아님)');
  ok(on('persona')[0] === 'plain', "화자는 '주제 그대로'");
  ok(on('mood').length === 0, '분위기도 비어 있음');
}
// 이 검사들은 생성 흐름을 보므로 장르를 하나 골라 둡니다.
click(root.querySelector('[data-pills="genre"] .pill[data-value="dark pop"]'));

console.log('\n버전 표시:');
{
  // app.js 는 라우터라 이 테스트에서 띄우지 않습니다.
  // 버전이 만들어졌는지와 화면에 꽂을 자리·배선이 있는지를 확인합니다.
  const v = await import(appUrl('js/version.js') + `?t=${Date.now()}`);
  ok(/^v\d+$|^dev$/.test(v.VERSION), `버전이 만들어져 있음 (${v.VERSION})`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(v.BUILT), `날짜가 들어 있음 (${v.BUILT})`);

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(html.includes('id="build"'), '화면에 버전 자리가 있음');
  ok(!/>v\d+</.test(html), 'index.html 에 버전을 손으로 박아 두지 않음');

  const appjs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  ok(appjs.includes("from './version.js'"), 'app.js 가 버전을 불러옴');
  ok(appjs.includes("getElementById('build')"), 'app.js 가 그 자리에 찍음');
}

console.log('\n전주 없는 설정이면 스타일에도 넣기:');
{
  const pick = (name, label) => {
    const el = [...root.querySelectorAll(`[data-pills="${name}"] .pill`)].find((p) =>
      p.textContent.includes(label)
    );
    if (el) click(el);
    return el;
  };

  $('[data-f=concept]').value = '분노가 사람이 된 이야기';

  // 기본 상태(짧게 + 가사 태그에만)에서는 스타일을 건드리지 않아야 합니다.
  pick('form', '기본');
  pick('intro', '짧게');
  pick('introWhere', '가사 태그에만');
  await settle(30);
  calls.length = 0;
  click($('[data-go]'));
  await settle(250);
  ok(
    !calls[0].prompt.includes('스타일 프롬프트에 이 문장을 넣습니다'),
    '기본 설정에서는 스타일을 깨끗하게 둠'
  );

  // '전주 없이 바로'를 고르면 사용자가 '가사 태그에만'을 골라도 스타일에 들어가야 합니다.
  pick('intro', '전주 없이 바로');
  await settle(30);
  calls.length = 0;
  click($('[data-go]'));
  await settle(250);
  ok(
    calls[0].prompt.includes('no introduction at all'),
    '전주 없이 바로 → 스타일에도 자동으로 들어감'
  );
  ok(root.textContent.includes('태그만으로는 Suno가 전주를 붙입니다'), '왜 그런지 화면에 알려 줌');

  // 화면에 보이는 것과 실제로 나가는 것이 같아야 합니다.
  const onWhere = [...root.querySelectorAll('[data-pills="introWhere"] .pill.on')].map((p) => p.textContent);
  ok(
    onWhere.length === 1 && onWhere[0].includes('스타일에도'),
    `켜진 알약이 실제 동작과 일치 (${onWhere.join(', ')})`
  );
  const whereWrap = root.querySelector('[data-pills="introWhere"]').closest('.pills-wrap');
  const introWrap = root.querySelector('[data-pills="intro"]').closest('.pills-wrap');
  ok(whereWrap.classList.contains('is-off'), '인트로 위치만 고를 수 없게 표시');
  ok(!introWrap.classList.contains('is-off'), '인트로는 계속 고를 수 있음 — 되돌릴 길이 있어야 함');

  // 되돌리면 다시 고를 수 있어야 합니다.
  pick('intro', '짧게');
  await settle(30);
  ok(
    !root.querySelector('[data-pills="introWhere"]').closest('.pills-wrap').classList.contains('is-off'),
    '인트로를 짧게로 되돌리면 다시 고를 수 있음'
  );
  ok(!root.textContent.includes('태그만으로는 Suno가'), '안내도 사라짐');
  pick('intro', '전주 없이 바로');
  await settle(30);

  // 도입부 코러스도 마찬가지입니다.
  pick('intro', '짧게');
  pick('form', '도입부 코러스');
  await settle(30);
  calls.length = 0;
  click($('[data-go]'));
  await settle(250);
  ok(
    calls[0].prompt.includes('opens cold on the chorus hook at full energy'),
    '도입부 코러스 → 스타일에도 자동으로 들어감'
  );
  ok(
    root.querySelector('[data-pills="intro"]').closest('.pills-wrap').classList.contains('is-off'),
    '도입부 코러스면 인트로 길이는 쓰이지 않으므로 잠김'
  );
  ok(
    !root.querySelector('[data-pills="form"]').closest('.pills-wrap').classList.contains('is-off'),
    '곡 구성은 계속 고를 수 있음 — 되돌릴 길이 있어야 함'
  );

  // 3막 7장 — 기본은 '훅 먼저'. 훅으로 여니 인트로 길이는 쓰지 않고 스타일에도 시작 방식이 들어갑니다.
  pick('form', '3막 7장 (이야기형)');
  await settle(30);
  ok(!$('[data-act-open]').hidden, '3막 7장을 고르면 여는 방식을 고르는 칸이 나옴');
  ok(
    root.querySelector('[data-pills="intro"]').closest('.pills-wrap').classList.contains('is-off'),
    '훅 먼저 → 인트로 길이는 쓰지 않으므로 잠김'
  );
  ok($('[data-dur-note]').textContent.includes('1장 프롤로그(hook!)'), '훅 먼저 → 길이 아래 구성이 프롤로그 훅으로 시작');
  calls.length = 0;
  click($('[data-go]'));
  await settle(250);
  ok(calls[0].prompt.includes('이번 곡의 구성 — 3막 7장'), '3막 7장 → 프롬프트에 그대로 넘어감');
  ok(calls[0].prompt.includes('훅 먼저 여는 3막 7장'), '훅 먼저 → 프롤로그·귀환 안내가 들어감');
  ok(calls[0].prompt.includes('opens cold on the chorus hook'), '훅 먼저 → 스타일에도 훅으로 시작한다고 넣음');

  // 쌓아 올리기 — 예전 방식. 인트로를 다시 고를 수 있어야 합니다.
  pick('actOpen', '쌓아 올리기');
  await settle(30);
  ok(
    !root.querySelector('[data-pills="intro"]').closest('.pills-wrap').classList.contains('is-off'),
    '쌓아 올리기 → 인트로 길이를 다시 고를 수 있음'
  );
  ok($('[data-dur-note]').textContent.includes('7장 절정과 결말'), '쌓아 올리기 → 길이 아래 구성도 바뀜');
  calls.length = 0;
  click($('[data-go]'));
  await settle(250);
  ok(!calls[0].prompt.includes('훅 먼저 여는 3막 7장'), '쌓아 올리기 → 프롤로그 안내가 없음');
  pick('actOpen', '훅 먼저 (추천)');

  // 되돌립니다.
  pick('form', '기본');
  pick('intro', '짧게');
  await settle(30);
  ok(!$('[data-dur-note]').textContent.includes('장'), '기본으로 되돌리면 길이 아래 구성도 되돌아옴');
  ok($('[data-act-open]').hidden, '기본 구성에서는 여는 방식 칸이 숨음');
  await settle(30);
  calls.length = 0;
}

console.log('\n라임과 여백은 같이 못 켬:');
{
  const craft = (label) =>
    [...root.querySelectorAll('[data-pills="craft"] .pill')].find((p) => p.textContent.includes(label));
  const on = (label) => craft(label).classList.contains('on');

  ok(on('라임 살리기'), '기본값은 라임');
  ok(!on('여백 있게'), '여백은 기본으로 꺼져 있음');

  click(craft('여백 있게'));
  await settle(30);
  ok(on('여백 있게'), '여백을 켜면 켜짐');
  ok(!on('라임 살리기'), '라임이 자동으로 꺼짐');

  click(craft('라임 살리기'));
  await settle(30);
  ok(on('라임 살리기') && !on('여백 있게'), '반대로도 동작함');

  // 다른 작사 방식은 서로 영향이 없어야 합니다.
  const before = on('열쇠말 반복');
  click(craft('여백 있게'));
  await settle(30);
  ok(on('열쇠말 반복') === before, '관계없는 항목은 그대로');
  click(craft('라임 살리기'));
  await settle(30);
}

console.log('\n입력 순서:');
{
  // 주제가 다른 설정을 지배하므로, 설정을 만지기 전에 보여야 합니다.
  const html = root.innerHTML;
  ok(
    html.indexOf('data-f="concept"') < html.indexOf('data-mood-fit'),
    '주제 칸이 분위기 칸보다 위에 있음'
  );
  ok(
    html.indexOf('data-f="concept"') < html.indexOf('data-pills="genre"'),
    '주제 칸이 장르보다도 위에 있음'
  );
}

console.log('\n주제로 설정 맞추기:');
{
  const labelsOn = (name) =>
    [...root.querySelectorAll(`[data-pills="${name}"] .pill.on`)].map((p) => p.textContent);

  $('[data-f=concept]').value = '';
  click($('[data-fit]'));
  await settle();
  ok(calls.length === 0, '주제가 비면 호출하지 않음');

  $('[data-f=concept]').value = '분노가 사람이 된 이야기';
  click($('[data-fit]'));
  await settle();

  ok(calls.length === 1, '칸이 여러 개여도 호출은 한 번');
  ok(calls[0].prompt.includes('모든 칸을 그 소리에 맞춰'), '조합이 맞도록 지시함');
  ok(!calls[0].prompt.includes('지금 켜져 있는 것'), '앞 곡 설정(다크 팝 기본값)을 보여 주지 않아 끌려가지 않음');
  ok(calls[0].prompt.includes('남성 보컬 안에서') && calls[0].prompt.includes('지금 창법을 유지할 이유는 없습니다'),
    '보컬은 성별만 이어 가고 창법은 주제에 맞게 (예전에는 사실상 바뀌지 않음)');
  ok(calls[0].prompt.includes('분노는 록') && calls[0].prompt.includes('습관처럼 고르지 마세요'), '장르를 넓게 보고 다크 팝을 습관으로 고르지 않게 함');
  ok(calls[0].prompt.includes('빌런 —') && calls[0].prompt.includes("'편안함'"), '화자가 빌런일 때만 편안한 쪽을 막음');
  ok(calls[0].prompt.includes('【화자】'), '화자도 주제에 맞게 고를 수 있음');
  const enumOk = calls[0].schema?.properties?.genre?.properties?.pick?.items?.enum?.includes('다크 팝');
  ok(enumOk, '고를 수 있는 말을 enum 으로 묶어 엉뚱한 표기를 막음');
  const { settingsFit } = await import(appUrl('js/prompts.js'));
  const fields = [{ key: 'genre', label: '장르', multi: true, options: ['a'] }];
  const fp = settingsFit({ concept: '비가 오는 추적추적한 가을날', fields }).prompt;
  ok(fp.includes('다른 화자면 제한이 없습니다'), '빌런이 아닌 화자면 따뜻한·밝은 쪽도 고를 수 있음 (예전에는 늘 빌런 기준)');
  ok(fp.includes("'기본 — 주제 그대로'") && fp.includes('날씨·계절·장소'), '날씨·계절 같은 주제에는 성격 없는 화자를 고르게 함');
  ok(!fp.includes('지금 고른 화자'), '지금 화자(빌런)로 끌지 않음');
  const t = settingsFit({ concept: 'x', fields: [{ key: 'genre', label: '장르', multi: true, options: ['a'] }] }).temperature;
  ok(t >= 0.7, `폭을 주는 온도 (${t}) — 낮으면 늘 무난한 답만 나옴`);
  ok(calls[0].prompt.includes('【장르】'), '고를 수 있는 목록을 넘김');
  ok(!calls[0].prompt.includes('【가사 언어】'), '가사 언어는 자동으로 안 건드림');
  ok(!calls[0].prompt.includes('【곡 길이】'), '곡 길이도 안 건드림');

  // 먼저 보여 주기만 하고 아직 켜지 않아야 합니다.
  const beforeApply = labelsOn('mood');
  ok(root.textContent.includes('무겁고 빠르게'), '어떤 소리가 될지 먼저 보여 줌');
  ok(root.querySelectorAll('[data-fit-pick]').length === 3, '없는 값만 온 칸은 빼고 3칸 제안 (표기가 다른 다크팝은 살림)');
  ok(root.textContent.includes('시대감 / 스타일 — 목록에서 맞는 값을 찾지 못해'), '못 맞춘 칸은 조용히 버리지 않고 알려 줌');
  ok(
    JSON.stringify(labelsOn('mood')) === JSON.stringify(beforeApply),
    '적용 전에는 아무것도 바뀌지 않음'
  );

  // 장르 칸만 꺼서, 끈 칸이 정말 안 바뀌는지 봅니다.
  const genreBefore = labelsOn('genre');
  root.querySelectorAll('[data-fit-pick]')[0].checked = false;
  click($('[data-fit-go]'));
  await settle();

  ok(labelsOn('mood').includes('에너지 폭발'), '고른 칸은 켜짐');
  ok(labelsOn('mood').includes('다크하고 강렬'), '여러 개 고르는 칸은 여러 개 켜짐');
  ok(
    JSON.stringify(labelsOn('genre')) === JSON.stringify(genreBefore),
    '끈 칸은 손대지 않음'
  );
  ok(
    labelsOn('tempo').length === 1 && labelsOn('tempo')[0] === '빠른 (130-150)',
    `하나만 고르는 칸은 하나만 켜짐 (${labelsOn('tempo')[0]})`
  );
  ok(root.textContent.includes('맞췄습니다'), '무엇을 바꿨는지 알려 줌');

  // 표기가 다른 장르('다크팝')도 실제로 켜지는지 — 이번엔 전부 적용합니다.
  click($('[data-fit]'));
  await settle();
  click($('[data-fit-go]'));
  await settle();
  ok(labelsOn('genre').includes('다크 팝') && labelsOn('genre').includes('트랩'), `표기가 달라도 장르가 바뀜 (${labelsOn('genre').join(', ')})`);

  // 주제를 바꾸고 설정을 안 맞추면 알려 줌
  const hint = () => root.querySelector('[data-fit-hint]');
  ok(hint() && hint().style.display === 'none', '방금 맞춘 주제에는 안내가 없음');
  $('[data-f=concept]').value = '봄날 첫 데이트';
  $('[data-f=concept]').dispatchEvent(new window.Event('input', { bubbles: true }));
  ok(hint() && hint().style.display !== 'none' && hint().textContent.includes('아직 설정을 맞추지 않았습니다'), '주제를 바꾸면 설정을 다시 맞추라고 알려 줌');

  calls.length = 0;
}

console.log('\n주제에 맞게 분위기 고르기:');
{
  // 화면에 보이는 한글은 라벨이고 data-value는 영어입니다.
  const onNow = () => [...root.querySelectorAll('[data-pills="mood"] .pill.on')].map((p) => p.textContent);

  // 주제와 부딪히는 분위기를 일부러 켜 둡니다.
  root.querySelectorAll('[data-pills="mood"] .pill').forEach((p) => {
    p.classList.toggle('on', ['여유로운 위협', '관능적', '신비로운'].includes(p.textContent));
  });
  ok(onNow().includes('여유로운 위협'), '부딪히는 분위기를 켜 둔 상태에서 시작');

  $('[data-f=concept]').value = '';
  click($('[data-mood-fit]'));
  await settle();
  ok(calls.length === 0, '주제가 비면 호출하지 않음');

  $('[data-f=concept]').value = '분노 그 자체가 사람이 된 이야기';
  click($('[data-mood-fit]'));
  await settle();

  ok(calls.length === 1, 'Gemini를 한 번 호출함');
  ok(calls[0].prompt.length < 1200, `프롬프트가 짧음 (${calls[0].prompt.length}자)`);
  ok(
    calls[0].prompt.split('지금 켜져 있는 것')[1]?.includes('여유로운 위협'),
    '지금 켜진 분위기를 라벨로 알려 줌'
  );
  ok(calls[0].prompt.includes('에너지 폭발'), '고를 수 있는 목록을 넘김');

  const after = onNow();
  ok(after.includes('에너지 폭발') && after.includes('다크하고 강렬'), `골라 준 것이 켜짐 (${after.join(', ')})`);
  ok(!after.includes('여유로운 위협'), '부딪히던 분위기가 꺼짐');
  ok(root.textContent.includes('부딪힙니다'), '왜 그렇게 골랐는지 보여 줌');
  ok(!root.textContent.includes('없는분위기'), '목록에 없는 값은 무시함');

  calls.length = 0;
}

console.log('\n1단계 — 후보 뽑기:');
ok(!!$('[data-seed]'), '"후보 먼저 보기" 버튼이 있음');
ok(!!$('[data-go]'), '"바로 전부 만들기" 버튼도 남아 있음');

// 주제를 비운 채 누르면 막혀야 합니다.
$('[data-f=concept]').value = '';
click($('[data-seed]'));
await settle();
ok(calls.length === 0, '주제가 비면 호출하지 않음');

$('[data-f=concept]').value = '오래 준비한 배신';
click($('[data-seed]'));
await settle();

ok(calls.length === 1, 'Gemini를 한 번 호출함');
const seedCall = calls[0];
// 절대값이 아니라 완성 프롬프트와 견줍니다. 화자 지침이 길어져도 뜻은 유지됩니다.
seedPromptLen = seedCall.prompt.length;
ok(!seedCall.prompt.includes('구조 태그'), '전체 작사 규칙은 안 실림');
ok(!seedCall.prompt.includes('줄 끝에 악기 신호'), '태그 규칙도 안 실림');
// gemini.js가 thinking 몫을 얹으므로 절대값이 아니라 완성 호출과 견줍니다.
const seedBudget = seedCall.maxOutputTokens;

const items = root.querySelectorAll('.seed-item');
ok(items.length === 3, `후보 ${items.length}개가 화면에 그려짐`);
ok(root.textContent.includes('문은 내가 닫았어'), '후보 훅이 보임');

console.log('\n2단계 — 고른 것만 완성:');
click($('[data-seed-go]'));
await settle();
ok(calls.length === 1, '아무것도 안 고르면 완성하지 않음');

root.querySelectorAll('[data-seed-pick]')[0].checked = true;
root.querySelectorAll('[data-seed-pick]')[2].checked = true;
click($('[data-seed-go]'));
await new Promise((r) => setTimeout(r, 250));

const full = calls.slice(1);
const fullLenForCheck = full[0].prompt.length;
ok(full.length === 2, `고른 2개만 생성 호출 (${full.length}회)`);
ok(
  full.every((c) => c.prompt.includes('이 곡은 이미 정해졌습니다')),
  '완성 프롬프트에 씨앗 블록이 들어감'
);
ok(full[0].prompt.includes('문은 내가 닫았어'), '1번 후보의 훅이 전달됨');
ok(full[1].prompt.includes('지켜본 사람'), '3번 후보가 전달됨 (2번은 제외)');
ok(
  full.every((c) => c.prompt.includes('노래 1곡을 만들어 주세요')),
  '한 곡씩 집중해서 생성함'
);
ok(!root.querySelector('.seed-item'), '완성 후 후보 목록이 치워짐');
ok(root.textContent.includes('문은 내가 닫았어'), '완성 결과가 화면에 나옴');

ok(
  fullLenForCheck < 9000 && seedPromptLen < fullLenForCheck,
  `작사 지시문이 짧음 — 완성 ${fullLenForCheck}자 (예전 약 2만 9천 자), 후보 ${seedPromptLen}자`
);
ok(
  seedBudget < full[0].maxOutputTokens / 2,
  `후보 단계 출력 예산이 완성의 절반 미만 (${seedBudget} vs ${full[0].maxOutputTokens})`
);

console.log('\n토큰 비교 — 후보 5개 중 2곡을 건지는 경우:');
const seedLen = seedCall.prompt.length;
const fullLen = full[0].prompt.length;
const twoStage = seedLen + fullLen * 2;
const oldWay = fullLen * 3; // 예전: 5곡을 2곡씩 3번 나눠 전부 씀
console.log(`  지금  후보 ${seedLen}자 + 완성 ${fullLen}자 × 2 = ${twoStage.toLocaleString()}자`);
console.log(`  예전  5곡 전부 완성 (2곡씩 3회)     ≈ ${oldWay.toLocaleString()}자`);
ok(twoStage < oldWay, `입력이 ${Math.round((1 - twoStage / oldWay) * 100)}% 줄어듦`);
console.log(`  ※ 출력 쪽은 차이가 더 큽니다. 버릴 3곡의 가사와 스타일을 아예 안 씁니다.`);

console.log('\n3막 7장 — 후보도 구성에 맞게:');
{
  const pill = (name, value) => click(root.querySelector(`[data-pills="${name}"] .pill[data-value="${value}"]`));
  pill('form', 'threeActs');
  pill('actOpen', 'hook');
  await settle(30);
  calls.length = 0;
  click($('[data-seed]'));
  await settle();
  const c = calls[0];
  ok(c?.prompt.includes('이 곡들은 3막 7장으로 씁니다'), '3막 7장이면 한 순간이 아니라 이야기 한 편을 뽑게 함');
  ok(c?.prompt.includes('결말 장면') && c?.prompt.includes('처음 장면'), '훅 먼저 — 결말 장면과 처음 장면을 따로 받음');
  ok(c?.responseSchema?.properties?.items?.properties?.origin || c?.prompt.includes('- origin:'), '훅 먼저 — 처음 장면(origin) 칸을 받음');
  ok(c?.prompt.includes('- twist:'), '6장 반전(twist) 칸을 받음');

  calls.length = 0;
  click($('[data-seed-again]'));
  await settle();
  ok(calls[0]?.prompt.includes('방금 보여 준 후보'), '후보 다시 뽑기 — 직전 후보를 넘겨 겹치지 않게 함');

  pill('actOpen', 'build');
  await settle(30);
  calls.length = 0;
  click($('[data-seed]'));
  await settle();
  ok(calls[0]?.prompt.includes('절정을 여기 두지 마세요') && !calls[0]?.prompt.includes('- origin:'),
    '쌓아 올리기 — 출발 장면은 절정이 아니어야 하고, 처음 장면 칸은 없음');

  pill('actOpen', 'hook');
  await settle(30);
  const where = root.querySelector('[data-where-forced]')?.textContent || '';
  ok(where.includes('곡 구성을') && !where.includes('인트로를 "짧게"나'), '구성 때문에 잠기면 구성을 바꾸라고 안내 (인트로가 이미 짧게라 따라 할 수 없던 안내 수정)');

  pill('form', 'standard');
  await settle(30);
  calls.length = 0;
  click($('[data-seed]'));
  await settle();
  ok(!calls[0]?.prompt.includes('3막 7장') && !calls[0]?.prompt.includes('- twist:'), '기본 구성은 예전처럼 한 순간만 뽑음');
}

console.log('\n가사 꼴 레퍼런스:');
{
  const src = $('[data-pat-src]');
  ok(!!src && !!$('[data-pat-list]'), '가사를 붙여 넣는 칸과 목록이 있음');
  ok(root.querySelector('input[name=pat]:checked')?.value === '', "처음엔 '쓰지 않기'");

  src.value = 'short';
  calls.length = 0;
  click($('[data-pat-go]'));
  await settle();
  ok(calls.length === 0, '너무 짧은 가사는 보내지 않음');

  $('[data-pat-style]').value = 'dark pop, breathy female vocals, 808 bass, plucked synth, 98 BPM';
  $('[data-pat-exclude]').value = 'male vocals, distortion';
  src.value = '[Verse 1]\nI count the cars outside your window tonight\nnobody comes\n[Chorus]\nCome on back\nCome on back\n' + 'la la la\n'.repeat(10);
  click($('[data-pat-go]'));
  await settle();
  ok(calls[0]?.prompt.includes('원문을 옮겨 적지 마세요'), '꼴만 뽑고 문장은 옮기지 말라고 함');
  ok(calls[0]?.prompt.includes('════════ 스타일 프롬프트') && calls[0]?.prompt.includes('════════ 피할 요소'), '가사·스타일·피할 요소를 함께 보냄');
  ok(src.value === '' && $('[data-pat-style]').value === '' && $('[data-pat-exclude]').value === '', '분석이 끝나면 붙여 넣은 원문을 모두 지움');
  const saved = JSON.parse(store.get('plimusic:patterns') || '[]')[0];
  ok(saved?.name === '짧게 끊는 주고받기 팝', '꼴을 저장함');
  ok(saved && !saved.spec.includes('count the cars outside'), '꼴 설명에 섞인 원문 인용은 지우고 저장', ` — ${saved?.spec.split('\n').find((l) => l.startsWith('말투'))}`);
  ok(!JSON.stringify(saved).includes('nobody comes'), '가사 원문은 어디에도 저장하지 않음');
  ok(root.querySelector('input[name=pat]:checked')?.value === saved?.id, '새로 뽑은 꼴이 바로 골라짐');

  calls.length = 0;
  click($('[data-go]'));
  await settle(250);
  ok(calls[0]?.prompt.includes('가사 꼴 레퍼런스') && calls[0]?.prompt.includes('두 단어 명령문'), '작사 지시문에 꼴이 실림');
  ok(calls[0]?.prompt.includes('원곡의 문장이나 단어를 가져오지 마세요'), '작사 단계에서도 원곡 문장을 가져오지 말라고 함');
  ok(calls[0]?.prompt.includes("줄 수는 아래 '이번 곡의 구성'을 따릅니다"), '구간 줄 수는 구성표가 정함 (꼴과 곡 길이가 부딪히지 않게)');
  ok(calls[0]?.prompt.includes('[스타일 꼴]') && calls[0]?.prompt.includes('쓰는 방식과 길이는 위 [스타일 꼴]을 따릅니다'), '스타일도 인기곡의 쓰는 방식을 따름 (650~900자 문단 규격 대신)');
  ok(!calls[0]?.prompt.includes('650~900자'), '레퍼런스 스타일 꼴이 있으면 긴 문단 규격을 주지 않음 (서로 부딪히지 않게)');
  ok(calls[0]?.prompt.includes('exclude 를 이 범주와 개수에 맞춰'), '피할 요소도 꼴을 따름');
  ok(calls[0]?.prompt.includes("장르·보컬·템포는 아래 '모든 곡이 지킬 것'을 따릅니다"), '내가 고른 장르·보컬·템포가 레퍼런스 소리보다 먼저');

  // 후보 뽑기에도 꼴이 실리고, 화면에 무엇으로 뽑았는지 보임
  calls.length = 0;
  click($('[data-seed]'));
  await settle();
  ok(calls[0]?.prompt.includes('레퍼런스 꼴 — 후보도 이 꼴로'), '후보 뽑기에도 고른 꼴이 실림');
  ok(($('[data-seed-used]')?.textContent || '').includes('짧게 끊는 주고받기 팝'), '후보 목록 위에 어떤 꼴로 뽑았는지 보여 줌');
  ok(root.textContent.includes('후렴 스케치가 없습니다'), '후렴 스케치가 비어 오면 알려 줌');

  click(root.querySelector('[data-del-pat]'));
  await settle();
  ok(JSON.parse(store.get('plimusic:patterns') || '[]').length === 0 && root.querySelector('input[name=pat]:checked')?.value === '', '빼면 목록에서 사라지고 쓰지 않기로');
}

console.log(failed ? `\n${failed}개 항목이 실패했습니다.` : '\n모두 통과.');
process.exit(failed ? 1 : 0);
