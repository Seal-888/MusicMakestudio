import { measureTracks, toTimestamp, toSrtTime } from '../audio.js';
import { enableSort, applyOrder } from '../sortable.js';
import * as R from '../render.js';

export default function renderTimestamp(root) {
  const state = { tracks: [] };

  root.innerHTML =
    R.header('timestamp generator', '타임스탬프', '자동 생성', '곡을 순서대로 올리면 유튜브 챕터 목록을 계산합니다.') +
    `<div class="card">
      <span class="card-tag">음악 파일</span>
      <div class="dropzone" data-drop>
        <div class="dz-icon">♪</div>
        <p><strong>음악 파일을 끌어다 놓거나 눌러서 고르세요</strong></p>
        <p class="muted small">mp3 · wav · m4a · flac · 여러 개 한꺼번에 가능합니다</p>
        <input type="file" accept="audio/*" multiple hidden data-file>
      </div>
      <div data-tracks></div>
      <div data-out></div>
    </div>`;

  R.wireCopy(root);

  const zone = root.querySelector('[data-drop]');
  const input = root.querySelector('[data-file]');
  const box = root.querySelector('[data-tracks]');
  const out = root.querySelector('[data-out]');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    add([...e.dataTransfer.files].filter((f) => f.type.startsWith('audio/')));
  });
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.value = '';
    add(files);
  });

  async function add(files) {
    if (!files.length) return;
    box.className = 'task-state';
    box.innerHTML = `<div class="spinner"></div><p>길이를 재는 중…</p>`;
    try {
      const { tracks } = await measureTracks(files, (d, a, n) => {
        box.innerHTML = `<div class="spinner"></div><p>${d} / ${a} — ${R.esc(n)}</p>`;
      });
      state.tracks.push(...tracks.map((t) => ({ name: t.name, title: t.title, duration: t.duration })));
      paint();
    } catch (err) {
      box.className = 'task-state fail';
      box.innerHTML = `<p><strong>실패했습니다.</strong></p><p>${R.esc(err.message)}</p>`;
    }
  }

  function syncTitles() {
    box.querySelectorAll('.tl-title').forEach((el) => {
      const i = +el.closest('[data-row]').dataset.index;
      if (state.tracks[i]) state.tracks[i].title = el.value;
    });
  }

  function starts() {
    let cursor = 0;
    return state.tracks.map((t) => { const s = cursor; cursor += t.duration; return s; });
  }

  function paint(focusIndex = null) {
    box.className = '';
    if (!state.tracks.length) { box.innerHTML = ''; out.innerHTML = ''; return; }

    const st = starts();
    const total = st[st.length - 1] + state.tracks[state.tracks.length - 1].duration;

    box.innerHTML = `<section class="rb">
      <div class="list-head">
        <b>${state.tracks.length}곡 · 전체 ${toTimestamp(total, { forceHours: true })}</b>
        <button class="btn sm is-ghost grow" data-clear>전체 빼기</button>
      </div>
      <ul class="rowlist" data-sortable>
        ${state.tracks.map((t, i) => `<li class="row" data-row data-index="${i}">
            <button class="handle" data-handle title="끌어서 순서 바꾸기 · 화살표 키로도 됩니다">⠿</button>
            <span class="row-no">${i + 1}</span>
            <span class="row-time">${toTimestamp(st[i])}</span>
            <input type="text" class="tl-title" value="${R.esc(t.title)}">
            <span class="row-dur">${toTimestamp(t.duration)}</span>
            <button class="row-x" data-remove="${i}" title="빼기">✕</button>
          </li>`).join('')}
      </ul>
      <p class="muted small">손잡이(⠿)를 끌어 순서를 바꾸세요. 제목은 눌러서 고칠 수 있습니다.</p>
    </section>`;

    enableSort(box.querySelector('[data-sortable]'), (order, opt = {}) => {
      syncTitles();
      state.tracks = applyOrder(state.tracks, order);
      paint(opt.focusIndex);
    });

    if (focusIndex !== null) box.querySelectorAll('[data-handle]')[focusIndex]?.focus();
    showOutput();
  }

  box.addEventListener('click', (e) => {
    if (e.target.dataset.remove !== undefined) {
      syncTitles();
      state.tracks.splice(+e.target.dataset.remove, 1);
      paint();
    }
    if (e.target.dataset.clear !== undefined) {
      if (!confirm('전부 뺄까요?')) return;
      state.tracks = [];
      paint();
    }
  });

  box.addEventListener('input', (e) => {
    if (e.target.classList.contains('tl-title')) { syncTitles(); refresh(); }
  });

  function showOutput() {
    out.innerHTML = `<section class="rb">
      <h3>영상 설명란에 붙여넣기</h3>
      <div class="opts">
        <label><input type="checkbox" data-o="number"> 번호 붙이기</label>
        <label><input type="checkbox" data-o="hours"> 시:분:초로 통일</label>
        <label><input type="checkbox" data-o="duration"> 각 곡 길이 표시</label>
      </div>
      <div class="style-head">
        <button class="btn sm is-ghost copy" data-copy-out>목록 복사</button>
        <button class="btn sm is-gold" data-srt>SRT로 내려받기</button>
      </div>
      <pre class="rb-pre" data-chapters></pre>
      <p class="muted small">유튜브 챕터가 켜지려면 첫 줄이 0:00이어야 하고, 챕터가 3개 이상이어야 합니다.</p>
    </section>`;

    out.addEventListener('change', refresh);
    out.querySelector('[data-srt]').addEventListener('click', downloadSrt);
    refresh();
  }

  function build() {
    const o = {
      number: out.querySelector('[data-o=number]')?.checked,
      hours: out.querySelector('[data-o=hours]')?.checked,
      duration: out.querySelector('[data-o=duration]')?.checked,
    };
    const st = starts();
    return state.tracks.map((t, i) => {
      const time = toTimestamp(st[i], { forceHours: o.hours });
      const no = o.number ? `${i + 1}. ` : '';
      const dur = o.duration ? ` (${toTimestamp(t.duration)})` : '';
      return `${time} ${no}${t.title.trim() || t.name}${dur}`;
    }).join('\n');
  }

  function refresh() {
    const el = out.querySelector('[data-chapters]');
    if (!el) return;
    const text = build();
    el.textContent = text;
    out.querySelector('[data-copy-out]').dataset.copy = text;
  }

  function downloadSrt() {
    const st = starts();
    const srt = state.tracks.map((t, i) =>
      `${i + 1}\n${toSrtTime(st[i])} --> ${toSrtTime(st[i] + Math.min(5, t.duration))}\n${t.title.trim() || t.name}\n`
    ).join('\n');
    const blob = new Blob(['\uFEFF' + srt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '플레이리스트_자막.srt';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
