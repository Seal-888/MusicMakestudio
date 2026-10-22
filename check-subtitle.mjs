/**
 * 자막을 우리말로 바꿔도 시각이 그대로인지 확인합니다.
 *
 * 왜 필요한가:
 * 이 화면의 존재 이유가 '시각을 우리가 만들지 않는 것' 하나입니다.
 * 모델이 번호를 건너뛰거나 순서를 바꿔도 시각이 밀리면 안 됩니다.
 * 자막이 한 칸이라도 밀리면 곡 전체가 어긋나 보이므로 여기서 못 박습니다.
 *
 * 쓰는 법:
 *   node check-subtitle.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

let failed = 0;
const ok = (c, label) => {
  console.log(`  ${c ? '✓' : '✗'} ${label}`);
  if (!c) failed++;
};

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
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
});
global.localStorage = window.localStorage;
window.matchMedia = () => ({ matches: false, addEventListener() {} });

/* ── 캡컷이 내보낸 듯한 SRT. 글자는 일부러 틀리게 두었습니다. ── */
const SRT = `1
00:00:12,340 --> 00:00:15,100
I told you not to look me in the eyes

2
00:00:15,200 --> 00:00:18,640
my fingers slowly turned this dirty crown

3
00:00:18,700 --> 00:00:21,000
the carpet down with oil and bitter wine

4
00:00:21,100 --> 00:00:23,500
yeah

5
00:01:02,000 --> 00:01:05,250
keep your knees down`;

const LYRICS = `[Verse 1]
I told you not to look me in the eyes.
My fingers slowly turn this dirty crown.
The carpet damp with oil and bitter wine.
(Yeah)

[Chorus]
Keep your knees down`;

/* ── 모델은 일부러 어긋나게 답하게 합니다 ── */
const calls = [];
global.fetch = async (url, opts = {}) => {
  const sent = JSON.parse(opts.body || '{}');
  const prompt = sent.contents?.[0]?.parts?.at(-1)?.text || '';
  calls.push({ prompt, cfg: sent.generationConfig || {} });
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  lines: [
                    // 일부러 순서를 뒤집고, 4번을 빠뜨리고, 없는 번호를 하나 넣습니다.
                    { n: '3', en: 'The carpet damp with oil and bitter wine.', ko: '양탄자는 기름과 쉰 술로 젖었고' },
                    { n: '1', en: 'I told you not to look me in the eyes.', ko: '눈 마주치지 말랬지' },
                    { n: '5', en: 'Keep your knees down', ko: '무릎 꿇고 있어' },
                    { n: '99', en: 'nope', ko: '있지도 않은 칸' },
                    { n: '2', en: 'My fingers slowly turn this dirty crown.', ko: '손끝에서 더러운 왕관이 돈다' },
                  ],
                }),
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    }),
  };
};
window.localStorage.setItem('plimusic:settings', JSON.stringify({ geminiKey: 'TEST' }));

const { default: renderSubtitle } = await import(appUrl('js/pages/subtitle.js'));
const { parseSrt } = await import(appUrl('js/lyrics.js'));

const root = window.document.createElement('div');
window.document.body.appendChild(root);
renderSubtitle(root);

const $ = (s) => root.querySelector(s);
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

console.log('\nSRT 읽기:');
$('[data-srt]').value = SRT;
$('[data-srt]').dispatchEvent(new window.Event('input'));
await settle(20);
ok(root.textContent.includes('자막 5칸'), '칸 수를 세어 보여 줌');
ok(root.textContent.includes('1:05'), '끝나는 시각을 보여 줌');

console.log('\n화자 성격 알약:');
{
  const pills = [...root.querySelectorAll('[data-pills="persona"] .pill')];
  ok(pills.length === 5, `알약 ${pills.length}개가 그려짐 (주제 그대로 + 넷)`);
  ok(pills.find((p) => p.classList.contains('on'))?.dataset.value === 'plain', '처음엔 주제 그대로가 켜져 있음');
  ok(pills.filter((p) => p.classList.contains('on')).length === 1, '처음에 하나만 켜져 있음');

  const defiant = pills.find((p) => p.textContent.includes('반항'));
  defiant.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok(defiant.classList.contains('on'), '누르면 켜짐');
  ok(
    pills.filter((p) => p.classList.contains('on')).length === 1,
    '하나만 고르는 묶음이라 앞의 것은 꺼짐'
  );

  const back = pills.find((p) => p.textContent.includes('빌런'));
  back.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok(back.classList.contains('on') && !defiant.classList.contains('on'), '다시 바꿀 수 있음');

  // 고르고 나서야 어떤 지시인지 알면 늦습니다. (말투 안내는 클릭 다음 틱에 바뀝니다)
  await new Promise((r) => setTimeout(r, 10));
  ok(root.textContent.includes('감정을 설명하지 않고'), '고른 말투가 화면에 보임');
  defiant.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await settle(20);
  ok(root.textContent.includes('상대에게 직접 말을 건다'), '바꾸면 설명도 따라 바뀜');
  back.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await settle(20);
}

console.log('\n화자마다 말투가 다른가:');
{
  const { PERSONAS } = await import(appUrl('js/prompts.js'));
  const voices = Object.values(PERSONAS).map((x) => x.voice);
  ok(voices.every(Boolean), '모든 화자에 번역용 말투가 있음');
  ok(new Set(voices).size === voices.length, `${voices.length}개가 서로 다름`);
  ok(voices.every((v) => v.length < 150), `작사 지침보다 훨씬 짧음 (최대 ${Math.max(...voices.map((v) => v.length))}자)`);
}

console.log('\n빠진 값 확인:');
click($('[data-go]'));
await settle(30);
ok(calls.length === 0, '가사 원문이 없으면 호출하지 않음');

console.log('\n옮기기:');
$('[data-lyrics]').value = LYRICS;
$('[data-concept]').value = '이 곡은 7대 죄악 중 교만이다.';
click($('[data-go]'));
await settle(200);

ok(calls.length === 1, '한 번만 호출함');
const p = calls[0].prompt;
ok(p.includes('낮춤말로 씁니다'), '화자 말투를 지시함');
ok(p.includes('감정을 설명하지 않고 한 일만 말한다'), '고른 말투(빌런)가 실림');
// 가사를 '쓸 때'의 지침은 번역에 방해가 되므로 실리면 안 됩니다.
ok(!p.includes('당한 사람이 있어야'), '작사용 지침은 안 실림');
ok(!p.includes('빠져나가려 하지 마세요'), '도망 금지 지침도 안 실림');
ok(p.includes('새로 짓지 말고 있는 것을 옮기세요'), '재창작을 막음');
ok(p.includes('곡 내용을 따릅니다'), '말투와 곡이 어긋나면 곡을 따르게 함');
ok(p.includes('시각은 적지 마세요'), '모델에게 시각을 만들지 못하게 함');
ok(p.includes('The carpet damp with oil'), '정확한 가사 원문을 함께 넘김');
ok(p.includes('가사 원문의 영어 한 줄'), '교정된 영어도 함께 내게 지시함');
ok(p.includes('the carpet down with oil'), '틀린 자동 자막도 함께 넘겨 짝을 맞추게 함');
ok(!/\d{2}:\d{2}:\d{2},\d{3}/.test(p), '프롬프트에 시각 자체를 넣지 않음');

console.log('\n결과 화면:');
ok(root.textContent.includes('4 / 5칸'), '채워진 칸 수를 정확히 셈 (없는 번호 99는 버림)');
const enIn = [...root.querySelectorAll('[data-en]')];
ok(enIn.length === 5, '영어 칸도 줄마다 있음');
ok(
  enIn[2].value === 'The carpet damp with oil and bitter wine.',
  '자동 자막의 틀린 글자(down)가 원문(damp)으로 바로잡힘'
);
ok(enIn[3].value === 'yeah', '못 찾은 칸은 자동 자막 그대로 둠');

const inputs = [...root.querySelectorAll('[data-ko]')];
ok(inputs.length === 5, '칸 수만큼 줄이 그려짐');
ok(inputs[0].value === '눈 마주치지 말랬지', '1번이 제자리에 들어감 (모델이 세 번째로 답했어도)');
ok(inputs[2].value === '양탄자는 기름과 쉰 술로 젖었고', '3번이 제자리에 들어감');
ok(inputs[3].value === '', '빠뜨린 4번은 빈 칸으로 둠');
ok(inputs[4].value === '무릎 꿇고 있어', '5번이 제자리에 들어감');

console.log('\n시각 보존 — 이 화면의 핵심:');
const before = parseSrt(SRT);
// 내려받기 대신 같은 경로로 만들어지는 결과를 직접 확인합니다.
let made = '';
global.URL.createObjectURL = (blob) => {
  made = blob;
  return 'blob:test';
};
global.URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () {};

click(root.querySelector('[data-dl-ko]'));
await settle(30);
const text = await made.text();
const after = parseSrt(text.replace(/^\uFEFF/, ''));

ok(after.length === 4, `빈 칸을 뺀 ${after.length}칸이 나옴`);
const keep = before.filter((_, i) => i !== 3); // 4번은 비었으므로 제외
const same = after.every(
  (b, i) => Math.abs(b.start - keep[i].start) < 0.002 && Math.abs(b.duration - keep[i].duration) < 0.002
);
ok(same, '시작 시각과 길이가 원본과 완전히 동일함');
console.log(`     원본 1번 ${keep[0].start}s → 결과 ${after[0].start}s`);
console.log(`     원본 끝  ${keep[3].start}s → 결과 ${after[3].start}s`);

console.log('\n영어 SRT — 다른 트랙으로 쓸 파일:');
click(root.querySelector('[data-dl-en]'));
await settle(30);
const enSrt = parseSrt((await made.text()).replace(/^\uFEFF/, ''));
ok(enSrt.length === 4, `추임새를 뺀 ${enSrt.length}칸`);
ok(enSrt[0].text === 'I told you not to look me in the eyes.', '교정된 원문이 들어감');
ok(!enSrt[0].text.includes('\n'), '영어만 한 줄');
ok(
  enSrt.every((b, i) => Math.abs(b.start - keep[i].start) < 0.002),
  '한국어 파일과 시각이 완전히 같음 — 캡컷에서 그대로 겹침'
);

console.log('\n두 줄 한 파일:');
click(root.querySelector('[data-dl-both]'));
await settle(30);
const both = parseSrt((await made.text()).replace(/^\uFEFF/, ''));
ok(both.length === 4, '한국어가 빈 추임새 칸은 여기서도 빠짐');
ok(both[0].text.split('\n').length === 2, '한 칸에 두 줄');
ok(both[0].text.startsWith('I told you'), '영어가 위');
ok(both[0].text.endsWith('눈 마주치지 말랬지'), '한국어가 아래');
ok(
  both.every((b, i) => Math.abs(b.start - keep[i].start) < 0.002),
  '두 줄 버전도 시각이 그대로'
);

console.log('\n안내:');
ok(root.textContent.includes('트랙을 나눠 쓰시려면'), '두 트랙 사용법을 알려 줌');
ok(root.textContent.includes('24%'), '캡컷 위치값을 알려 줌');

console.log(failed ? `\n${failed}개 항목이 실패했습니다.` : '\n모두 통과.');
process.exit(failed ? 1 : 0);
