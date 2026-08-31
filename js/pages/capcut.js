import { measureTracks, toTimestamp } from '../audio.js';
import { enableSort, applyOrder } from '../sortable.js';
import { buildProject, toSrt, parseSrt, readImageSize, mergeTranslation, SUBTITLE_Y } from '../capcut.js';
import { settings } from '../store.js';
import * as R from '../render.js';

const FONT_PRESETS = [
  { label: '캡컷 기본 폰트', value: '' },
  { label: '애플 SD 고딕 Neo (Mac)', value: '/System/Library/Fonts/AppleSDGothicNeo.ttc' },
  { label: 'Apple 산돌고딕 Neo (Mac)', value: '/System/Library/Fonts/AppleSDGothicNeo.ttc' },
  { label: '나눔고딕 (Mac 설치)', value: '/Library/Fonts/NanumGothic.ttf' },
  { label: '맑은 고딕 (Windows)', value: 'C:\\Windows\\Fonts\\malgun.ttf' },
  { label: '나눔고딕 (Windows)', value: 'C:\\Windows\\Fonts\\NanumGothic.ttf' },
  { label: '직접 입력', value: '__custom__' },
];

/** 파일명을 비교하기 쉽게 다듬습니다. 확장자·번호·기호·공백을 떼어 냅니다. */
function normalizeName(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-()\[\].]/g, ' ')
    .replace(/\b(자막|subtitle|srt|final|master|mix|v\d+)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 두 이름이 얼마나 겹치는지 0~1로 봅니다. */
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const setA = new Set(a.split(' ').filter((w) => w.length > 1));
  const setB = new Set(b.split(' ').filter((w) => w.length > 1));
  if (!setA.size || !setB.size) return 0;

  let hit = 0;
  for (const w of setA) if (setB.has(w)) hit++;
  return hit / Math.max(setA.size, setB.size);
}

/**
 * 곡과 SRT를 파일명으로 짝지어 줍니다.
 * 이름이 안 맞으면 남은 것끼리 올린 순서대로 채웁니다.
 */
function matchSrtToTracks(srtFiles, tracks) {
  const used = new Set();
  const pairs = tracks.map((t) => {
    const target = normalizeName(t.name);
    let best = null;
    let bestScore = 0;

    srtFiles.forEach((f, i) => {
      if (used.has(i)) return;
      const score = similarity(target, normalizeName(f.name));
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });

    if (best !== null && bestScore >= 0.5) {
      used.add(best);
      return { track: t, file: srtFiles[best], score: bestScore, how: '이름' };
    }
    return { track: t, file: null, score: 0, how: null };
  });

  // 이름으로 못 찾은 자리를 남은 파일로 순서대로 채웁니다.
  const leftovers = srtFiles.map((f, i) => i).filter((i) => !used.has(i));
  for (const pair of pairs) {
    if (pair.file) continue;
    const next = leftovers.shift();
    if (next === undefined) break;
    pair.file = srtFiles[next];
    pair.how = '순서';
  }
  return pairs;
}

export default function renderCapcut(root) {
  if (!window.showDirectoryPicker) {
    root.innerHTML =
      R.header('export to capcut', '캡컷으로', '보내기', '') +
      `<div class="card"><div class="placeholder">
        <div class="big">🧭</div>
        <p><strong>이 브라우저에서는 폴더 쓰기가 안 됩니다.</strong></p>
        <p>Chrome 또는 Edge로 열어 주세요. Safari와 Firefox는 폴더 쓰기 기능을 지원하지 않습니다.</p>
      </div></div>`;
    return;
  }

  // tracks: [{file, name, title, duration}] · images: [{file, name, url, width, height}]
  const state = { tracks: [], images: [], srt: [], srtSub: [] };

  root.innerHTML =
    R.header('export to capcut', '캡컷으로', '보내기', '음악·자막·이미지를 캡컷에서 바로 열리는 프로젝트로 만듭니다.') +
    `<div class="card">
      <span class="card-tag is-red">1 · 파일 고르기</span>

      <div class="pick" data-pick="audio">
        <div class="pick-icon">♪</div>
        <div class="pick-body">
          <strong>음악 파일 <span class="muted small">여러 개 OK</span></strong>
          <p class="muted small" data-sum="audio">눌러서 추가하세요 · 추가한 뒤 손잡이를 끌어 순서를 바꿀 수 있습니다</p>
        </div>
        <span class="pick-check">✓</span>
        <input type="file" accept="audio/*" multiple hidden data-in="audio">
      </div>
      <div data-tracks></div>

      <div class="pick" data-pick="images">
        <div class="pick-icon">🖼</div>
        <div class="pick-body">
          <strong>배경 이미지 <span class="muted small">선택 · 여러 장 OK</span></strong>
          <p class="muted small" data-sum="images">여러 장이면 전체 길이를 균등하게 나눠 배치합니다</p>
        </div>
        <span class="pick-check">✓</span>
        <input type="file" accept="image/*" multiple hidden data-in="images">
      </div>
      <div data-images></div>
    </div>

    <div class="card">
      <span class="card-tag is-blue">2 · 자막</span>
      <div class="modes">
        <label class="mode"><input type="radio" name="submode" value="title" checked>
          <span><strong>곡 제목 자막 자동 생성</strong><br>
          <span class="muted small">곡이 바뀔 때마다 제목을 띄웁니다. SRT 파일도 같이 만들어 둡니다.</span></span></label>
        <label class="mode"><input type="radio" name="submode" value="srt">
          <span><strong>SRT 파일 직접 첨부</strong><br>
          <span class="muted small">곡별 SRT를 여러 개 올리면 순서대로 짝지어 붙입니다. 합쳐진 SRT 1개도 됩니다.</span></span></label>
        <label class="mode"><input type="radio" name="submode" value="none">
          <span><strong>자막 없음</strong><br>
          <span class="muted small">음악과 이미지만 배치합니다.</span></span></label>
      </div>

      <div data-mode-title>
        <div class="two-col">
          <label class="field"><span>표시 시간</span>
            <select data-f="showSec">
              <option value="3">곡 시작 후 3초간</option>
              <option value="5" selected>곡 시작 후 5초간</option>
              <option value="8">곡 시작 후 8초간</option>
              <option value="0">곡이 끝날 때까지</option>
            </select></label>
          <label class="field"><span>번호</span>
            <select data-f="numbering">
              <option value="no">번호 없음</option>
              <option value="yes">1. 곡제목</option>
            </select></label>
        </div>
      </div>

      <div data-mode-srt hidden>
        <div class="pick" data-pick="srt">
          <div class="pick-icon">📄</div>
          <div class="pick-body">
            <strong>SRT 파일</strong>
            <p class="muted small" data-label="srt">곡별 SRT를 여러 개 올리면 파일명으로 짝지어 줍니다</p>
          </div>
          <span class="pick-check">✓</span>
          <input type="file" accept=".srt,text/plain" multiple hidden data-in="srt">
        </div>
        <div data-srt-match></div>

        <div class="pick" data-pick="srtSub" style="margin-top:11px">
          <div class="pick-icon">🌐</div>
          <div class="pick-body">
            <strong>번역 자막 <span class="muted small">선택 · 두 줄로 함께 보여 줍니다</span></strong>
            <p class="muted small" data-sum="srtSub">영어나 일본어 SRT를 올리면 원문 아래에 작게 붙습니다</p>
          </div>
          <span class="pick-check">✓</span>
          <input type="file" accept=".srt,text/plain" multiple hidden data-in="srtSub">
        </div>
      </div>

      <div data-style>
        <h4 class="sub-h">자막 스타일</h4>
        <div class="four-col">
          <label class="field"><span>글자 색</span><input type="color" data-f="textColor" value="#FFFFFF"></label>
          <label class="field"><span>테두리 색</span><input type="color" data-f="borderColor" value="#000000"></label>
          <label class="field"><span>글자 크기</span>
            <select data-f="size">
              <option value="small">작게</option>
              <option value="normal" selected>보통</option>
              <option value="large">크게</option>
              <option value="xlarge">아주 크게</option>
            </select></label>
          <label class="field"><span>위치</span>
            <select data-f="position">
              <option value="bottom" selected>하단</option>
              <option value="middle">중앙</option>
              <option value="top">상단</option>
            </select></label>
        </div>

        <label class="field"><span>폰트</span>
          <select data-f="font">${FONT_PRESETS.map((f, i) => `<option value="${i}">${f.label}</option>`).join('')}</select>
        </label>
        <div class="two-col" data-subrow hidden>
          <label class="field"><span>번역 줄 색</span><input type="color" data-f="subColor" value="#FFD9A0"></label>
          <label class="field"><span>번역 줄 크기</span>
            <select data-f="subScale">
              <option value="0.6">많이 작게</option>
              <option value="0.75" selected>작게</option>
              <option value="0.9">조금 작게</option>
            </select></label>
        </div>

        <label class="field" data-font-custom hidden>
          <span>폰트 파일 전체 경로
            <small>예) /Library/Fonts/내폰트.ttf · 직접 만든 폰트는 보통 여기에 설치됩니다</small></span>
          <input type="text" data-f="fontPath" placeholder="/Library/Fonts/MyFont.ttf">
        </label>
        <p class="muted small">경로가 틀려도 캡컷은 기본 폰트로 엽니다. 색·크기·위치는 그대로 적용됩니다.</p>
      </div>
    </div>

    <div class="card">
      <span class="card-tag is-green">3 · 프로젝트</span>
      <label class="field"><span>프로젝트 이름 <small>필수</small></span>
        <input type="text" data-f="name" placeholder="예) 비오는날_재즈플리"></label>

      <div class="two-col">
        <label class="field"><span>내 컴퓨터</span>
          <select data-f="os"><option value="mac">Mac</option><option value="win">Windows</option></select></label>
        <label class="field"><span>화면 비율</span>
          <select data-f="ratio">
            <option value="16:9">16:9 (1920×1080)</option>
            <option value="9:16">9:16 (1080×1920)</option>
            <option value="1:1">1:1 (1080×1080)</option>
          </select></label>
      </div>

      <label class="field">
        <span>컴퓨터 사용자 이름 <small>Finder에서 ⇧⌘H 를 누르면 창 제목에 나옵니다</small></span>
        <input type="text" data-f="user" placeholder="예) kjun" value="${R.esc(settings.get('capcutUser') || '')}">
      </label>

      <label class="field"><span>캡컷 드래프트 폴더 경로 <small>자동으로 채워집니다</small></span>
        <input type="text" data-f="draftPath" readonly></label>

      <div class="note">
        <strong>버튼을 누르면 폴더 선택창이 열립니다</strong>
        아래 폴더를 찾아 <code>com.lveditor.draft</code>를 선택해 주세요.
        <ul>
          <li>Mac: 동영상(Movies) → CapCut → User Data → Projects → com.lveditor.draft</li>
          <li>Windows: 주소창에 <code>%LocalAppData%\\CapCut\\User Data\\Projects\\com.lveditor.draft</code></li>
        </ul>
      </div>

      <button class="btn is-red" data-go>폴더 선택하고 프로젝트 만들기</button>
      <div data-out></div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const f = (n) => root.querySelector(`[data-f=${n}]`);

  /* 파일 고르기 — 고를 때마다 뒤에 덧붙입니다 */
  root.querySelectorAll('[data-pick]').forEach((zone) => {
    const kind = zone.dataset.pick;
    const input = root.querySelector(`[data-in=${kind}]`);
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const files = [...input.files];
      input.value = ''; // 같은 파일을 다시 고를 수 있게
      if (!files.length) return;
      if (kind === 'audio') await addAudio(files);
      else if (kind === 'images') await addImages(files);
      else if (kind === 'srtSub') {
        state.srtSub = files;
        zone.classList.add('on');
        root.querySelector('[data-sum=srtSub]').textContent =
          files.map((f) => f.name).join(', ').slice(0, 110);
        root.querySelector('[data-subrow]').hidden = false;
      } else {
        state.srt = files;
        zone.classList.add('on');
        paintSrtMatch();
      }
    });
  });

  /* 자막 모드 전환 */
  root.querySelectorAll('[name=submode]').forEach((r) =>
    r.addEventListener('change', () => {
      const m = root.querySelector('[name=submode]:checked').value;
      $('[data-mode-title]').hidden = m !== 'title';
      $('[data-mode-srt]').hidden = m !== 'srt';
      $('[data-style]').hidden = m === 'none';
    })
  );

  f('font').addEventListener('change', () => {
    $('[data-font-custom]').hidden = FONT_PRESETS[+f('font').value].value !== '__custom__';
  });

  /* 경로 자동 완성 */
  const updatePath = () => {
    const user = f('user').value.trim();
    const name = f('name').value.trim() || '프로젝트이름';
    f('draftPath').value = user
      ? f('os').value === 'mac'
        ? `/Users/${user}/Movies/CapCut/User Data/Projects/com.lveditor.draft/${name}`
        : `C:\\Users\\${user}\\AppData\\Local\\CapCut\\User Data\\Projects\\com.lveditor.draft\\${name}`
      : '사용자 이름을 입력해 주세요';
  };
  ['user', 'os', 'name'].forEach((n) => f(n).addEventListener('input', updatePath));
  f('os').addEventListener('change', updatePath);
  updatePath();

  /* ── 음악 목록 ── */
  async function addAudio(files) {
    const box = $('[data-tracks]');
    box.className = 'task-state';
    box.innerHTML = `<div class="spinner"></div><p>곡 길이를 재는 중…</p>`;
    try {
      const { tracks } = await measureTracks(files, (d, a, n) => {
        box.innerHTML = `<div class="spinner"></div><p>${d} / ${a} — ${R.esc(n)}</p>`;
      });
      state.tracks.push(...tracks.map((t) => ({ file: t.file, name: t.name, title: t.title, duration: t.duration })));
      paintTracks();
      paintSrtMatch();
    } catch (err) {
      box.className = 'task-state fail';
      box.innerHTML = `<p><strong>길이를 못 읽었습니다.</strong></p><p>${R.esc(err.message)}</p>`;
    }
  }

  function totalSec() {
    return state.tracks.reduce((sum, t) => sum + t.duration, 0);
  }

  /** 편집 중인 제목을 상태에 반영합니다. 다시 그리기 전에 부릅니다. */
  function syncTitles() {
    root.querySelectorAll('[data-tracks] .tl-title').forEach((input) => {
      const i = +input.closest('[data-row]').dataset.index;
      if (state.tracks[i]) state.tracks[i].title = input.value;
    });
  }

  function paintTracks(focusIndex = null) {
    const box = $('[data-tracks]');
    box.className = '';
    root.querySelector('[data-pick=audio]').classList.toggle('on', !!state.tracks.length);
    root.querySelector('[data-sum=audio]').textContent = state.tracks.length
      ? `${state.tracks.length}곡 · 전체 ${toTimestamp(totalSec(), { forceHours: true })} · 눌러서 더 추가`
      : '눌러서 추가하세요 · 추가한 뒤 손잡이를 끌어 순서를 바꿀 수 있습니다';

    if (!state.tracks.length) {
      box.innerHTML = '';
      return;
    }

    let cursor = 0;
    const rows = state.tracks.map((t, i) => {
      const start = cursor;
      cursor += t.duration;
      return `<li class="row" data-row data-index="${i}">
        <button class="handle" data-handle title="끌어서 순서 바꾸기 · 화살표 키로도 됩니다">⠿</button>
        <span class="row-no">${i + 1}</span>
        <span class="row-time">${toTimestamp(start)}</span>
        <input type="text" class="tl-title" value="${R.esc(t.title)}">
        <span class="row-dur">${toTimestamp(t.duration)}</span>
        <button class="row-x" data-remove="${i}" title="빼기">✕</button>
      </li>`;
    });

    box.innerHTML = `<section class="rb">
      <div class="list-head">
        <b>${state.tracks.length}곡 · 전체 ${toTimestamp(totalSec(), { forceHours: true })}</b>
        <button class="btn sm is-ghost grow" data-clear="tracks">전체 빼기</button>
      </div>
      <ul class="rowlist" data-sortable>${rows.join('')}</ul>
      <p class="muted small">손잡이(⠿)를 끌어 순서를 바꾸세요. 제목은 눌러서 고칠 수 있습니다.</p>
    </section>`;

    enableSort(box.querySelector('[data-sortable]'), (order, opt = {}) => {
      syncTitles();
      state.tracks = applyOrder(state.tracks, order);
      paintTracks(opt.focusIndex);
    });

    if (focusIndex !== null) {
      box.querySelectorAll('[data-handle]')[focusIndex]?.focus();
    }
  }

  /* ── 이미지 목록 ── */
  async function addImages(files) {
    for (const file of files) {
      try {
        const size = await readImageSize(file);
        state.images.push({ file, name: file.name, url: URL.createObjectURL(file), ...size });
      } catch {
        alert(`${file.name} 을 읽을 수 없습니다.`);
      }
    }
    paintImages();
  }

  function paintImages(focusIndex = null) {
    const box = $('[data-images]');
    root.querySelector('[data-pick=images]').classList.toggle('on', !!state.images.length);
    root.querySelector('[data-sum=images]').textContent = state.images.length
      ? `${state.images.length}장 · 눌러서 더 추가`
      : '여러 장이면 전체 길이를 균등하게 나눠 배치합니다';

    if (!state.images.length) {
      box.innerHTML = '';
      return;
    }

    const each = state.images.length ? totalSec() / state.images.length : 0;
    const rows = state.images.map(
      (img, i) => `<li class="row" data-row data-index="${i}">
        <button class="handle" data-handle title="끌어서 순서 바꾸기">⠿</button>
        <span class="row-no">${i + 1}</span>
        <img class="row-thumb" src="${img.url}" alt="">
        <span class="row-name">${R.esc(img.name)}<br>
          <span class="muted small">${img.width}×${img.height}</span></span>
        <span class="row-dur">${each ? toTimestamp(each) : '—'}</span>
        <button class="row-x" data-remove-img="${i}" title="빼기">✕</button>
      </li>`
    );

    box.innerHTML = `<section class="rb">
      <div class="list-head">
        <b>${state.images.length}장 · 한 장당 ${each ? toTimestamp(each) : '—'}</b>
        <button class="btn sm is-ghost grow" data-clear="images">전체 빼기</button>
      </div>
      <ul class="rowlist" data-sortable>${rows.join('')}</ul>
    </section>`;

    enableSort(box.querySelector('[data-sortable]'), (order, opt = {}) => {
      state.images = applyOrder(state.images, order);
      paintImages(opt.focusIndex);
    });

    if (focusIndex !== null) box.querySelectorAll('[data-handle]')[focusIndex]?.focus();
  }

  /* 빼기 버튼 */
  root.addEventListener('click', (e) => {
    const t = e.target;

    if (t.dataset.remove !== undefined) {
      syncTitles();
      state.tracks.splice(+t.dataset.remove, 1);
      paintTracks();
      paintImages(); // 전체 길이가 바뀌므로 이미지 배분도 다시
    }
    if (t.dataset.removeImg !== undefined) {
      URL.revokeObjectURL(state.images[+t.dataset.removeImg].url);
      state.images.splice(+t.dataset.removeImg, 1);
      paintImages();
    }
    if (t.dataset.clear === 'tracks') {
      if (!confirm('음악을 전부 뺄까요?')) return;
      state.tracks = [];
      paintTracks();
      paintImages();
    }
    if (t.dataset.clear === 'images') {
      if (!confirm('이미지를 전부 뺄까요?')) return;
      state.images.forEach((i) => URL.revokeObjectURL(i.url));
      state.images = [];
      paintImages();
    }
  });

  /* SRT 짝짓기 결과 보여 주기 */
  function paintSrtMatch() {
    const box = $('[data-srt-match]');
    if (!state.srt.length) {
      box.innerHTML = '';
      return;
    }

    if (state.srt.length === 1 && state.tracks.length > 1) {
      box.innerHTML = `<div class="note" style="margin-top:12px">
        <strong>합쳐진 SRT 하나로 봅니다</strong>
        ${R.esc(state.srt[0].name)} 를 플레이리스트 전체 자막으로 씁니다.
        곡마다 따로 넣으려면 곡 수만큼 SRT를 올려 주세요.
      </div>`;
      return;
    }

    if (!state.tracks.length) {
      box.innerHTML = `<p class="muted small" style="margin-top:10px">음악 파일을 먼저 골라 주세요.</p>`;
      return;
    }

    const pairs = matchSrtToTracks(state.srt, state.tracks);
    const missing = pairs.filter((p) => !p.file).length;

    box.innerHTML = `<section class="rb">
      <div class="list-head"><b>짝짓기 결과</b>
        <span class="muted small grow">${state.srt.length}개 올림 · ${state.srt.length - pairs.filter((p) => p.file).length}개 남음</span>
      </div>
      <ul class="rowlist">
        ${pairs
          .map(
            (p, i) => `<li class="row">
              <span class="row-no">${i + 1}</span>
              <span class="row-name">${R.esc(p.track.title)}
                <br><span class="muted small">${
                  p.file
                    ? `→ ${R.esc(p.file.name)} <b>(${p.how})</b>`
                    : '→ 짝지을 자막 없음 · 이 곡은 자막이 비어 있습니다'
                }</span></span>
              ${p.file ? '' : '<span class="row-dur">없음</span>'}
            </li>`
          )
          .join('')}
      </ul>
      ${
        missing
          ? `<p class="muted small">자막이 없는 곡은 그 구간만 비워 둡니다.</p>`
          : `<p class="muted small">파일명이 다르면 "순서"로 짝지어집니다. 위 목록이 맞는지 확인해 주세요.</p>`
      }
    </section>`;
  }

  /* 만들기 */
  $('[data-go]').addEventListener('click', async () => {
    const out = $('[data-out]');
    const name = f('name').value.trim();
    const user = f('user').value.trim();

    if (!state.tracks.length) return alert('음악 파일을 먼저 골라 주세요.');
    if (!name) return alert('프로젝트 이름을 입력해 주세요.');
    if (!user) return alert('컴퓨터 사용자 이름을 입력해 주세요.');
    if (/[/\\:*?"<>|]/.test(name)) return alert('프로젝트 이름에 쓸 수 없는 문자가 있습니다.');

    settings.set('capcutUser', user);

    syncTitles();
    let cursor = 0;
    const tracks = state.tracks.map((t) => {
      const row = { name: t.name, title: t.title.trim() || t.name, duration: t.duration, start: cursor };
      cursor += t.duration;
      return row;
    });
    const mode = root.querySelector('[name=submode]:checked').value;

    const fontPreset = FONT_PRESETS[+f('font').value];
    const style = {
      textColor: f('textColor').value,
      borderColor: f('borderColor').value,
      size: f('size').value,
      position: f('position').value,
      fontPath: fontPreset.value === '__custom__' ? f('fontPath').value.trim() : fontPreset.value,
      subColor: f('subColor').value,
      subScale: +f('subScale').value,
    };

    /* 자막 만들기 */
    let subtitles = null;
    if (mode === 'title') {
      const show = +f('showSec').value;
      const numbered = f('numbering').value === 'yes';
      subtitles = tracks.map((t, i) => ({
        text: numbered ? `${i + 1}. ${t.title}` : t.title,
        start: t.start,
        duration: show === 0 ? t.duration : Math.min(show, t.duration),
      }));
    } else if (mode === 'srt') {
      if (!state.srt.length) return alert('SRT 파일을 골라 주세요.');
      subtitles = [];

      if (state.srt.length === 1 && tracks.length > 1) {
        // 이미 합쳐진 SRT 하나 — 그대로 씁니다.
        subtitles = parseSrt(await state.srt[0].text(), 0);
      } else {
        // 곡별 SRT — 파일명으로 짝지어 각 곡의 시작 시각만큼 밀어 줍니다.
        const pairs = matchSrtToTracks(state.srt, state.tracks);
        for (let i = 0; i < pairs.length; i++) {
          const file = pairs[i].file;
          if (!file) continue;
          subtitles.push(...parseSrt(await file.text(), tracks[i].start));
        }
      }
      if (!subtitles.length) return alert('SRT에서 자막을 읽지 못했습니다.');

      // 번역 자막이 있으면 시간이 겹치는 원문에 둘째 줄로 붙입니다.
      if (state.srtSub.length) {
        let translated = [];
        if (state.srtSub.length === 1 && tracks.length > 1) {
          translated = parseSrt(await state.srtSub[0].text(), 0);
        } else {
          const pairs = matchSrtToTracks(state.srtSub, state.tracks);
          for (let i = 0; i < pairs.length; i++) {
            if (pairs[i].file) translated.push(...parseSrt(await pairs[i].file.text(), tracks[i].start));
          }
        }
        subtitles = mergeTranslation(subtitles, translated);
      }
    }

    const ratio = f('ratio').value;
    const canvas =
      ratio === '9:16' ? { width: 1080, height: 1920 }
      : ratio === '1:1' ? { width: 1080, height: 1080 }
      : { width: 1920, height: 1080 };

    const folderPath =
      f('os').value === 'mac'
        ? `/Users/${user}/Movies/CapCut/User Data/Projects/com.lveditor.draft/${name}`
        : `C:\\Users\\${user}\\AppData\\Local\\CapCut\\User Data\\Projects\\com.lveditor.draft\\${name}`;

    /* 폴더 고르고 쓰기 */
    let dir;
    try {
      dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch {
      return; // 사용자가 취소
    }

    const total = state.tracks.length + state.images.length + 5;
    let done = 0;
    const step = (msg) => {
      done++;
      out.className = 'task-state';
      out.innerHTML = `<div class="spinner"></div>
        <p>${R.esc(msg)}</p>
        <div class="bar"><i style="width:${Math.round((done / total) * 100)}%"></i></div>
        <p class="muted small">${done} / ${total}</p>`;
    };

    try {
      const projectDir = await dir.getDirectoryHandle(name, { create: true });
      const write = async (filename, data) => {
        const fh = await projectDir.getFileHandle(filename, { create: true });
        const w = await fh.createWritable();
        await w.write(data);
        await w.close();
      };

      for (const t of state.tracks) {
        step(`음악 복사 중 — ${t.name}`);
        await write(t.name, t.file);
      }

      const images = [];
      for (const img of state.images) {
        step(`이미지 복사 중 — ${img.name}`);
        await write(img.name, img.file);
        images.push({ name: img.name, width: img.width, height: img.height });
      }

      let srtFileName = null;
      if (subtitles?.length) {
        step('자막 파일 만드는 중');
        srtFileName = `${name}_자막.srt`;
        await write(srtFileName, new Blob(['\uFEFF' + toSrt(subtitles)], { type: 'text/plain;charset=utf-8' }));
      }

      step('프로젝트 파일 만드는 중');
      const project = buildProject({
        projectName: name, folderPath, tracks, images, subtitles, style, canvas, srtFileName,
      });

      for (const [key, value] of Object.entries(project)) {
        step(`${key}.json 쓰는 중`);
        await write(`${key}.json`, JSON.stringify(value));
      }

      out.className = '';
      out.innerHTML = `<section class="rb">
        <h3>완성했습니다</h3>
        <p><strong>${R.esc(name)}</strong> · ${tracks.length}곡 · ${images.length}장 ·
        자막 ${subtitles?.length || 0}개 · 전체 ${toTimestamp(totalSec(), { forceHours: true })}</p>
        <div class="note" style="margin:14px 0 0">
          <strong>캡컷이 켜져 있다면 완전히 끄고 다시 켜세요</strong>
          실행 중에는 새 프로젝트가 목록에 나타나지 않습니다.
        </div>
      </section>`;
    } catch (err) {
      out.className = 'task-state fail';
      out.innerHTML = `<p><strong>실패했습니다.</strong></p><p>${R.esc(err.message)}</p>
        <p class="muted small">고른 폴더가 com.lveditor.draft가 맞는지, 쓰기 권한을 허용했는지 확인해 주세요.</p>`;
    }
  });
}
