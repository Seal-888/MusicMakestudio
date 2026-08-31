/**
 * 모든 화면을 브라우저 없이 한 번씩 그려 보는 검사입니다.
 *
 * 왜 필요한가:
 * 문법 검사는 통과하지만 "정의되지 않은 변수" 같은 실행 시점 오류는
 * 실제로 화면을 그려 봐야 드러납니다. 그런 오류 하나에 페이지 전체가 안 뜹니다.
 *
 * 쓰는 법 (한 번만 준비):
 *   npm install jsdom
 *   node smoke-test.mjs
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
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, { url: 'http://localhost:8383/', pretendToBeVisual: true });
const { window } = dom;

// 브라우저에만 있는 것들을 최소한으로 흉내 냅니다.
global.window = window;
global.document = window.document;
global.location = window.location;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.CustomEvent = window.CustomEvent;
global.HTMLElement = window.HTMLElement;
global.Blob = window.Blob;
global.URL = window.URL;
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
const fakeCrypto = { randomUUID: () => '00000000-0000-4000-8000-000000000000' };
Object.defineProperty(global, 'crypto', { value: fakeCrypto, configurable: true });
Object.defineProperty(window, 'crypto', { value: fakeCrypto, configurable: true });
const store = new Map();
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}});
Object.defineProperty(window, 'sessionStorage', { configurable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
global.localStorage = window.localStorage;
global.sessionStorage = window.sessionStorage;
window.AudioContext = function () { return { decodeAudioData: async () => ({}), close() {} }; };
window.VideoEncoder = function () {};
window.VideoEncoder.isConfigSupported = async () => ({ supported: true });
window.VideoFrame = function () {};
window.showDirectoryPicker = async () => ({});
window.matchMedia = () => ({ matches: false, addEventListener() {} });
if (!window.HTMLCanvasElement.prototype.getContext) {
  window.HTMLCanvasElement.prototype.getContext = () => null;
}

const pages = [
  ['설정', 'settings'], ['플리채널 기획', 'planning'], ['음악 만들기', 'music'],
  ['영상 만들기', 'video'], ['메타데이터', 'metadata'], ['스타일 보관함', 'styles'],
  ['채널 분석기', 'analyzer'], ['수익 분석', 'revenue'], ['번역+SRT', 'srt'],
  ['타임스탬프', 'timestamp'], ['파형 영상', 'visualizer'], ['캡컷', 'capcut'],
];

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

const modFile = {
  settings: 'settings.js', planning: 'planning.js', music: 'music.js',
  video: 'video.js', metadata: 'metadata.js', styles: 'styles.js',
  analyzer: 'analyzer.js', revenue: 'revenue.js', srt: 'srt.js',
  timestamp: 'timestamp.js', visualizer: 'visualizer.js', capcut: 'capcut.js',
};

let failed = 0;
for (const [label, key] of pages) {
  const container = window.document.createElement('div');
  window.document.getElementById('view').replaceChildren(container);
  try {
    const m = await import(appUrl(path.join('js/pages', modFile[key])) + `?t=${Date.now()}`);
    m.default(container);
    const len = container.innerHTML.length;
    if (len < 200) {
      console.log(`  ✗ ${label.padEnd(12)} 화면이 거의 비었습니다 (${len}자)`);
      failed++;
    } else {
      console.log(`  ✓ ${label.padEnd(12)} ${len.toLocaleString()}자`);
    }
  } catch (err) {
    console.log(`  ✗ ${label.padEnd(12)} ${err.message}`);
    failed++;
  }
}
console.log(failed ? `\n${failed}개 화면에 문제가 있습니다.` : '\n모든 화면 정상.');
process.exit(failed ? 1 : 0);
