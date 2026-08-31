/**
 * 가사 만들기 버튼을 실제로 눌러 결과 화면까지 확인합니다.
 *
 * 왜 필요한가:
 * 화면이 열리는 것과 버튼이 동작하는 것은 다릅니다.
 * 버튼을 눌렀을 때 실행되는 코드는 실제로 눌러 봐야 확인됩니다.
 *
 * 쓰는 법:
 *   npm install jsdom
 *   APP_DIR=. node check-flow.mjs
 */
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
/** 동적 import는 반드시 file:// URL로 넘겨야 합니다.
 *  상대경로를 그대로 넘기면 Node가 npm 패키지 이름으로 오해합니다. */
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
  url: 'http://localhost:8383/',
  pretendToBeVisual: true,
});
const { window } = dom;

global.window = window;
global.document = window.document;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.location = window.location;
global.CustomEvent = window.CustomEvent;
global.Blob = window.Blob;
global.URL = window.URL;
global.HTMLElement = window.HTMLElement;

const fakeCrypto = { randomUUID: () => 'x' + Math.random().toString(16).slice(2) };
Object.defineProperty(global, 'crypto', { value: fakeCrypto, configurable: true });
Object.defineProperty(window, 'crypto', { value: fakeCrypto, configurable: true });

const store = new Map([
  ['anhmusic:settings', JSON.stringify({ geminiKey: 'TEST', geminiModel: 'gemini-3.5-flash' })],
]);
const ls = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
Object.defineProperty(window, 'sessionStorage', {
  value: { getItem: () => null, setItem() {}, removeItem() {} },
  configurable: true,
});
global.localStorage = ls;
global.sessionStorage = window.sessionStorage;
global.alert = (m) => console.log('  [알림]', m);

let calls = 0;
let sentPrompt = '';
global.fetch = async (url, opt) => {
  calls++;
  sentPrompt = JSON.parse(opt.body).contents[0].parts.at(-1).text;
  // 곡마다 전용 스타일이 함께 오는 형식입니다.
  const payload = {
    songs: [
      {
        title: '우산을 놓고 왔다',
        titleAlt: '젖은 소매',
        lyrics: '[Verse 1 - Soft]\nstill pour two cups\n(Oh-ooh)',
        style: 'A male vocalist sings over a dark pop piece. 96 BPM.',
        exclude: 'hiss, noise',
        styleNote: '가사가 조용해서 편성을 덜어 냈습니다',
      },
      {
        title: '라이터가 없어',
        titleAlt: '담뱃불',
        lyrics: '[Chorus]\nI own the sky (yeah)',
        style: 'A male vocalist sings over a trap-leaning piece. 108 BPM.',
        exclude: 'hiss, distortion',
        styleNote: '몰아붙이는 가사라 드럼을 앞으로 냈습니다',
      },
    ],
  };
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }],
      usageMetadata: {},
    }),
  };
};

const container = window.document.createElement('div');
window.document.getElementById('view').replaceChildren(container);
const page = await import(appUrl('js/pages/music.js'));
page.default(container);

let failed = 0;
const check = (ok, label, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra}`);
  if (!ok) failed++;
};

// 주제는 이제 비어 있는 것이 기본이므로 검사에서 채워 넣습니다.
container.querySelector('[data-f=concept]').value = '빌런 플레이리스트 테스트';
container.querySelector('[data-go]').click();
await new Promise((r) => setTimeout(r, 700));

const out = container.querySelector('[data-out]');
console.log('가사 만들기:');
check(calls === 3, 'Gemini 호출 3회 (5곡 → 2+2+1)', ` — 실제 ${calls}회`);
check(!/실패했습니다/.test(out.innerHTML), '실패 메시지 없음');
for (const [label, sel] of [
  ['곡별 스타일', '.songstyle'],
  ['가사 편집칸', '[data-lyrics]'],
  ['예상 길이 표시', '.lenbadge'],
  ['보관함 저장', '[data-save-style]'],
  ['메타데이터 저장', '[data-save-song]'],
  ['노래 만들기', '[data-make-song]'],
  ['제목 다시 뽑기', '[data-retitle]'],
  ['발음 바꾸기', '[data-mumble]'],
  ['더 만들기', '[data-more]'],
]) {
  const n = out.querySelectorAll(sel).length;
  check(n > 0, label, ` ${n}개`);
}

console.log('\n프롬프트 내용:');
for (const [label, needle] of [
  ['화자 지침', '이미 이긴 사람의 말투'],
  ['총 줄 수 지정', '모두 합쳐'],
  ['정확한 줄 수', '정확히 7줄'],
  ['구간별 역할', 'Bridge — 곡 전체에서'],
  ['최종 체크리스트', '내보내기 전에 스스로 확인'],
]) check(sentPrompt.includes(needle), label);

console.log('\n버튼 동작:');
out.querySelector('[data-save-style]').click();
out.querySelector('[data-save-song]').click();
await new Promise((r) => setTimeout(r, 100));
const savedStyle = JSON.parse(store.get('anhmusic:styles') || '[]')[0];
check(!!savedStyle, '스타일 보관함 저장');
check(savedStyle?.prompt?.includes('96 BPM'), '곡별 스타일이 그대로 저장됨');
check(JSON.parse(store.get('anhmusic:songs') || '[]').length > 0, '메타데이터 저장');

const box = out.querySelector('[data-lyrics]');
box.value = '고친 가사입니다';
box.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 50));
out.querySelectorAll('[data-save-song]')[0].click();
await new Promise((r) => setTimeout(r, 50));
check(
  JSON.parse(store.get('anhmusic:songs') || '[]')[0]?.lyrics === '고친 가사입니다',
  '고친 가사가 저장에 반영됨'
);

out.querySelector('[data-make-song]').click();
await new Promise((r) => setTimeout(r, 100));
check((out.querySelector('.song-studio')?.innerHTML || '').length > 100, '노래 만들기 패널 열림');

calls = 0;
out.querySelector('[data-more]').click();
await new Promise((r) => setTimeout(r, 800));
check(calls === 3, '더 만들기 3회 호출', ` — 실제 ${calls}회`);

console.log(failed ? `\n${failed}개 항목이 실패했습니다.` : '\n모두 통과.');
process.exit(failed ? 1 : 0);
