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
const FAKE_SEEDS = [
  { title: '문은 내가 닫았어', angle: '떠난 쪽의 시선', hook: '문은 내가 닫았어', opening: '불은 껐어', soundNote: '느린 808에 현악' },
  { title: '두 번째 봄', angle: '한참 뒤의 회상', hook: '봄이 또 왔더라', opening: '창을 열었어', soundNote: '피아노 중심, 담백하게' },
  { title: '지켜본 사람', angle: '제3자 시점', hook: '나는 다 봤어', opening: '길 건너에서', soundNote: '차가운 신스 패드' },
];

global.fetch = async (url, opts = {}) => {
  const sent = JSON.parse(opts.body || '{}');
  const prompt = sent.contents?.[0]?.parts?.at(-1)?.text || '';
  const cfg = sent.generationConfig || {};
  calls.push({ prompt, maxOutputTokens: cfg.maxOutputTokens, schema: cfg.responseSchema });

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

  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }],
    }),
  };
};

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
ok(seedCall.prompt.length < 2000, `씨앗 프롬프트가 짧음 (${seedCall.prompt.length}자)`);
ok(!seedCall.prompt.includes('구조 태그'), '전체 작사 규칙은 안 실림');
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
ok(full.length === 2, `고른 2개만 생성 호출 (${full.length}회)`);
ok(
  full.every((c) => c.prompt.includes('이 곡은 이미 정해졌습니다')),
  '완성 프롬프트에 씨앗 블록이 들어감'
);
ok(full[0].prompt.includes('문은 내가 닫았어'), '1번 후보의 훅이 전달됨');
ok(full[1].prompt.includes('지켜본 사람'), '3번 후보가 전달됨 (2번은 제외)');
ok(
  full.every((c) => c.prompt.includes('한 번에 노래 1곡')),
  '한 곡씩 집중해서 생성함'
);
ok(!root.querySelector('.seed-item'), '완성 후 후보 목록이 치워짐');
ok(root.textContent.includes('문은 내가 닫았어'), '완성 결과가 화면에 나옴');

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

console.log(failed ? `\n${failed}개 항목이 실패했습니다.` : '\n모두 통과.');
process.exit(failed ? 1 : 0);
