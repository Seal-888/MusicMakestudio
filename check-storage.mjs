/**
 * 저장소가 데이터를 잃지 않는지 확인합니다.
 *
 * 왜 필요한가:
 * 두 가지가 조용히 데이터를 삼킬 수 있습니다.
 * 1) 이름을 바꾸면서 예전 접두사로 저장된 것을 못 찾는 경우
 * 2) 저장 공간이 꽉 찼는데 성공한 것처럼 넘어가는 경우
 * 둘 다 화면에는 아무 표시가 안 나기 때문에, 여기서 미리 잡아야 합니다.
 *
 * 쓰는 법:
 *   node check-storage.mjs
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

let failed = 0;
const ok = (cond, label) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failed++;
};

/** 브라우저 localStorage를 흉내 냅니다. full을 켜면 공간이 꽉 찬 상태가 됩니다. */
function mockBrowser(seed = []) {
  const store = new Map(seed);
  const state = { full: false, events: [] };

  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (state.full) {
        const err = new Error('quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
  };

  // Object.keys(localStorage)가 저장된 키를 돌려주도록 합니다.
  const origKeys = Object.keys;
  Object.keys = (o) => (o === globalThis.localStorage ? [...store.keys()] : origKeys(o));

  globalThis.window = { dispatchEvent: (e) => state.events.push(e), addEventListener: () => {} };
  globalThis.CustomEvent = class {
    constructor(type, opts) {
      this.type = type;
      this.detail = opts?.detail;
    }
  };
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => 'id-' + Math.random().toString(16).slice(2) },
    configurable: true,
  });

  return { store, state };
}

/* ── 1. 예전 이름으로 저장한 것이 넘어오는지 ───────────────── */
console.log('\n예전 이름(anhmusic:)에서 이전:');
{
  const { store } = mockBrowser([
    ['anhmusic:settings', JSON.stringify({ geminiKey: 'OLD-KEY' })],
    ['anhmusic:songs', JSON.stringify([{ id: 'a', title: '예전에 만든 곡' }])],
    ['anhmusic:styles', JSON.stringify([{ id: 's', label: '예전 스타일' }])],
    ['남의키', 'touch-me-not'],
  ]);

  const { settings, songs, styles } = await import(appUrl('js/store.js') + '?t=1');

  ok(settings.get('geminiKey') === 'OLD-KEY', 'API 키가 넘어옴');
  ok(songs.all()[0]?.title === '예전에 만든 곡', '곡 목록이 넘어옴');
  ok(styles.all()[0]?.label === '예전 스타일', '스타일이 넘어옴');
  ok(store.get('anhmusic:songs') !== undefined, '옛 키를 지우지 않음 — 되돌릴 수 있음');
  ok(store.get('남의키') === 'touch-me-not', '접두사가 다른 키는 건드리지 않음');
}

/* ── 2. 공간이 꽉 찼을 때 조용히 넘어가지 않는지 ───────────── */
console.log('\n저장 공간이 꽉 찬 상황:');
{
  const { state } = mockBrowser();
  const { songs, styles, usage } = await import(appUrl('js/store.js') + '?t=2');

  ok(songs.add({ title: '평소' }) === true, '정상일 때 add()가 true');

  state.full = true;
  state.events.length = 0;
  ok(songs.add({ title: '꽉 참' }) === false, '실패하면 add()가 false');
  ok(state.events.some((e) => e.type === 'store:error'), '실패를 알리는 이벤트가 발생');
  ok(state.events.some((e) => e.detail?.full === true), '용량 초과임을 구분');
  ok(
    !state.events.some((e) => e.type === 'store:change'),
    '실패했는데 저장된 척하지 않음'
  );

  state.full = false;
  for (let i = 0; i < 350; i++) songs.add({ title: 'song' + i });
  ok(songs.all().length === 300, `songs 상한 300 (350개 넣어 ${songs.all().length}개)`);

  for (let i = 0; i < 250; i++) styles.add({ label: 'style' + i });
  ok(styles.all().length === 200, `styles 상한 200 (250개 넣어 ${styles.all().length}개)`);

  ok(usage().bytes > 0, `용량 계산 동작 (${(usage().bytes / 1024).toFixed(1)}KB)`);
}

/* ── 설정 화면에 저장 공간이 보이는지 ────────── */
console.log('\n설정 화면의 저장 공간 표시:');
{
  const { JSDOM } = await import('jsdom');
  const fs = await import('fs');
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), { url: 'https://t.local/' });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.CustomEvent = window.CustomEvent;
  global.HTMLElement = window.HTMLElement;
  global.Blob = window.Blob;
  global.URL = window.URL;
  global.location = window.location;
  Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
  window.matchMedia = () => ({ matches: false, addEventListener() {} });

  const { store } = mockBrowser();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: global.localStorage });
  // 곡을 잔뜩 넣어 공간을 차지하게 합니다.
  const { songs } = await import(appUrl('js/store.js') + '?t=3');
  for (let i = 0; i < 40; i++) songs.add({ title: 'song' + i, lyrics: 'x'.repeat(900) });

  const { default: renderSettings } = await import(appUrl('js/pages/settings.js') + '?t=3');
  const root = window.document.createElement('div');
  window.document.body.appendChild(root);
  renderSettings(root);

  ok(!!root.querySelector('.usage-bar'), '저장 공간 막대가 그려짐');
  ok(/저장 공간[\s\S]*?\d+% · \d+KB/.test(root.textContent), '비율과 용량이 보임');
  const w = root.querySelector('.usage-bar i')?.style.width || '';
  ok(/^\d+%$/.test(w), `막대 길이가 비율을 따름 (${w})`);
}

console.log(failed ? `\n${failed}개 항목이 실패했습니다.` : '\n모두 통과.');
process.exit(failed ? 1 : 0);
