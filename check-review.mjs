/**
 * 유튜브 데이터를 쓰는 화면들과, 검토에서 고친 것들이 되돌아가지 않는지 봅니다.
 *
 * 왜 필요한가:
 * 채널 분석기 · 레퍼런스 분석 · 수익 분석 · 플리 스타일 분석은 검사가 하나도 없었습니다.
 * 숫자가 틀려도 화면에는 그럴듯하게 나오기 때문에, 눈으로는 잘 안 잡힙니다.
 *
 * 쓰는 법:
 *   node check-review.mjs
 */
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

let failed = 0;
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra}`);
  if (!cond) failed++;
};
const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

/* ── 브라우저 흉내 ── */
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
global.Event = window.Event;
global.Blob = window.Blob;
global.URL = window.URL;
global.HTMLElement = window.HTMLElement;
const fc = { randomUUID: () => 'x' + Math.random().toString(16).slice(2) };
Object.defineProperty(global, 'crypto', { value: fc, configurable: true });
Object.defineProperty(window, 'crypto', { value: fc, configurable: true });

const store = new Map([
  ['plimusic:settings', JSON.stringify({ geminiKey: 'G', geminiModel: 'gemini-3.5-flash', youtubeKey: 'Y', kieKey: 'OLD' })],
  ['plimusic:jobs', '[]'],
  ['plimusic:health', JSON.stringify({ gemini: 'ok', kie: 'ok' })],
]);
const ls = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
const ss = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(window, 'sessionStorage', { value: ss, configurable: true });
global.localStorage = ls;
global.sessionStorage = ss;
const alerts = [];
global.alert = (m) => alerts.push(m);
global.confirm = () => true;

/* ── 가짜 유튜브 · Gemini ── */
const DAY = 86400000;
const now = Date.now();
const iso = (daysAgo) => new Date(now - daysAgo * DAY).toISOString();
// 영상 ID는 유튜브처럼 11자여야 주소에서 읽힙니다.
const VIDEOS = {
  oldVideo000: { title: '오래된 대박', views: 1_000_000, days: 1000, dur: 'PT1H' },
  hotVideo000: { title: '요즘 잘 되는 영상', views: 300_000, days: 30, dur: 'PT1H' },
  flopVideo00: { title: '안 되는 영상', views: 2_000, days: 200, dur: 'PT1H' },
  babyVideo00: { title: '어제 올린 영상', views: 100, days: 1, dur: 'PT1H' },
  shortVideo0: { title: '쇼츠', views: 500_000, days: 60, dur: 'PT45S' },
  songVideo00: { title: '노래 한 곡', views: 10_000, days: 100, dur: 'PT3M20S' },
};
const item = (id) => ({
  id,
  snippet: { title: VIDEOS[id].title, publishedAt: iso(VIDEOS[id].days), channelId: 'UC' + 'x'.repeat(22) },
  statistics: { viewCount: String(VIDEOS[id].views), likeCount: '1', commentCount: '1' },
  contentDetails: { duration: VIDEOS[id].dur },
});

let geminiBodies = [];
let geminiReply = {};
global.fetch = async (url, opt) => {
  const u = new URL(url);
  if (u.hostname === 'www.googleapis.com') {
    const p = u.pathname.split('/').pop();
    const q = Object.fromEntries(u.searchParams);
    let body = {};
    if (p === 'channels') {
      body = {
        items: [{
          id: 'UC' + 'x'.repeat(22),
          snippet: { title: '테스트 채널', description: '', publishedAt: iso(2000) },
          statistics: { subscriberCount: '1000', videoCount: '6' },
          contentDetails: { relatedPlaylists: { uploads: 'UU1' } },
        }],
      };
    } else if (p === 'playlistItems') {
      body = { items: Object.keys(VIDEOS).map((id) => ({ contentDetails: { videoId: id } })) };
    } else if (p === 'videos') {
      body = { items: q.id.split(',').filter((id) => VIDEOS[id]).map(item) };
    }
    return { ok: true, status: 200, json: async () => body };
  }
  // Gemini
  geminiBodies.push(JSON.parse(opt.body));
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(geminiReply) }] } }] }),
  };
};

const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

/* ───────── kie.ai 흔적 ───────── */
console.log('kie.ai 제거:');
{
  await import(appUrl('js/store.js'));
  const s = JSON.parse(store.get('plimusic:settings'));
  ok(!('kieKey' in s), '남아 있던 kie.ai 키를 지움 (백업에 실려 나가지 않게)');
  ok(s.geminiKey === 'G' && s.youtubeKey === 'Y', '다른 키는 그대로');
  ok(!store.has('plimusic:jobs'), 'kie.ai 작업 기록을 지움');
  ok(!('kie' in JSON.parse(store.get('plimusic:health'))), '연결 상태에서 kie.ai를 뺌');
  ok(!document.querySelector('[data-svc="kie"]'), '사이드바에 kie.ai 연결 상태가 없음');
  ok(!fs.existsSync(path.join(ROOT, 'js/api/kie.js')), 'kie.js 파일이 없음');
  const py = fs.readFileSync(path.join(ROOT, 'serve.py'), 'utf8');
  ok(!/\/kie|\/grab|api\.kie\.ai/.test(py), 'serve.py 에 kie.ai 중계·음원 통로가 없음');
}

/* ───────── 영상 통계 ───────── */
console.log('\n영상 통계:');
{
  const { toVideo, rankByPerDay } = await import(appUrl('js/videostats.js'));
  const vids = Object.keys(VIDEOS).map((id) => toVideo(item(id)));
  const by = Object.fromEntries(vids.map((v) => [v.id, v]));
  ok(by.hotVideo000.perDay > by.oldVideo000.perDay, '하루 평균으로 보면 최근 영상이 오래된 대박보다 위', ` (${by.hotVideo000.perDay} > ${by.oldVideo000.perDay})`);
  ok(by.shortVideo0.isShort && !by.songVideo00.isShort, '1분 이하만 쇼츠, 3분짜리 노래는 쇼츠가 아님');
  const { top, bottom } = rankByPerDay(vids, 3);
  ok(top[0].id === 'shortVideo0' || top[0].id === 'hotVideo000', '잘 되는 영상 1위가 하루 평균 기준');
  ok(!bottom.some((v) => v.id === 'babyVideo00'), '어제 올린 영상은 안 되는 영상에 넣지 않음');
  ok(bottom[0].id === 'flopVideo00', '진짜 안 되는 영상이 맨 위');
}

/* ───────── 채널 분석기 ───────── */
console.log('\n채널 분석기:');
{
  const { default: render } = await import(appUrl('js/pages/analyzer.js'));
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(root);
  geminiBodies = [];
  geminiReply = {
    summary: 's', strengths: ['a'], weaknesses: ['b'], titleInsight: 't', lengthInsight: 'l',
    uploadInsight: 'u', nextVideoIdeas: [{ title: 'x', why: 'y' }], actionPlan: ['p'],
  };
  root.querySelector('[data-f=url]').value = '@test';
  click(root.querySelector('[data-go]'));
  await settle(150);
  const prompt = geminiBodies[0]?.contents[0].parts.at(-1).text || '';
  ok(prompt.includes('하루') && prompt.includes('쇼츠'), '프롬프트에 하루 평균 조회수와 쇼츠 표시가 들어감');
  ok(prompt.includes('누적이 아니라 하루 평균'), '누적으로 비교하지 말라고 함');
  const text = root.textContent;
  ok(text.includes('잘 되는 영상 10개') && text.includes('안 되는 영상 10개'), '상위·하위 목록이 나옴');
  const bottomBlock = [...root.querySelectorAll('.rb')].find((x) => x.textContent.includes('안 되는 영상 10개'));
  ok(bottomBlock && !bottomBlock.textContent.includes('어제 올린 영상'), '하위 목록에 갓 올린 영상이 없음');
}

/* ───────── 레퍼런스 분석 ───────── */
console.log('\n레퍼런스 분석:');
{
  const { default: render } = await import(appUrl('js/pages/planning.js'));
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(root);
  click(root.querySelector('.tab[data-tab="ref"]'));
  geminiBodies = [];
  geminiReply = {
    genreEstimate: 'g', moodEstimate: 'm', bpmEstimate: 'b', thumbnailStyle: 't',
    titlePattern: 'p', viewPattern: 'v', successFormula: ['s'], copyableElements: ['c'],
  };
  root.querySelector('[data-f=url]').value = '@test';
  click(root.querySelector('[data-go]'));
  await settle(150);
  const prompt = geminiBodies[0]?.contents[0].parts.at(-1).text || '';
  ok(prompt.includes('소리도 썸네일도 보지 못했습니다'), '보지 못한 것은 지어내지 말라고 함');
  ok(prompt.includes('안 되는 영상'), '안 되는 영상도 함께 넘겨 비교하게 함');
  ok(root.textContent.includes('장르 (추정)') && root.textContent.includes('썸네일 (추정)'), '화면에 추정이라고 표시');
}

/* ───────── 플리 스타일 분석 — 듣는 구간 ───────── */
console.log('\n플리 스타일 분석:');
{
  const { default: render } = await import(appUrl('js/pages/planning.js'));
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(root);
  click(root.querySelector('.tab[data-tab="sound"]'));
  geminiReply = {
    overview: 'o', genre: 'g', bpm: '90', key: 'C', vocal: 'v', instruments: [], production: 'p',
    structure: 's', sunoPrompts: [{ label: 'a', prompt: 'x'.repeat(500) }], negativePrompt: 'n', tips: [],
  };

  // 3분 20초짜리 노래 한 곡 — 예전에는 '중간부터'가 5:00부터라 영상이 끝난 뒤를 들으라고 했습니다.
  geminiBodies = [];
  root.querySelector('[data-f=url]').value = 'https://www.youtube.com/watch?v=songVideo00';
  click(root.querySelector('[data-go]'));
  await settle(150);
  const meta = geminiBodies[0]?.contents[0].parts[0].videoMetadata || {};
  ok(meta.startOffset === '10s' && meta.endOffset === '190s', '짧은 영상은 실제 중간(0:10~3:10)을 들음', ` (${meta.startOffset}~${meta.endOffset})`);

  // 직접 지정한 시작이 영상보다 뒤면 보내지 않습니다.
  geminiBodies = [];
  alerts.length = 0;
  click(root.querySelector('[data-pills="where"] .pill[data-value="custom"]'));
  root.querySelector('[data-f=start]').value = '10:00';
  click(root.querySelector('[data-go]'));
  await settle(150);
  ok(!geminiBodies.length && alerts.some((a) => a.includes('영상 길이')), '영상 길이보다 뒤에서 시작하면 막고 알려 줌');

  const src = fs.readFileSync(path.join(ROOT, 'js/pages/planning.js'), 'utf8');
  ok(/MAX_UPLOAD_MB = 1[0-5]\b/.test(src), '업로드 한도가 Gemini 요청 한도(20MB, base64 4/3배) 안쪽');
}

/* ───────── 수익 분석 ───────── */
console.log('\n수익 분석:');
{
  const { default: render } = await import(appUrl('js/pages/revenue.js'));
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(root);

  // 영상 주소 → 그 영상 하나만
  root.querySelector('[data-f=url]').value = 'https://www.youtube.com/watch?v=hotVideo000';
  click(root.querySelector('[data-go]'));
  await settle(150);
  ok(root.textContent.includes('이 영상') && !root.textContent.includes('가져온 영상 전체'), '영상 주소를 넣으면 그 영상만 계산');
  // 300,000회 × 300원/1000 = 90,000원
  ok(root.textContent.includes('90,000원'), '조회수 × 단가 계산이 맞음 (30만 회 × 300원 = 9만 원)');

  // 채널 → 쇼츠는 쇼츠 단가로
  root.querySelector('[data-f=url]').value = '@test';
  click(root.querySelector('[data-go]'));
  await settle(150);
  const all = [...root.querySelectorAll('.rb')].find((x) => x.textContent.includes('가져온 영상 전체'));
  const lowText = all?.querySelector('.money b')?.textContent || '';
  // 일반: (1,000,000 + 300,000 + 2,000 + 100 + 10,000) × 0.3 = 393,630 / 쇼츠: 500,000 × 0.02 = 10,000
  ok(lowText === '403,630원', '쇼츠는 쇼츠 단가로 따로 계산', ` (${lowText})`);
  ok(all?.textContent.includes('쇼츠 1개'), '쇼츠가 몇 개인지 알려 줌');

  // 낮은 값이 높은 값보다 크게 들어오면 바꿔 씁니다.
  root.querySelector('[data-f=low]').value = '2000';
  root.querySelector('[data-f=high]').value = '500';
  root.querySelector('[data-f=url]').value = 'https://www.youtube.com/watch?v=hotVideo000';
  click(root.querySelector('[data-go]'));
  await settle(150);
  ok(root.textContent.includes('RPM: 500원 ~ 2,000원'), '낮게·높게를 거꾸로 넣어도 바로잡음');
}

/* ───────── SRT ───────── */
console.log('\nSRT 읽기:');
{
  const { parseSrt } = await import(appUrl('js/lyrics.js'));
  const a = parseSrt('1\n00:00:12,34 --> 00:00:15,5\nhi')[0];
  ok(Math.abs(a.start - 12.34) < 1e-9 && Math.abs(a.duration - 3.16) < 1e-9, '밀리초가 두 자리·한 자리여도 맞게 읽음');
  const b = parseSrt('1\n01:02.500 --> 01:04.000\nhi')[0];
  ok(b && Math.abs(b.start - 62.5) < 1e-9, '시를 뺀 표기도 읽음 (예전에는 0초)');
  ok(parseSrt('1\nabc --> def\nhi').length === 0, '시각을 못 읽은 칸은 0초로 몰지 않고 버림');
}

/* ───────── 백업 가져오기 ───────── */
console.log('\n백업 가져오기:');
{
  const { importAll, songs } = await import(appUrl('js/store.js'));
  const before = store.get('plimusic:songs');
  let threw = false;
  try {
    importAll(JSON.stringify([{ label: 'x', prompt: 'y' }])); // 스타일 보관함 파일을 잘못 고른 경우
  } catch {
    threw = true;
  }
  ok(threw && store.get('plimusic:songs') === before, '다른 파일을 고르면 아무것도 바꾸지 않고 거절');
  threw = false;
  try {
    importAll(JSON.stringify({ songs: 'broken' }));
  } catch {
    threw = true;
  }
  ok(threw, '목록 칸이 깨진 파일은 거절');
  importAll(JSON.stringify({ settings: { geminiKey: 'NEW', kieKey: 'K' }, songs: [{ title: 'a', lyrics: 'l' }, { bad: 1 }] }));
  const s = JSON.parse(store.get('plimusic:settings'));
  ok(s.geminiKey === 'NEW' && !('kieKey' in s) && s.youtubeKey === 'Y', '쓰는 칸만 들이고, 백업에 없는 키는 지우지 않음');
  ok(songs.all().length === 1, '가사가 없는 곡은 버림');
}

/* ───────── Gemini 설정 ───────── */
console.log('\nGemini 설정:');
{
  const { callGemini } = await import(appUrl('js/api/gemini.js'));
  geminiBodies = [];
  geminiReply = 'pong';
  await callGemini({ prompt: 'ping', model: 'gemini-2.5-pro' }).catch(() => {});
  ok(geminiBodies[0]?.generationConfig.thinkingConfig.thinkingBudget === 128, '2.5 Pro는 생각 예산 0 대신 최소치 128 (0이면 400 거절)');
  geminiBodies = [];
  await callGemini({ prompt: 'ping', model: 'gemini-2.5-flash' }).catch(() => {});
  ok(geminiBodies[0]?.generationConfig.thinkingConfig.thinkingBudget === 0, '2.5 Flash는 그대로 생각 끔');

  const realFetch = global.fetch;
  global.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  const err = await callGemini({ prompt: 'x' }).catch((e) => e);
  global.fetch = realFetch;
  ok(err?.code === 'NET-FAIL', '두 번 다 끊기면 알아볼 수 있는 오류로 알림', ` (${err?.code || err?.name})`);
}

console.log('\n가사 꼴 — 백업과 원문 인용:');
{
  const { importAll, exportAll, patterns } = await import(appUrl('js/store.js'));
  const { stripQuotes } = await import(appUrl('js/lyrics.js'));
  importAll(JSON.stringify({ patterns: [{ id: 'p1', name: 'a', spec: '요약: x' }, { bad: 1 }] }));
  ok(patterns.all().length === 1, '백업에서 꼴을 되살리고 깨진 칸은 버림');
  ok(JSON.parse(exportAll()).patterns?.length === 1, '백업 파일에 꼴이 들어감');
  const { text, removed } = stripQuotes('말투: I count the cars outside tonight\n요약: 짧게', 'I count the cars outside your window');
  ok(removed === 1 && !text.includes('count the cars') && text.includes('요약: 짧게'), '네 단어 넘는 원문 인용만 지움');
}

console.log(failed ? `\n${failed}개 항목이 실패했습니다.` : '\n모두 통과.');
process.exit(failed ? 1 : 0);
