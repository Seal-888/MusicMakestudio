import { styles } from '../store.js';
import { callGemini } from '../api/gemini.js';
import { styleVariations } from '../prompts.js';
import { toast } from '../ui.js';
import * as R from '../render.js';

export default function renderStyles(root) {
  root.innerHTML =
    R.header('style library', '스타일', '보관함', '저장한 Suno 스타일 프롬프트를 다시 꺼내 씁니다.') +
    `<div class="card">
      <div class="lib-bar">
        <span data-count></span>
        <input type="text" data-search placeholder="이름이나 장르로 찾기" class="lib-search">
        <button class="btn sm is-gold" data-export>파일로 내보내기</button>
        <button class="btn sm is-ghost" data-import>파일에서 가져오기</button>
        <input type="file" accept="application/json" hidden data-import-file>
      </div>
      <div data-list></div>
    </div>`;

  R.wireCopy(root);

  const list = root.querySelector('[data-list]');
  const search = root.querySelector('[data-search]');
  const importFile = root.querySelector('[data-import-file]');

  function paint() {
    const all = styles.all();
    const q = search.value.trim().toLowerCase();
    const shown = q
      ? all.filter((s) => `${s.label} ${s.prompt} ${s.genres || ''}`.toLowerCase().includes(q))
      : all;

    root.querySelector('[data-count]').textContent = `${all.length}개 저장됨`;

    if (!all.length) {
      list.innerHTML = `<div class="placeholder">
        <div class="big">🎨</div>
        <p><strong>아직 저장된 스타일이 없습니다.</strong></p>
        <p>음악 만들기에서 결과가 나오면 "보관함에 저장"을 눌러 주세요.</p>
        <p style="margin-top:16px"><a class="btn is-ghost" href="#/music">음악 만들기로 가기</a></p>
      </div>`;
      return;
    }

    if (!shown.length) {
      list.innerHTML = `<p class="muted" style="padding:24px 0;text-align:center">찾는 스타일이 없습니다.</p>`;
      return;
    }

    list.innerHTML = shown
      .map(
        (s) => `<article class="lib-item">
          <div class="style-head">
            <b>${R.esc(s.label)}</b>
            ${R.copyBtn(s.prompt)}
            <select class="vary-count" data-count="${s.id}">
              ${[3, 5, 8, 10].map((n) => `<option value="${n}"${n === 5 ? ' selected' : ''}>${n}개</option>`).join('')}
            </select>
            <button class="btn sm is-blue" data-vary="${s.id}">변주 만들기</button>
            <button class="btn sm is-red" data-del="${s.id}">삭제</button>
          </div>
          ${s.genres ? `<p class="muted small">${R.esc(s.genres)} · ${new Date(s.savedAt).toLocaleDateString('ko-KR')}</p>` : ''}
          <pre class="rb-pre">${R.esc(s.prompt)}</pre>
          <div data-vary-out="${s.id}"></div>
        </article>`
      )
      .join('');
  }

  /**
   * 하나의 스타일에서 서로 다른 변주를 뽑습니다.
   * 플레이리스트를 만들 때 곡마다 다른 프롬프트를 쓰기 위한 것입니다.
   */
  function makeVariations(id, button) {
    const item = styles.all().find((s) => s.id === id);
    if (!item) return;
    const box = list.querySelector(`[data-vary-out="${id}"]`);

    const count = +(list.querySelector(`[data-count="${id}"]`)?.value || 5);

    R.runTask({
      button,
      output: box,
      working: `${count}개 변주 만드는 중`,
      task: () =>
        callGemini(
          styleVariations({
            base: item.prompt,
            count,
            keep: item.genres ? `장르: ${item.genres}` : '',
          })
        ),
      onDone: ({ variations }) => {
        box.innerHTML = `<section class="rb">
          <h3>${(variations || []).length}개 변주</h3>
          <p class="muted small">채널 색은 그대로 두고 실제로 다르게 들리는 부분만 바꿨습니다.
          곡마다 다른 변주를 쓰면 플레이리스트가 지루해지지 않습니다.</p>
          ${(variations || [])
            .map(
              (v, i) => `<div class="style-card">
                <div class="style-head">
                  <b>${R.esc(v.label)}</b>
                  <span class="lenbadge is-${v.prompt.length < 400 ? 'short' : 'ok'}">${v.prompt.length}자 · ${R.esc(v.bpm)}</span>
                  ${R.copyBtn(v.prompt)}
                  <button class="btn sm is-gold" data-keep="${i}">보관함에 저장</button>
                </div>
                <p class="muted small">바꾼 것: ${R.esc(v.changed)}</p>
                <pre class="rb-pre">${R.esc(v.prompt)}</pre>
              </div>`
            )
            .join('')}
        </section>`;

        box.querySelectorAll('[data-keep]').forEach((b) =>
          b.addEventListener('click', () => {
            const v = variations[+b.dataset.keep];
            styles.add({
              label: `${item.label} · ${v.label}`,
              prompt: v.prompt,
              genres: item.genres,
            });
            toast('보관함에 저장했습니다');
            b.disabled = true;
            b.textContent = '저장됨';
          })
        );
      },
    });
  }

  search.addEventListener('input', paint);

  list.addEventListener('click', (e) => {
    const varyId = e.target.dataset.vary;
    if (varyId) return makeVariations(varyId, e.target);

    const id = e.target.dataset.del;
    if (!id) return;
    if (!confirm('이 스타일을 지울까요?')) return;
    styles.remove(id);
    paint();
    toast('삭제했습니다');
  });

  root.querySelector('[data-export]').addEventListener('click', () => {
    const all = styles.all();
    if (!all.length) return toast('내보낼 스타일이 없습니다');
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `스타일보관함-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  root.querySelector('[data-import]').addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', async () => {
    const f = importFile.files?.[0];
    if (!f) return;
    try {
      const items = JSON.parse(await f.text());
      if (!Array.isArray(items)) throw new Error();
      items.forEach((i) => styles.add({ label: i.label, prompt: i.prompt, genres: i.genres }));
      paint();
      toast(`${items.length}개를 가져왔습니다`);
    } catch {
      toast('파일을 읽을 수 없습니다');
    }
  });

  paint();
}
