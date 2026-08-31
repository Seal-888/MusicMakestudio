import { analyzeAudio, renderVideo, drawFrame, canRender } from '../visualizer.js';
import { cleanTitle, toTimestamp } from '../audio.js';
import * as R from '../render.js';

const SHAPES = [
  { label: '아래 막대', value: 'bars' },
  { label: '가운데 대칭', value: 'mirror' },
  { label: '원형', value: 'circle' },
];

/** 감도 — 곡마다 볼륨이 달라서 직접 고를 수 있게 했습니다. */
const SENSITIVITY = {
  calm: { label: '차분하게', rangeDb: 56, gamma: 1.7 },
  normal: { label: '보통', rangeDb: 48, gamma: 1.35 },
  lively: { label: '활발하게', rangeDb: 38, gamma: 1.1 },
};

const SIZES = {
  '16:9': { width: 1920, height: 1080, label: '16:9 (1920×1080)' },
  '9:16': { width: 1080, height: 1920, label: '9:16 (1080×1920)' },
  '1:1': { width: 1080, height: 1080, label: '1:1 (1080×1080)' },
};

export default function renderVisualizer(root) {
  let analysis = null;
  let songName = '파형';

  root.innerHTML =
    R.header('audio visualizer', '파형', '영상 만들기', '음악에 맞춰 춤추는 막대를 영상으로 만듭니다.') +
    (canRender()
      ? ''
      : `<div class="card"><div class="placeholder">
          <div class="big">🧭</div>
          <p><strong>이 브라우저에서는 만들 수 없습니다.</strong></p>
          <p>영상 인코딩 기능이 필요합니다. 최신 Chrome 또는 Edge로 열어 주세요.</p>
        </div></div>`) +
    `<div class="card">
      <span class="card-tag is-red">1 · 음악</span>
      <div class="dropzone" data-drop>
        <div class="dz-icon">♪</div>
        <p><strong>음악 파일을 끌어다 놓거나 눌러서 고르세요</strong></p>
        <p class="muted small">한 곡씩 만듭니다 · mp3 · wav · m4a</p>
        <input type="file" accept="audio/*" hidden data-file>
      </div>
      <div data-load></div>
    </div>

    <div class="card" data-step2 hidden>
      <span class="card-tag" style="background:var(--purple)">2 · 모양</span>

      <div class="field">
        <p class="field-label">막대 모양</p>
        ${R.pillGroup('shape', SHAPES, { multi: false, selected: ['bars'] })}
      </div>

      <div class="field">
        <p class="field-label">막대 색 <small>아래에서 위로 색이 서서히 바뀝니다</small></p>
        <div class="colorrow">
          <label class="colorpick">
            <span>아래쪽</span>
            <input type="color" data-f="color" value="#FF7A59">
          </label>
          <span class="colorarrow">→</span>
          <label class="colorpick">
            <span>위쪽</span>
            <input type="color" data-f="color2" value="#FFD166">
          </label>
          <button type="button" class="btn sm is-ghost" data-same>한 가지 색으로</button>
        </div>
      </div>

      <div class="four-col">
        <label class="field"><span>막대 개수</span>
          <select data-f="bands">
            <option value="24">24개 (굵게)</option>
            <option value="48" selected>48개</option>
            <option value="72">72개 (촘촘)</option>
          </select></label>
        <label class="field"><span>화면 비율</span>
          <select data-f="size">
            ${Object.entries(SIZES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
          </select></label>
      </div>

      <div class="field">
        <p class="field-label">움직임 <small>바꾸면 다시 분석합니다</small></p>
        ${R.pillGroup('sens', Object.entries(SENSITIVITY).map(([k, v]) => ({ label: v.label, value: k })), {
          multi: false,
          selected: ['normal'],
        })}
      </div>

      <div class="preview-wrap">
        <canvas data-preview width="640" height="360"></canvas>
        <p class="muted small">가장 소리가 큰 순간의 모습입니다.</p>
      </div>

      <button class="btn" style="background:var(--purple)" data-go>영상 만들기</button>
      <div data-out></div>

      <div class="note" style="margin-top:18px">
        <strong>캡컷에서 쓰는 법</strong>
        만들어진 영상은 배경이 검정입니다. 캡컷에 얹은 뒤 검정을 지우면 됩니다.
        <ul>
          <li>영상을 배경 이미지 <b>위 트랙</b>에 올립니다</li>
          <li>오른쪽 <b>혼합(블렌드) 모드</b>를 <b>스크린</b> 또는 <b>밝게</b>로 바꿉니다</li>
          <li>검정 배경이 사라지고 막대만 남습니다</li>
        </ul>
        소리는 들어 있지 않습니다. 음악은 캡컷 프로젝트에 이미 있으니 화면만 얹으면 됩니다.
      </div>
    </div>`;

  R.wirePills(root);

  const zone = root.querySelector('[data-drop]');
  const input = root.querySelector('[data-file]');
  const load = root.querySelector('[data-load]');
  const step2 = root.querySelector('[data-step2]');
  const out = root.querySelector('[data-out]');
  const canvas = root.querySelector('[data-preview]');
  const f = (n) => root.querySelector(`[data-f=${n}]`);

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    handle([...e.dataTransfer.files].find((x) => x.type.startsWith('audio/')));
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    handle(file);
  });

  let settingsKey = '';
  function currentKey() {
    return `${f('bands').value}|${R.readPills(root, 'sens')[0]}`;
  }

  async function reanalyzeIfNeeded() {
    if (!lastFile || currentKey() === settingsKey) return;
    const S = sens();
    load.className = 'task-state';
    load.innerHTML = `<div class="spinner"></div><p>다시 분석하는 중…</p>`;
    analysis = await analyzeAudio(lastFile, {
      fps: 30,
      bands: +f('bands').value || 48,
      rangeDb: S.rangeDb,
      gamma: S.gamma,
      onProgress: (p) => {
        load.innerHTML = `<div class="spinner"></div><p>다시 분석하는 중… ${Math.round(p * 100)}%</p>`;
      },
    });
    settingsKey = currentKey();
    load.className = '';
    load.innerHTML = `<section class="rb">
      <h3>${R.esc(songName)}</h3>
      <p class="muted small">${toTimestamp(analysis.duration)} · ${analysis.frames.length.toLocaleString()}장 · 초당 ${analysis.fps}장</p>
    </section>`;
    preview();
  }

  root.addEventListener('change', async (e) => {
    if (e.target.matches('[data-f=bands]')) await reanalyzeIfNeeded();
    preview();
  });
  root.addEventListener('click', (e) => {
    if (!e.target.closest('.pill')) return;
    setTimeout(async () => {
      await reanalyzeIfNeeded();
      preview();
    }, 0);
  });

  let lastFile = null;

  function sens() {
    return SENSITIVITY[R.readPills(root, 'sens')[0] || 'normal'] || SENSITIVITY.normal;
  }

  async function handle(file) {
    if (!file) return;
    lastFile = file;
    songName = cleanTitle(file.name);

    load.className = 'task-state';
    load.innerHTML = `<div class="spinner"></div><p>소리를 분석하는 중…</p>`;

    try {
      const S = sens();
      analysis = await analyzeAudio(file, {
        fps: 30,
        bands: +f('bands').value || 48,
        rangeDb: S.rangeDb,
        gamma: S.gamma,
        onProgress: (p) => {
          load.innerHTML = `<div class="spinner"></div><p>소리를 분석하는 중… ${Math.round(p * 100)}%</p>`;
        },
      });

      load.className = '';
      load.innerHTML = `<section class="rb">
        <h3>${R.esc(songName)}</h3>
        <p class="muted small">${toTimestamp(analysis.duration)} · ${analysis.frames.length.toLocaleString()}장 · 초당 ${analysis.fps}장</p>
      </section>`;
      settingsKey = currentKey();
      step2.hidden = false;
      preview();
    } catch (err) {
      load.className = 'task-state fail';
      load.innerHTML = `<p><strong>읽지 못했습니다.</strong></p><p>${R.esc(err.message)}</p>`;
    }
  }

  /** 소리가 가장 큰 순간을 골라 미리 보여 줍니다. */
  function preview() {
    if (!analysis) return;
    const size = SIZES[f('size').value];
    canvas.width = 640;
    canvas.height = Math.round((640 * size.height) / size.width);

    let best = analysis.frames[0];
    let bestSum = 0;
    for (const fr of analysis.frames) {
      let sum = 0;
      for (const v of fr) sum += v;
      if (sum > bestSum) {
        bestSum = sum;
        best = fr;
      }
    }
    drawFrame(canvas, best, currentStyle());
  }

  function currentStyle() {
    return {
      shape: R.readPills(root, 'shape')[0] || 'bars',
      color: f('color').value,
      color2: f('color2').value,
    };
  }

  root.querySelector('[data-same]').addEventListener('click', () => {
    f('color2').value = f('color').value;
    preview();
  });

  root.querySelector('[data-go]').addEventListener('click', async () => {
    if (!analysis) return alert('음악 파일을 먼저 골라 주세요.');

    const btn = root.querySelector('[data-go]');
    const size = SIZES[f('size').value];
    const bands = +f('bands').value || 48;

    btn.disabled = true;
    out.className = 'task-state';

    try {
      const started = Date.now();
      const blob = await renderVideo({
        frames: analysis.frames,
        fps: analysis.fps,
        width: size.width,
        height: size.height,
        style: currentStyle(),
        onProgress: (p) => {
          const done = Math.round(p * 100);
          const left = p > 0.02 ? Math.round(((Date.now() - started) / p) * (1 - p) / 1000) : null;
          out.innerHTML = `<div class="spinner"></div>
            <p>영상 만드는 중 ${done}%</p>
            <div class="bar"><i style="width:${done}%"></i></div>
            <p class="muted small">${left !== null ? `약 ${left}초 남음` : '잠시만요'} · 이 화면을 닫지 마세요</p>`;
        },
      });

      out.className = '';
      const url = URL.createObjectURL(blob);
      out.innerHTML = `<section class="rb">
        <h3>완성했습니다</h3>
        <p class="muted small">${(blob.size / 1024 / 1024).toFixed(1)}MB · ${size.label}</p>
        <video controls src="${url}" style="width:100%;border:2px solid var(--border);border-radius:11px;margin:10px 0"></video>
        <button class="btn is-gold" data-dl>영상 받기</button>
      </section>`;

      out.querySelector('[data-dl]').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${songName}_파형.mp4`;
        a.click();
      });
    } catch (err) {
      out.className = 'task-state fail';
      out.innerHTML = `<p><strong>실패했습니다.</strong></p><p>${R.esc(err.message)}</p>`;
    } finally {
      btn.disabled = false;
    }
  });
}
