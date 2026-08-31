import { toast } from './ui.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** 눌러서 복사되는 버튼. data-copy에 원문을 담아 둡니다. */
export function copyBtn(text, label = '복사') {
  return `<button class="btn sm is-ghost copy" data-copy="${esc(text)}">${label}</button>`;
}

/** 페이지 어디서든 복사 버튼이 동작하게 한 번만 연결합니다. */
export function wireCopy(root) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      toast('복사했습니다');
    } catch {
      toast('복사할 수 없습니다. 직접 선택해 주세요');
    }
  });
}

export function block(title, inner) {
  return `<section class="rb"><h3>${esc(title)}</h3>${inner}</section>`;
}

export function bullets(items) {
  if (!items?.length) return `<p class="muted small">내용이 없습니다.</p>`;
  return `<ul class="rb-list">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

export function pairs(items, keyA, keyB) {
  if (!items?.length) return `<p class="muted small">내용이 없습니다.</p>`;
  return `<ul class="rb-list">${(items || [])
    .map((it) => `<li><strong>${esc(it[keyA])}</strong><br><span class="muted">${esc(it[keyB])}</span></li>`)
    .join('')}</ul>`;
}

export function para(text) {
  return `<p class="rb-para">${esc(text)}</p>`;
}

/** 복사 가능한 칩 목록 — 채널명 후보나 키워드처럼 하나씩 집어 쓰는 것들 */
export function chips(items) {
  if (!items?.length) return `<p class="muted small">내용이 없습니다.</p>`;
  return `<div class="chips">${(items || [])
    .map((t) => `<button class="chip copy" data-copy="${esc(t)}">${esc(t)}</button>`)
    .join('')}</div>`;
}

/**
 * 오래 걸리는 작업의 상태 표시를 한 곳에서 처리합니다.
 * 버튼을 잠그고, 진행 문구를 띄우고, 실패하면 이유를 보여 줍니다.
 */
export async function runTask({ button, output, working = '만드는 중', task, onDone }) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = working + '…';
  output.className = 'task-state';
  output.innerHTML = `<div class="spinner"></div><p>${esc(working)}… 20초에서 1분쯤 걸립니다.</p>`;

  try {
    const result = await task();
    output.className = '';
    output.innerHTML = '';
    onDone(result);
  } catch (err) {
    console.error('[작업 실패]', err);
    // 코드가 없으면 오류 종류라도 보여 줍니다.
    const code =
      err.code ||
      (err.status ? `HTTP-${err.status}` : null) ||
      (err.name && err.name !== 'Error' ? err.name : null) ||
      'APP-ERR';
    output.className = 'task-state fail';
    output.innerHTML = `<p><strong>실패했습니다.</strong> <code class="errcode">${esc(code)}</code></p>
      <p>${esc(err.message || '알 수 없는 오류입니다.')}</p>
      <p class="muted small">같은 문제가 반복되면 위 코드를 알려 주세요.</p>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

/**
 * 여러 개 고르는 알약 버튼 묶음.
 * custom에 안내문을 주면 목록에 없는 값을 직접 넣는 칸이 함께 나옵니다.
 */
export function pillGroup(name, options, { multi = true, selected = [], custom = null } = {}) {
  const pills = options
    .map(
      (o) =>
        `<button type="button" class="pill${selected.includes(o.value) ? ' on' : ''}" data-value="${esc(o.value)}">${esc(o.label)}</button>`
    )
    .join('');

  const adder = custom
    ? `<div class="pill-add">
        <input type="text" data-custom placeholder="${esc(custom)}">
        <button type="button" class="btn sm is-ghost" data-add-pill>+ 추가</button>
      </div>`
    : '';

  return `<div class="pills-wrap" data-group="${name}">
    <div class="pills" data-pills="${name}" data-multi="${multi}">${pills}</div>
    ${adder}
  </div>`;
}

export function wirePills(root) {
  root.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (pill) {
      const group = pill.closest('.pills');
      if (group.dataset.multi === 'false') {
        // 같은 이름을 가진 묶음이 여러 개로 나뉘어 있어도 하나만 켜지게 합니다.
        const name = group.dataset.pills;
        root.querySelectorAll(`[data-pills="${name}"] .pill`).forEach((p) => p.classList.remove('on'));
        pill.classList.add('on');
      } else {
        pill.classList.toggle('on');
      }
      return;
    }

    if (e.target.matches('[data-add-pill]')) addCustom(e.target.closest('.pills-wrap'));
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-custom]')) {
      e.preventDefault();
      addCustom(e.target.closest('.pills-wrap'));
    }
  });

  // 직접 넣은 값은 지울 수 있게 합니다.
  root.addEventListener('dblclick', (e) => {
    const pill = e.target.closest('.pill.is-custom');
    if (pill) pill.remove();
  });
}

function addCustom(wrap) {
  if (!wrap) return;
  const input = wrap.querySelector('[data-custom]');
  const group = wrap.querySelector('.pills');
  const single = group.dataset.multi === 'false';

  const values = input.value.split(',').map((v) => v.trim()).filter(Boolean);
  if (!values.length) return;

  for (const v of values) {
    if ([...group.querySelectorAll('.pill')].some((p) => p.dataset.value === v)) continue;
    if (single) group.querySelectorAll('.pill').forEach((p) => p.classList.remove('on'));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill is-custom on';
    btn.dataset.value = v;
    btn.textContent = v;
    btn.title = '직접 넣은 값 · 두 번 누르면 지워집니다';
    group.appendChild(btn);
    if (single) break;
  }
  input.value = '';
}

export function readPills(root, name) {
  return [...root.querySelectorAll(`[data-pills="${name}"] .pill.on`)].map((p) => p.dataset.value);
}

/** 화면 제목 */
export function header(eyebrow, title, accent, lede) {
  return `<p class="eyebrow">${esc(eyebrow)}</p>
    <h1>${esc(title)} <em>${esc(accent)}</em></h1>
    <p class="lede">${esc(lede)}</p>`;
}

/** 탭 */
export function tabs(items, active) {
  return `<div class="tabs">${items
    .map((t) => `<button class="tab${t.id === active ? ' on' : ''}" data-tab="${t.id}">${esc(t.label)}</button>`)
    .join('')}</div>`;
}
