import { esc, saveFile } from '../render.js';
import { toast, setLeaveGuard, clearLeaveGuard } from '../ui.js';
import { judge } from '../mastering/engine.js';
import { wavBytes } from '../mastering/wav.js';

/**
 * 마스터링 · 믹스 체크.
 *
 * 곡을 이 브라우저 안에서 측정하고(분석), 기준에서 벗어난 것만 골라(판단),
 * 그만큼만 처리해 발매 음량으로 마감합니다. 계산은 mastering/worker.js 에서 돌고
 * 파일은 어디로도 보내지 않습니다.
 *
 * 이 화면은 오디오를 재생하고 키보드를 듣습니다. 다른 화면으로 넘어가면
 * 소리가 계속 나지 않도록 teardown 에서 전부 정리합니다.
 */
const SR = 48000;
const MAX_SEC = 720;
const MAX_BYTES = 300 * 1024 * 1024;
const STAGES = ['analyze', 'decide', 'process', 'finish'];
const LIGHT = { good: '좋음', warn: '확인', bad: '손보기', fixed: '정리됨' };
const BAND_NAME = { sub: '초저역', low: '저역', himid: '중고역', air: '공기감' };
const AI_VENDORS = /\b(suno|udio|riffusion|mureka|aiva|soundraw|boomy)\b/i;
const KNOBS = [
  ['tone', '톤', '어둡게', '밝게', true],
  ['low', '저역', '타이트하게', '풍성하게', true],
  ['dynamics', '다이내믹', '자연스럽게', '펀치 있게', false],
  ['loudness', '음량', '여유 있게', '최대로', true],
];
const CHECK_TEXT = {
  quiet: (v) => `원본 음량이 낮은 편입니다 (${v} LUFS). 안전하게 끌어올려 작업합니다.`,
  ok: (v) => `음량(${v} LUFS)이 작업하기 좋은 상태입니다. 밸런스 위주로 다듬습니다.`,
  loud: (v) => `이미 큰 편입니다 (${v} LUFS). 음량보다 밸런스에 집중합니다.`,
  crushed: (v) => `원본이 이미 세게 눌려 있습니다 (${v} LUFS). 여유가 적어 조심스럽게 다듬습니다.`,
};
const MIX_TEXT = {
  loud: { name: '음량', unit: 'LUFS', quiet: '발매 기준보다 조용합니다. 마스터링에서 끌어올릴 여유가 충분합니다.', ok: '작업하기 좋은 음량입니다. 마스터링으로 발매 음량까지 깨끗하게 올릴 수 있습니다.', loud: '이미 큰 편입니다. 더 키우기보다 밸런스를 다듬는 편이 낫습니다.', crushed: '크지만 여유가 없습니다. 이미 강하게 압축돼 마스터링으로 할 수 있는 것이 적습니다.' },
  peak: { name: '트루피크', unit: 'dBTP', good: '여유가 충분합니다. 스트리밍 인코딩을 거쳐도 안전합니다.', warn: '천장에 가깝습니다. 인코딩 후 살짝 넘을 수 있습니다.', bad: '클리핑이 있습니다. 레벨을 낮춰 다시 내보내세요.' },
  dyn: { name: '다이내믹 (PLR)', unit: 'dB', good: '피크와 평균의 차이가 적당합니다.', warn: '조금 빡빡합니다. 압축을 덜면 살아납니다.', bad: '심하게 눌려 있습니다. 믹스에서 컴프 · 리미터를 줄이세요.' },
  mud: { name: '저중역 탁함', unit: 'dB', good: '200–500 Hz가 깨끗합니다.', warn: '200–500 Hz가 조금 쌓였습니다. 마스터링으로 정리할 수 있습니다.', bad: '200–500 Hz가 많이 쌓였습니다. 베이스와 악기를 따로 정리하면 확실히 나아집니다.' },
  stereo: { name: '모노 호환성', unit: '', good: '위상이 안정적입니다. 모노 스피커에서도 살아남습니다.', warn: '좌우 위상이 조금 어긋납니다. 모노에서 일부가 얇아질 수 있습니다.', bad: '위상 상쇄가 큽니다. 모노에서 일부가 사라집니다.', mono: '모노 파일입니다.' },
  tilt: { name: '대역 밸런스', unit: '', good: '대역 밸런스가 기준 범위 안입니다.', warn: (b) => `${b} 대역이 기준보다 큽니다. 마스터링으로 다듬을 수 있습니다.`, bad: (b) => `${b} 대역이 많이 튑니다. 보통 한 악기 때문이라 트랙에서 고치는 편이 좋습니다.` },
};
// 1/3 옥타브마다 발매곡이 흔히 놓이는 범위(250 Hz–2 kHz 평균 기준, 가운데 값).
const REF_PTS = [[25, -5], [40, 0.5], [60, 2.5], [120, 2.5], [250, 1], [500, 0.3], [1000, -0.5], [2000, -2], [4000, -4.5], [8000, -7.5], [12000, -11], [16000, -16]];
const THIRDS = [];
for (let f = 25; f <= 16000; f *= Math.pow(2, 1 / 3)) THIRDS.push(f);

const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const signed = (v) => (v > 0 ? '+' : '') + v;
const avg = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

function refAt(f) {
  let i = 1;
  while (i < REF_PTS.length - 1 && REF_PTS[i][0] < f) i++;
  const [f0, v0] = REF_PTS[i - 1], [f1, v1] = REF_PTS[i];
  const t = Math.max(0, Math.min(1, Math.log(f / f0) / Math.log(f1 / f0)));
  return v0 + (v1 - v0) * t;
}

function loudKey(a) {
  return a.lufs < -20 ? 'quiet' : a.lufs <= -12 ? 'ok' : a.plr < 7 ? 'crushed' : 'loud';
}

function icon(name) {
  const p = {
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>',
    wave: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  }[name];
  return `<svg class="mst-ico" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
}

async function sniffVendor(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 131072).arrayBuffer());
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 8192)).arrayBuffer());
    const txt = new TextDecoder('latin1').decode(head) + new TextDecoder('latin1').decode(tail) + new TextDecoder('utf-16le').decode(head.subarray(0, 32768));
    const m = txt.match(AI_VENDORS) || file.name.match(AI_VENDORS);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

async function decodeFile(file) {
  if (file.size > MAX_BYTES) throw new Error('파일이 너무 큽니다. 300 MB 이하로 올려 주세요.');
  const buf = await file.arrayBuffer();
  let ab;
  try {
    ab = await new window.OfflineAudioContext(2, 1, SR).decodeAudioData(buf);
  } catch {
    throw new Error('이 파일을 읽지 못했습니다. WAV나 MP3로 내보내서 다시 올려 주세요.');
  }
  if (ab.duration > MAX_SEC) throw new Error('12분 이하 트랙만 처리할 수 있습니다.');
  const L = new Float32Array(ab.length), R = new Float32Array(ab.length);
  ab.copyFromChannel(L, 0);
  if (ab.numberOfChannels > 1) ab.copyFromChannel(R, 1); else R.set(L);
  return { L, R };
}

function wavePeaks(L, R) {
  const B = 1400, n = L.length, step = Math.max(1, Math.floor(n / B)), out = new Float32Array(B);
  for (let b = 0; b < B; b++) {
    let m = 0;
    const e = Math.min(n, (b + 1) * step);
    for (let i = b * step; i < e; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (v > m) m = v; }
    out[b] = m;
  }
  return out;
}

/** 캔버스를 화면 크기에 맞추고 2D 컨텍스트를 돌려줍니다. 그릴 수 없으면 null. */
function fitCanvas(cv) {
  const w = cv.clientWidth, h = cv.clientHeight;
  const g = cv.getContext && cv.getContext('2d');
  if (!w || !g) return null;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

export default function renderMastering(root) {
  const S = { name: '', sample: false, orig: null, origBuf: null, a: null, res: null, master: null, peaksO: null, peaksM: null,
    playing: false, src: [], t0: 0, off: 0, which: 'master', vendor: null, tonal: null, checkSrc: null, saved: false };
  let worker = null, ctx = null, G = null, rid = 0, raf = 0;
  const pend = new Map();
  /** 그래프(canvas) 색. CSS 의 --mst-* 변수에서 읽으므로 테마를 바꾸면 그래프도 같이 바뀝니다. */
  const col = {};

  root.innerHTML = `
  <div class="mst">
    <header class="mst-head">
      <div>
        <h1 class="mst-title">마스터링</h1>
        <p class="mst-sub">곡을 먼저 측정하고 기준에서 벗어난 것만 다듬어, 발매 음량(−9 LUFS · −0.5 dBTP)으로 마감합니다. 파일은 이 컴퓨터 밖으로 나가지 않습니다.</p>
      </div>
      <div class="mst-seg" role="tablist" aria-label="화면 선택">
        <button role="tab" aria-selected="true" data-tab="master">마스터링</button>
        <button role="tab" aria-selected="false" data-tab="check">믹스 체크</button>
      </div>
    </header>

    <section data-view="master">
      <div class="mst-panel is-bare">
        <div class="mst-drop" data-drop tabindex="0" role="button" aria-label="트랙 파일 고르기">
          ${icon('upload')}
          <div><b>트랙을 끌어다 놓거나 눌러서 고르세요</b><span>WAV · AIFF · FLAC · MP3 · M4A · 12분 · 300 MB 이하</span></div>
        </div>
        <input type="file" data-file accept=".wav,.aiff,.aif,.flac,.mp3,.m4a,.ogg,.aac,audio/*" hidden>
        <div class="mst-opts">
          <label class="mst-check"><input type="checkbox" data-ai> AI 생성곡 (Suno · Udio 등)</label>
          <span class="mst-hint">체크하거나 파일 정보에 생성 서비스 이름이 있으면 고역 금속성 잡음 제어를 켭니다.</span>
          <button class="mst-link" data-sample>합성 데모 트랙으로 보기</button>
        </div>
        <p class="mst-err" data-err hidden></p>
      </div>

      <div class="mst-panel" data-proc hidden aria-live="polite">
        <div class="mst-panel-head"><h2 data-proc-title>처리 중</h2><span class="mst-chip" data-proc-ai hidden>AI 생성곡 · 고역 집중</span></div>
        <ol class="mst-steps">
          <li data-step="analyze"><b>분석</b><span>음량 · 대역 · 위상 측정</span></li>
          <li data-step="decide"><b>판단</b><span>필요한 처리 고르기</span></li>
          <li data-step="process"><b>처리</b><span>EQ · 스테레오 · 다이내믹</span></li>
          <li data-step="finish"><b>마감</b><span>음량 맞춤 · 트루피크 확인</span></li>
        </ol>
        <p class="mst-note" data-proc-note hidden></p>
      </div>

      <div class="mst-panel mst-empty" data-empty>
        ${icon('wave')}
        <div>
          <b>트랙을 올리면 이 자리에 결과가 나옵니다</b>
          <span>음량 변화와 트루피크, 원본 · 마스터 즉시 비교 플레이어, 톤 밸런스, 분석 리포트, 적용한 처리 목록, WAV 내보내기.</span>
        </div>
      </div>

      <div data-result hidden>
        <div class="mst-panel">
          <div class="mst-panel-head">
            <h2 data-res-title>결과</h2>
            <span class="mst-chip" data-res-sample hidden>예시 · 합성 데모</span>
            <span class="mst-chip" data-res-ai hidden>AI 아티팩트 정리</span>
          </div>
          <div class="mst-kpis" data-kpis></div>
          <div class="mst-gauge" data-gauge role="img"></div>
        </div>

        <div class="mst-panel">
          <div class="mst-panel-head"><h2>비교 재생</h2><span class="mst-hint">Space 재생 · ← → 5초 · A 원본↔마스터</span></div>
          <canvas class="mst-wave" data-wave aria-label="파형. 누르면 그 위치로 이동합니다"></canvas>
          <div class="mst-transport">
            <button class="mst-play" data-play aria-label="재생">${icon('play')}</button>
            <span class="mst-time" data-time>0:00 / 0:00</span>
            <div class="mst-ab" role="group" aria-label="원본과 마스터 즉시 비교">
              <button data-ab="original" aria-pressed="false">원본</button>
              <button data-ab="master" aria-pressed="true">마스터</button>
            </div>
            <label class="mst-check"><input type="checkbox" data-match> 음량 맞춰 비교</label>
          </div>
        </div>

        <div class="mst-grid2">
          <div class="mst-panel">
            <div class="mst-panel-head"><h2>톤 밸런스</h2>
              <span class="mst-legend"><i class="lg-ref"></i>발매곡 범위<i class="lg-m"></i>마스터<i class="lg-o"></i>원본</span></div>
            <canvas class="mst-chart" data-tonal aria-label="재생 중인 소리의 주파수 밸런스"></canvas>
          </div>
          <div class="mst-panel">
            <div class="mst-panel-head"><h2>스테레오 이미지</h2></div>
            <canvas class="mst-chart" data-scope aria-label="좌우 위상 스코프"></canvas>
          </div>
        </div>

        <div class="mst-panel">
          <div class="mst-panel-head"><h2>분석 리포트</h2></div>
          <div class="mst-tablewrap"><table class="mst-table" data-report>
            <thead><tr><th>항목</th><th>원본</th><th>마스터</th><th>상태</th></tr></thead><tbody></tbody>
          </table></div>
        </div>

        <div class="mst-panel">
          <div class="mst-panel-head"><h2>처리 체인</h2><span class="mst-hint">이 곡에 걸린 처리만 나옵니다 · 적용 순서는 EQ → 스테레오 → 고역 → 컴프레션 → 리미터</span></div>
          <div class="mst-tablewrap"><table class="mst-table" data-chain>
            <thead><tr><th>#</th><th>처리</th><th>설정</th></tr></thead><tbody></tbody>
          </table></div>
        </div>

        <div class="mst-grid2">
          <div class="mst-panel">
            <div class="mst-panel-head"><h2>커스터마이징</h2></div>
            <p class="mst-hint">재생하면서 조절해 보세요. 미리듣기는 근사치이고, 다시 마스터링하면 처리 체인 안에서 정확히 적용됩니다.</p>
            <div class="mst-knobs">
              ${KNOBS.map(([k, label, lo, hi, live]) => `
              <div class="mst-knob">
                <label for="mst-k-${k}">${label}<span data-kv="${k}">0</span></label>
                <input type="range" id="mst-k-${k}" data-knob="${k}" min="-1" max="1" step="0.05" value="0">
                <div class="mst-ends"><span>${lo}</span><span>${live ? '' : '렌더링 때만 적용'}</span><span>${hi}</span></div>
              </div>`).join('')}
            </div>
            <div class="mst-actions">
              <button class="mst-btn is-primary" data-remaster disabled>이 설정으로 다시 마스터링</button>
              <button class="mst-btn" data-reset>되돌리기</button>
            </div>
          </div>
          <div class="mst-panel">
            <div class="mst-panel-head"><h2>내보내기</h2></div>
            <dl class="mst-spec">
              <div><dt>형식</dt><dd>WAV · 스테레오</dd></div>
              <div><dt>샘플레이트</dt><dd>48 kHz</dd></div>
              <div><dt>디더</dt><dd>TPDF</dd></div>
            </dl>
            <div class="mst-actions">
              <button class="mst-btn is-primary" data-dl="24">${icon('download')} WAV 24-bit</button>
              <button class="mst-btn" data-dl="16">${icon('download')} WAV 16-bit</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section data-view="check" hidden>
      <div class="mst-panel is-bare">
        <div class="mst-drop" data-drop-c tabindex="0" role="button" aria-label="점검할 트랙 고르기">
          ${icon('upload')}
          <div><b data-drop-c-title>점검할 트랙을 끌어다 놓거나 눌러서 고르세요</b><span>음량 · 트루피크 · 다이내믹 · 저중역 · 모노 호환성 · 대역 밸런스. 업로드 없이 이 브라우저에서 잽니다.</span></div>
        </div>
        <input type="file" data-file-c accept=".wav,.aiff,.aif,.flac,.mp3,.m4a,.ogg,.aac,audio/*" hidden>
        <p class="mst-err" data-err-c hidden></p>
      </div>
      <div data-c-result hidden>
        <div class="mst-panel">
          <div class="mst-panel-head"><h2 data-c-overall></h2><span class="mst-hint" data-c-name></span></div>
          <div class="mst-lights" data-c-lights></div>
          <div class="mst-actions"><button class="mst-btn is-primary" data-c-go>이 트랙 마스터링하기</button></div>
        </div>
      </div>
    </section>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const show = (s, on) => { $(s).hidden = !on; };
  (function readColors() {
    const cs = window.getComputedStyle($('.mst'));
    const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    Object.assign(col, {
      primary: v('--mst-primary', '#8FA3FF'), point: v('--mst-original', '#7E93A8'), base: v('--mst-base', '#1D2632'),
      soft: v('--mst-soft', '#9AA8B6'), line: v('--mst-line', '#263140'), band: v('--mst-band', 'rgba(143,163,255,.14)'),
    });
  })();
  document.body.classList.add('is-mastering');

  /* ── 계산 담당(worker)과 오디오는 처음 쓸 때 만듭니다 ── */
  function call(op, data, transfer, onProg) {
    if (!worker) {
      worker = new Worker(new URL('../mastering/worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const m = e.data, p = pend.get(m.id);
        if (!p) return;
        if (m.type === 'progress') { if (p.onProg) p.onProg(m); return; }
        pend.delete(m.id);
        if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m.result);
      };
      worker.onerror = (e) => { pend.forEach((p) => p.reject(new Error(e.message || '계산 중 오류가 났습니다.'))); pend.clear(); };
    }
    const id = ++rid;
    return new Promise((resolve, reject) => {
      pend.set(id, { resolve, reject, onProg });
      worker.postMessage(Object.assign({ id, op }, data), transfer || []);
    });
  }

  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    try { ctx = new AC({ sampleRate: SR }); } catch { ctx = new AC(); }
    const gain = () => ctx.createGain();
    G = { abO: gain(), abM: gain(), low: ctx.createBiquadFilter(), high: ctx.createBiquadFilter(), loud: gain(), match: gain(), mix: gain(),
      spec: ctx.createAnalyser(), split: ctx.createChannelSplitter(2), aL: ctx.createAnalyser(), aR: ctx.createAnalyser() };
    G.low.type = 'lowshelf'; G.low.frequency.value = 120;
    G.high.type = 'highshelf'; G.high.frequency.value = 3000;
    G.abM.connect(G.low).connect(G.high).connect(G.loud).connect(G.match).connect(G.mix);
    G.abO.connect(G.mix);
    G.mix.connect(ctx.destination);
    G.spec.fftSize = 8192; G.spec.smoothingTimeConstant = 0.8; G.mix.connect(G.spec);
    G.aL.fftSize = 1024; G.aR.fftSize = 1024; G.mix.connect(G.split); G.split.connect(G.aL, 0); G.split.connect(G.aR, 1);
    G.abO.gain.value = 0; G.abM.gain.value = 1;
    return ctx;
  }

  function toBuffer(L, R) {
    const b = audio().createBuffer(2, L.length, SR);
    b.copyToChannel(L, 0); b.copyToChannel(R, 1);
    return b;
  }

  /* ── 처리 흐름 ── */
  function setStage(st, text) {
    const idx = STAGES.indexOf(st);
    root.querySelectorAll('[data-step]').forEach((li, i) => {
      li.className = i < idx || st === 'done' ? 'done' : i === idx ? 'on' : '';
      if (i === idx && text) li.querySelector('span').textContent = text;
    });
  }

  function fail(err, errSel = '[data-err]') {
    show('[data-proc]', false);
    show('[data-empty]', !S.res);
    show('[data-result]', !!S.res);
    $(errSel).textContent = err.message;
    $(errSel).hidden = false;
  }

  async function runMaster() {
    stop();
    $('[data-err]').hidden = true;
    show('[data-empty]', false); show('[data-result]', false); show('[data-proc]', true);
    $('[data-proc-title]').textContent = S.sample ? '합성 데모 트랙 처리 중' : `“${S.name}” 처리 중`;
    $('[data-proc-ai]').hidden = true; $('[data-proc-note]').hidden = true;
    root.querySelectorAll('[data-step]').forEach((li) => { li.className = ''; });
    setStage('analyze');
    try {
      if (!S.a) S.a = await call('analyze', { L: S.orig.L.slice(), R: S.orig.R.slice(), sr: SR });
      const a = S.a;
      $('[data-proc-note]').textContent = CHECK_TEXT[loudKey(a)](a.lufs)
        + (a.clipHits ? ' 원본에 클리핑이 있습니다. 피크는 정리되지만 이미 일그러진 소리는 되돌릴 수 없습니다.' : '');
      $('[data-proc-note]').hidden = false;
      const L = S.orig.L.slice(), R = S.orig.R.slice();
      const opts = { ai: $('[data-ai]').checked || !!S.vendor, custom: knobValues() };
      const res = await call('master', { L, R, sr: SR, analysis: a, opts }, [L.buffer, R.buffer], (m) => {
        if (m.stage === 'decide' && m.plan) {
          $('[data-proc-ai]').hidden = !m.plan.ai;
          if (S.vendor && S.vendor !== 'demo') $('[data-proc-ai]').title = `파일 정보에서 ${S.vendor} 표시를 찾았습니다`;
        }
        setStage(m.stage, m.text);
      });
      S.res = res; S.master = toBuffer(res.L, res.R); S.peaksM = wavePeaks(res.L, res.R); S.tonal = null; S.saved = false;
      setStage('done');
      renderResult();
      if (!S.sample) setLeaveGuard('마스터링 결과를 아직 내려받지 않았습니다. 화면을 벗어나면 사라집니다.');
    } catch (err) {
      fail(err);
    }
  }

  async function loadFile(file) {
    $('[data-err]').hidden = true;
    try {
      S.sample = false; S.name = file.name.replace(/\.[^.]+$/, ''); S.a = null; resetKnobs(true);
      S.vendor = await sniffVendor(file);
      show('[data-empty]', false); show('[data-proc]', true);
      $('[data-proc-title]').textContent = `“${S.name}” 읽는 중`;
      setStage('analyze');
      const d = await decodeFile(file);
      S.orig = d; S.origBuf = toBuffer(d.L, d.R); S.peaksO = wavePeaks(d.L, d.R);
      await runMaster();
    } catch (err) {
      fail(err);
    }
  }

  async function loadSample() {
    try {
      S.sample = true; S.name = '합성 데모'; S.a = null; S.vendor = 'demo'; resetKnobs(true);
      const s = await call('sample', { sr: SR });
      S.orig = s; S.origBuf = toBuffer(s.L, s.R); S.peaksO = wavePeaks(s.L, s.R);
      await runMaster();
    } catch (err) {
      fail(err);
    }
  }

  /* ── 결과 ── */
  function renderResult() {
    const a = S.a, b = S.res.after, p = S.res.plan, st = S.res.stats;
    show('[data-proc]', false); show('[data-result]', true);
    $('[data-res-sample]').hidden = !S.sample;
    $('[data-res-ai]').hidden = !p.ai;
    $('[data-res-title]').textContent = S.sample ? '합성 데모 트랙 결과' : `“${S.name}” 결과`;

    const kpi = (label, from, to, unit, note) => `
      <div class="mst-kpi"><dt>${label}</dt>
        <dd><span class="from">${from}</span><span class="arrow">→</span><b>${to}</b><small>${unit}</small></dd>
        ${note ? `<p>${note}</p>` : ''}</div>`;
    $('[data-kpis]').innerHTML = [
      kpi('통합 음량', a.lufs, b.lufs, 'LUFS', `목표 ${p.target} LUFS`),
      kpi('트루피크', a.truePeak, b.truePeak, 'dBTP', `천장 ${p.ceil} dBTP`),
      kpi('다이내믹 (PLR)', a.plr, b.plr, 'dB', '피크와 평균의 차이'),
      kpi('스테레오 폭 S/M', a.width.toFixed(2), b.width.toFixed(2), '', st.deharsh ? `${p.ai ? 'AI 아티팩트' : '고역'} 정리 최대 −${st.deharsh.maxGR} dB` : '사이드 ÷ 미드'),
    ].join('');
    renderGauge(a.lufs, b.lufs);

    const ja = judge(a), jb = judge(b, true);
    const tilt = (x) => (x.tilt.length ? x.tilt.map((t) => BAND_NAME[t.band]).join(', ') + ' 과다' : '기준 범위');
    const corr = (x) => (x.isMono ? '모노' : x.correlation.toFixed(2));
    const rows = [
      ['통합 음량', (x) => `${x.lufs} LUFS`, 'loud'], ['트루피크', (x) => `${x.truePeak} dBTP`, 'peak'],
      ['다이내믹 (PLR)', (x) => `${x.plr} dB`, 'dyn'], ['저중역 탁함 (200–500 Hz)', (x) => `${signed(x.mudRatio)} dB`, 'mud'],
      ['좌우 상관도', corr, 'stereo'], ['대역 밸런스', tilt, 'tilt'],
      ['크레스트', (x) => `${x.crest} dB`, null], ['모노 손실', (x) => `${x.monoLoss} dB`, null],
    ];
    $('[data-report] tbody').innerHTML = rows.map(([n, f, k]) => {
      let pill = '';
      if (k) { const s = jb[k] === 'good' && ja[k] !== 'good' ? 'fixed' : jb[k]; pill = `<span class="mst-pill is-${s}">${LIGHT[s]}</span>`; }
      return `<tr><td>${n}</td><td class="num">${esc(f(a))}</td><td class="num">${esc(f(b))}</td><td>${pill}</td></tr>`;
    }).join('');
    $('[data-chain] tbody').innerHTML = p.steps.map(([w, d], i) =>
      `<tr><td class="num">${String(i + 1).padStart(2, '0')}</td><td>${esc(w)}</td><td class="num">${esc(d)}</td></tr>`).join('');

    S.off = 0; $('[data-match]').checked = false;
    setAB('master'); applyMatch(); previewKnobs(); drawWave(); drawTonal(); drawScope(); updTime();
  }

  function renderGauge(before, after) {
    const lo = -26, hi = -4, pos = (v) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
    const zones = [[lo, -18, '조용함', 'z1'], [-18, -12, '보통', 'z2'], [-12, -7, '발매 마스터', 'z3'], [-7, hi, '매우 큼', 'z4']];
    const el = $('[data-gauge]');
    el.innerHTML = `
      <div class="mst-gauge-bar">${zones.map((z) => `<span class="${z[3]}" style="width:${pos(z[1]) - pos(z[0])}%"></span>`).join('')}
        <i class="mk o" style="left:${pos(before)}%"></i><i class="mk m" style="left:${pos(after)}%"></i></div>
      <div class="mst-gauge-lbl">${zones.map((z) => `<span style="width:${pos(z[1]) - pos(z[0])}%">${z[2]}</span>`).join('')}</div>
      <div class="mst-legend"><i class="lg-o"></i>원본 ${before} LUFS<i class="lg-m"></i>마스터 ${after} LUFS</div>`;
    el.setAttribute('aria-label', `음량: 원본 ${before} LUFS에서 마스터 ${after} LUFS`);
  }

  /* ── 재생 ── */
  function curTime() {
    if (!S.origBuf) return 0;
    return S.playing ? Math.min(S.origBuf.duration, ctx.currentTime - S.t0 + S.off) : S.off;
  }

  function play() {
    const c = audio();
    if (c.resume) c.resume();
    if (!S.master) return;
    if (S.off >= S.master.duration - 0.05) S.off = 0;
    const mk = (buf, dst) => { const s = c.createBufferSource(); s.buffer = buf; s.connect(dst); return s; };
    const so = mk(S.origBuf, G.abO), sm = mk(S.master, G.abM), at = c.currentTime + 0.03;
    so.start(at, S.off); sm.start(at, S.off);
    S.t0 = at; S.src = [so, sm]; S.playing = true;
    sm.onended = () => { if (S.src[1] === sm && S.playing) { S.playing = false; S.off = 0; S.src = []; updPlay(); } };
    updPlay(); loop();
  }

  function stop() {
    if (!S.playing) return;
    S.off = curTime();
    S.src.forEach((s) => { try { s.onended = null; s.stop(); } catch { /* 이미 멈춤 */ } });
    S.src = []; S.playing = false; updPlay();
  }

  function seek(t) {
    const was = S.playing;
    stop();
    S.off = Math.max(0, Math.min(t, S.master ? S.master.duration : 0));
    if (was) play();
    drawWave(); updTime();
  }

  function updPlay() {
    $('[data-play]').innerHTML = icon(S.playing ? 'pause' : 'play');
    $('[data-play]').setAttribute('aria-label', S.playing ? '일시정지' : '재생');
  }

  function updTime() {
    $('[data-time]').textContent = `${fmtTime(curTime())} / ${fmtTime(S.master ? S.master.duration : 0)}`;
  }

  function setAB(w) {
    S.which = w;
    if (G) {
      const t = ctx.currentTime;
      G.abM.gain.setTargetAtTime(w === 'master' ? 1 : 0, t, 0.005);
      G.abO.gain.setTargetAtTime(w === 'original' ? 1 : 0, t, 0.005);
    }
    root.querySelectorAll('[data-ab]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ab === w));
    drawWave();
  }

  function applyMatch() {
    if (!G || !S.res) return;
    G.match.gain.value = $('[data-match]').checked ? Math.min(1, Math.pow(10, (S.a.lufs - S.res.after.lufs) / 20)) : 1;
  }

  function loop() {
    window.cancelAnimationFrame(raf);
    const tick = () => {
      drawWave(); updTime(); drawTonal(); drawScope();
      if (S.playing) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
  }

  /* ── 그림 ── */
  function drawWave() {
    const c = fitCanvas($('[data-wave]'));
    if (!c) return;
    const { g, w, h } = c, mid = h / 2;
    g.fillStyle = col.base; g.fillRect(0, 0, w, h);
    g.fillStyle = col.line; g.fillRect(0, mid, w, 1);
    const prog = S.origBuf ? curTime() / S.origBuf.duration : 0;
    const bars = (pk, color, alpha) => {
      if (!pk) return;
      g.fillStyle = color; g.globalAlpha = alpha;
      for (let x = 0; x < w; x += 2) { const v = pk[Math.floor((x / w) * pk.length)] || 0, hh = Math.max(1, v * (h / 2 - 6)); g.fillRect(x, mid - hh, 1.3, hh * 2); }
    };
    const front = S.which === 'master';
    bars(front ? S.peaksO : S.peaksM, front ? col.point : col.primary, 0.35);
    bars(front ? S.peaksM : S.peaksO, front ? col.primary : col.point, 0.95);
    g.globalAlpha = 0.55; g.fillStyle = col.base; g.fillRect(prog * w, 0, w - prog * w, h);
    g.globalAlpha = 1; g.fillStyle = col.primary; g.fillRect(prog * w - 1, 0, 2, h);
  }

  function drawTonal() {
    const c = fitCanvas($('[data-tonal]'));
    if (!c) return;
    const { g, w, h } = c, top = 8, bot = h - 20;
    const X = (f) => (Math.log(f / 25) / Math.log(16000 / 25)) * (w - 12) + 6;
    const Y = (v) => top + (1 - (Math.max(-24, Math.min(12, v)) + 24) / 36) * (bot - top);
    g.fillStyle = col.base; g.fillRect(0, 0, w, h);
    g.strokeStyle = col.line; g.lineWidth = 1; g.fillStyle = col.soft; g.font = '500 11px "IBM Plex Mono", monospace'; g.textAlign = 'center';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const x = X(f); g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke();
      g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x, h - 6);
    }
    g.beginPath();
    THIRDS.forEach((f, i) => { const y = Y(refAt(f) + 3.5); if (i) g.lineTo(X(f), y); else g.moveTo(X(f), y); });
    for (let i = THIRDS.length - 1; i >= 0; i--) g.lineTo(X(THIRDS[i]), Y(refAt(THIRDS[i]) - 3.5));
    g.closePath(); g.fillStyle = col.band; g.fill();
    if (G && S.playing) {
      const data = new Float32Array(G.spec.frequencyBinCount);
      G.spec.getFloatFrequencyData(data);
      const hz = ctx.sampleRate / G.spec.fftSize;
      const vals = THIRDS.map((f) => {
        const a = Math.max(1, Math.floor(f / 1.122 / hz)), b = Math.max(a + 1, Math.ceil((f * 1.122) / hz));
        let s = 0;
        for (let k = a; k < b && k < data.length; k++) s += Math.pow(10, data[k] / 10);
        return 10 * Math.log10(s + 1e-20);
      });
      const ref = avg(vals.filter((v, i) => THIRDS[i] >= 250 && THIRDS[i] <= 2000));
      S.tonal = vals.map((v) => v - ref);
    }
    if (!S.tonal) {
      g.fillStyle = col.soft; g.font = '500 12px "IBM Plex Sans KR", sans-serif';
      g.fillText('재생하면 지금 들리는 소리의 밸런스가 그려집니다', w / 2, h / 2);
      return;
    }
    g.beginPath();
    S.tonal.forEach((v, i) => { const x = X(THIRDS[i]), y = Y(v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.strokeStyle = S.which === 'master' ? col.primary : col.point; g.lineWidth = 2; g.stroke();
  }

  function drawScope() {
    const c = fitCanvas($('[data-scope]'));
    if (!c) return;
    const { g, w, h } = c, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 16;
    g.fillStyle = col.base; g.fillRect(0, 0, w, h);
    g.strokeStyle = col.line; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R);
    g.moveTo(cx - R * 0.7071, cy - R * 0.7071); g.lineTo(cx + R * 0.7071, cy + R * 0.7071);
    g.moveTo(cx + R * 0.7071, cy - R * 0.7071); g.lineTo(cx - R * 0.7071, cy + R * 0.7071); g.stroke();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.fillStyle = col.soft; g.font = '500 11px "IBM Plex Mono", monospace'; g.textAlign = 'center';
    g.fillText('M', cx, cy - R - 4); g.fillText('L', cx - R * 0.74, cy - R * 0.74 - 4); g.fillText('R', cx + R * 0.74, cy - R * 0.74 - 4);
    if (!G || !S.playing) return;
    const l = new Float32Array(G.aL.fftSize), r = new Float32Array(G.aR.fftSize);
    G.aL.getFloatTimeDomainData(l); G.aR.getFloatTimeDomainData(r);
    g.fillStyle = S.which === 'master' ? col.primary : col.point; g.globalAlpha = 0.6;
    for (let i = 0; i < l.length; i++) g.fillRect(cx + (l[i] - r[i]) * 0.7071 * R, cy - (l[i] + r[i]) * 0.7071 * R, 1.5, 1.5);
    g.globalAlpha = 1;
  }

  /* ── 커스터마이징 ── */
  function knobValues() {
    const o = {};
    KNOBS.forEach(([k]) => { o[k] = parseFloat($(`[data-knob="${k}"]`).value); });
    return o;
  }

  function resetKnobs(toZero) {
    KNOBS.forEach(([k]) => {
      const v = toZero || !S.res ? 0 : S.res.plan.custom[k] || 0;
      $(`[data-knob="${k}"]`).value = v;
      $(`[data-kv="${k}"]`).textContent = signed(v);
    });
    previewKnobs();
  }

  /** 렌더된 마스터에는 이미 걸려 있는 값이 있으므로, 그 차이만 미리 들려줍니다. */
  function previewKnobs() {
    const k = knobValues(), base = S.res ? S.res.plan.custom : { tone: 0, low: 0, dynamics: 0, loudness: 0 };
    if (G) {
      G.high.gain.value = 2.5 * (k.tone - base.tone);
      G.low.gain.value = 2.5 * (k.low - base.low);
      G.loud.gain.value = Math.pow(10, (1.5 * (k.loudness - base.loudness)) / 20);
    }
    $('[data-remaster]').disabled = !S.res || !KNOBS.some(([n]) => Math.abs(k[n] - (base[n] || 0)) > 0.01);
  }

  /* ── 내보내기 ── */
  function download(bits) {
    if (!S.res) return;
    const name = `${S.name || 'track'}_master_${bits}bit.wav`;
    saveFile(name, new Blob([wavBytes(S.res.L, S.res.R, SR, bits)], { type: 'audio/wav' }));
    S.saved = true;
    clearLeaveGuard();
    toast(`${name} 을 내려받았습니다`);
  }

  /* ── 믹스 체크 ── */
  async function runCheck(file) {
    $('[data-err-c]').hidden = true; show('[data-c-result]', false);
    $('[data-drop-c-title]').textContent = '측정 중…';
    try {
      const d = await decodeFile(file);
      S.checkSrc = { file, d };
      const a = await call('analyze', { L: d.L.slice(), R: d.R.slice(), sr: SR }), j = judge(a);
      const bands = a.tilt.map((t) => BAND_NAME[t.band]).join(' · ');
      const items = [
        ['loud', a.lufs, MIX_TEXT.loud[loudKey(a)], `PLR ${a.plr} dB`],
        ['peak', a.truePeak, MIX_TEXT.peak[j.peak], `샘플 피크 ${a.samplePeak} dBFS · 클리핑 ${a.clipHits}회`],
        ['dyn', a.plr, MIX_TEXT.dyn[j.dyn], `크레스트 ${a.crest} dB`],
        ['mud', signed(a.mudRatio), MIX_TEXT.mud[j.mud], '200–500 Hz ÷ 500 Hz–2 kHz'],
        ['stereo', a.isMono ? '—' : a.correlation.toFixed(2), a.isMono ? MIX_TEXT.stereo.mono : MIX_TEXT.stereo[j.stereo], `S/M 폭 ${a.width} · 모노 손실 ${a.monoLoss} dB`],
        ['tilt', a.tilt.length ? `${a.tilt.length}개` : '—', j.tilt === 'good' ? MIX_TEXT.tilt.good : MIX_TEXT.tilt[j.tilt](bands), a.tilt.map((t) => `${BAND_NAME[t.band]} +${t.dev} dB`).join(' · ') || '기준 대비 편차 6 dB 이하'],
      ];
      $('[data-c-lights]').innerHTML = items.map(([k, v, txt, det]) => `
        <div class="mst-light is-${j[k]}">
          <div class="mst-light-top"><h3>${MIX_TEXT[k].name}</h3><span class="mst-pill is-${j[k]}">${LIGHT[j[k]]}</span></div>
          <div class="mst-light-val">${esc(v)}<small>${MIX_TEXT[k].unit}</small></div>
          <p>${esc(txt)}</p><div class="mst-light-det">${esc(det)}</div>
        </div>`).join('');
      const vals = Object.values(j), bad = vals.filter((x) => x === 'bad').length, warn = vals.filter((x) => x === 'warn').length;
      $('[data-c-overall]').textContent = bad ? `발매 전에 고칠 것 ${bad}개` : warn ? `확인해 볼 것 ${warn}개` : '발매 기준 안에 들어옵니다';
      $('[data-c-name]').textContent = file.name;
      show('[data-c-result]', true);
    } catch (err) {
      $('[data-err-c]').textContent = err.message;
      $('[data-err-c]').hidden = false;
    }
    $('[data-drop-c-title]').textContent = '점검할 트랙을 끌어다 놓거나 눌러서 고르세요';
  }

  /* ── 연결 ── */
  function selectTab(t) {
    root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
    root.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== t; });
    if (t !== 'master') stop();
    else window.requestAnimationFrame(() => { drawWave(); drawTonal(); drawScope(); });
  }

  function wireDrop(zone, input, fn) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { if (input.files[0]) fn(input.files[0]); input.value = ''; });
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
    zone.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) fn(f); });
  }

  wireDrop($('[data-drop]'), $('[data-file]'), loadFile);
  wireDrop($('[data-drop-c]'), $('[data-file-c]'), runCheck);
  $('[data-sample]').addEventListener('click', loadSample);
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
  $('[data-play]').addEventListener('click', () => (S.playing ? stop() : play()));
  root.querySelectorAll('[data-ab]').forEach((b) => b.addEventListener('click', () => setAB(b.dataset.ab)));
  $('[data-match]').addEventListener('change', applyMatch);
  $('[data-wave]').addEventListener('pointerdown', (e) => {
    if (!S.master) return;
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * S.master.duration);
  });
  KNOBS.forEach(([k]) => $(`[data-knob="${k}"]`).addEventListener('input', (e) => {
    $(`[data-kv="${k}"]`).textContent = signed(Math.round(e.target.value * 100) / 100);
    previewKnobs();
  }));
  $('[data-reset]').addEventListener('click', () => resetKnobs(false));
  $('[data-remaster]').addEventListener('click', () => { if (S.orig) runMaster(); });
  root.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () => download(Number(b.dataset.dl))));
  $('[data-c-go]').addEventListener('click', async () => {
    if (!S.checkSrc) return;
    selectTab('master');
    const { file, d } = S.checkSrc;
    S.sample = false; S.name = file.name.replace(/\.[^.]+$/, ''); S.a = null; resetKnobs(true);
    S.vendor = await sniffVendor(file);
    S.orig = d; S.origBuf = toBuffer(d.L, d.R); S.peaksO = wavePeaks(d.L, d.R);
    runMaster();
  });

  function onKey(e) {
    if (!S.res || $('[data-view="master"]').hidden || e.target.closest('input, textarea, select')) return;
    if (e.code === 'Space') { e.preventDefault(); if (S.playing) stop(); else play(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(curTime() - 5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(curTime() + 5); }
    else if (e.key === 'a' || e.key === 'A') setAB(S.which === 'master' ? 'original' : 'master');
  }
  function onResize() { drawWave(); drawTonal(); drawScope(); }

  /** 다른 화면으로 넘어가면 소리 · 계산 · 키보드 듣기를 모두 멈춥니다. */
  function teardown() {
    if (root.isConnected) { window.addEventListener('hashchange', teardown, { once: true }); return; }
    stop();
    window.cancelAnimationFrame(raf);
    if (worker) worker.terminate();
    if (ctx && ctx.close) ctx.close();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    document.body.classList.remove('is-mastering');
  }

  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  window.addEventListener('hashchange', teardown, { once: true });
}
