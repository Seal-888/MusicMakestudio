import { callGemini, generateImage, urlToInline, IMAGE_MODELS } from '../api/gemini.js';
import { searchPhotos } from '../api/pexels.js';
import { videoMatching } from '../prompts.js';
import { songs, settings } from '../store.js';
import * as R from '../render.js';

export default function renderVideo(root) {
  const saved = songs.all();

  root.innerHTML =
    R.header('video artwork', '영상', '만들기', '음악에 어울리는 이미지를 찾아 줍니다.') +
    `<div class="card">
      <span class="card-tag is-blue">1 · 음악 선택</span>

      ${
        saved.length
          ? `<label class="field">
              <span>저장한 노래에서 불러오기</span>
              <select data-f="saved">
                <option value="">— 직접 입력 —</option>
                ${saved.map((s) => `<option value="${s.id}">${R.esc(s.title)}</option>`).join('')}
              </select>
            </label>`
          : `<p class="muted small">음악 만들기에서 노래를 저장해 두면 여기서 바로 불러올 수 있습니다.</p>`
      }

      <label class="field"><span>노래 제목 <small>필수</small></span>
        <input type="text" data-f="title" placeholder="예) 봄의 끝에서"></label>
      <label class="field"><span>음악 스타일 / 분위기 <small>필수</small></span>
        <input type="text" data-f="style" placeholder="예) 잔잔한 어쿠스틱 발라드, 쓸쓸한"></label>
      <label class="field"><span>가사 또는 주제 <small>선택 · 넣으면 더 정확해집니다</small></span>
        <textarea rows="3" data-f="lyrics"></textarea></label>
    </div>

    <div class="card">
      <span class="card-tag is-green">2 · 이미지 소스</span>
      <label class="field">
        <span>어디서 가져올까요</span>
        ${R.pillGroup('source', [
          { label: 'Pexels 무료 사진', value: 'pexels' },
          { label: 'AI 이미지 프롬프트만', value: 'prompt' },
        ], { multi: false, selected: ['pexels'] })}
        <small class="muted">Pexels는 실제 사진을 바로 찾아 줍니다. 프롬프트 모드는 Midjourney 같은 데 붙여넣을 영문 문장만 만듭니다.</small>
      </label>

      <div class="two-col">
        <label class="field"><span>화면 비율</span>
          <select data-f="ratio">
            <option value="16:9">16:9 (일반 영상)</option>
            <option value="9:16">9:16 (쇼츠 / 릴스)</option>
            <option value="1:1">1:1 (정사각)</option>
          </select></label>
        <label class="field"><span>만들 장면 수</span>
          <select data-f="count">${[3, 4, 5, 6].map((n) => `<option>${n}</option>`).join('')}</select></label>
      </div>

      <button class="btn is-green" data-go>비주얼 매칭하기</button>
      <div data-out></div>
    </div>`;

  R.wireCopy(root);
  R.wirePills(root);

  const btn = root.querySelector('[data-go]');
  const out = root.querySelector('[data-out]');
  const field = (f) => root.querySelector(`[data-f=${f}]`);

  field('saved')?.addEventListener('change', (e) => {
    const song = saved.find((s) => s.id === e.target.value);
    if (!song) return;
    field('title').value = song.title;
    field('style').value = song.style || song.genres || '';
    field('lyrics').value = song.lyrics || '';
  });

  btn.addEventListener('click', () => {
    const title = field('title').value.trim();
    const style = field('style').value.trim();
    if (!title || !style) return alert('제목과 스타일을 입력해 주세요.');

    const source = R.readPills(root, 'source')[0] || 'pexels';
    if (source === 'pexels' && !settings.get('pexelsKey')) {
      return alert('Pexels 키가 없습니다. API 설정에서 넣거나 "AI 이미지 프롬프트만" 모드를 쓰세요.');
    }

    const ratio = field('ratio').value;

    R.runTask({
      button: btn,
      output: out,
      working: '어울리는 장면 찾는 중',
      task: async () => {
        const { matches } = await callGemini(
          videoMatching({
            title, style,
            lyrics: field('lyrics').value.trim(),
            ratio, source,
            count: +field('count').value,
          })
        );

        if (source !== 'pexels') return { matches, photos: null };

        // 검색어마다 사진을 가져옵니다. 하나가 실패해도 나머지는 살립니다.
        const photos = await Promise.all(
          matches.map((m) =>
            searchPhotos(m.prompt, { perPage: 4, ratio }).catch(() => [])
          )
        );
        return { matches, photos };
      },
      onDone: ({ matches, photos }) => {
        if (!matches?.length) {
          out.innerHTML = `<p class="muted">장면을 만들지 못했습니다. 다시 시도해 주세요.</p>`;
          return;
        }
        out.innerHTML = matches
          .map((m, i) => {
            const shots = photos?.[i] || [];
            return `<section class="rb">
              <h3>${R.esc(m.sceneTitle)}</h3>
              <div class="style-head">${R.copyBtn(m.prompt, photos ? '검색어 복사' : '프롬프트 복사')}</div>
              <pre class="rb-pre">${R.esc(m.prompt)}</pre>
              ${
                photos
                  ? shots.length
                    ? `<div class="shots">${shots
                        .map(
                          (p) => `<label class="shot" title="${R.esc(p.photographer)}">
                            <input type="checkbox" data-shot value="${R.esc(p.large)}">
                            <img src="${p.thumb}" alt="${R.esc(m.sceneTitle)}" loading="lazy">
                            <span>${R.esc(p.photographer)}</span>
                            <a class="shot-open" href="${p.full}" target="_blank" rel="noopener" title="원본 열기">↗</a>
                          </label>`
                        )
                        .join('')}</div>`
                    : `<p class="muted small">이 검색어로는 사진을 못 찾았습니다. 검색어를 복사해 Pexels에서 직접 찾아보세요.</p>`
                  : ''
              }
            </section>`;
          })
          .join('') +
          (photos
            ? `<p class="muted small">사진 출처: Pexels · 영상 설명란에 촬영자 이름을 적어 주는 것이 좋습니다.</p>
               ${composePanel()}`
            : '');

        if (photos) wireCompose(out);
      },
    });
  });
}


/* ── 고른 사진들을 하나의 이미지로 합치기 (나노바나나) ── */
function composePanel() {
  return `<section class="rb" id="compose">
    <h3>고른 사진으로 이미지 만들기</h3>
    <p class="muted small">위에서 사진을 골라 체크하면, 그 사진들을 재료로 새 이미지를 하나 만듭니다.
    썸네일이나 영상 배경으로 쓸 수 있습니다.</p>
    <p class="pickcount" data-picked>고른 사진 0장</p>

    <label class="field">
      <span>어떻게 만들까요 <small>비워 두면 자연스럽게 하나로 합칩니다</small></span>
      <textarea rows="3" data-c="prompt" placeholder="예) 이 사진들의 분위기를 하나로 합쳐서 비 오는 밤의 도시 풍경으로. 사람은 넣지 말고, 왼쪽 위에 제목 넣을 여백을 비워 줘"></textarea>
    </label>

    <div class="two-col">
      <label class="field"><span>모델</span>
        <select data-c="model">
          ${IMAGE_MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}
        </select></label>
      <label class="field"><span>비율</span>
        <select data-c="ratio">
          <option value="16:9">16:9 (썸네일 · 영상)</option>
          <option value="9:16">9:16 (쇼츠)</option>
          <option value="1:1">1:1 (정사각)</option>
          <option value="">지정 안 함</option>
        </select></label>
    </div>

    <button class="btn" style="background:var(--purple)" data-c="go">이미지 만들기</button>
    <div class="note" style="margin:14px 0 0">
      <strong>알아 두면 좋은 것</strong>
      <ul>
        <li>Pexels 사진은 수정과 상업적 사용이 허용됩니다</li>
        <li>만들어진 이미지에는 구글의 눈에 안 보이는 표식(SynthID)이 들어갑니다</li>
        <li>이미지 생성은 결제가 등록된 Gemini 키에서만 될 수 있습니다</li>
      </ul>
    </div>
    <div data-c="out"></div>
  </section>`;
}

function wireCompose(root) {
  const panel = root.querySelector('#compose');
  if (!panel) return;

  const picked = () => [...root.querySelectorAll('[data-shot]:checked')].map((c) => c.value);
  const label = panel.querySelector('[data-picked]');

  const refresh = () => {
    const n = picked().length;
    label.textContent = n ? `고른 사진 ${n}장` : '고른 사진 0장 — 위에서 사진을 체크해 주세요';
    label.classList.toggle('on', n > 0);
  };
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-shot]')) refresh();
  });
  refresh();

  const pick = (n) => panel.querySelector(`[data-c=${n}]`);
  const out = pick('out');

  pick('go').addEventListener('click', () => {
    const urls = picked();
    if (!urls.length) return alert('먼저 위에서 사진을 골라 주세요.');
    if (urls.length > 6) return alert('사진은 6장까지만 넣을 수 있습니다.');

    const userPrompt = pick('prompt').value.trim();
    const prompt =
      userPrompt ||
      '이 사진들을 재료로 하나의 자연스러운 이미지를 만들어 주세요. ' +
        '색감과 조명을 통일해서 한 장면처럼 보이게 하고, 사람 얼굴은 넣지 마세요. ' +
        '유튜브 썸네일이나 영상 배경으로 쓸 수 있게 여백을 남겨 주세요.';

    R.runTask({
      button: pick('go'),
      output: out,
      working: '이미지 만드는 중',
      task: async () => {
        const images = [];
        for (const url of urls) images.push(await urlToInline(url));
        return generateImage({
          prompt,
          images,
          model: pick('model').value,
          aspectRatio: pick('ratio').value || null,
        });
      },
      onDone: (results) => {
        out.innerHTML = results
          .map(
            (img, i) => `<div class="gen">
              <img src="data:${img.mimeType};base64,${img.data}" alt="만들어진 이미지">
              <button class="btn sm is-gold" data-gen="${i}">이미지 받기</button>
            </div>`
          )
          .join('');

        out.querySelectorAll('[data-gen]').forEach((b) =>
          b.addEventListener('click', () => {
            const img = results[+b.dataset.gen];
            const a = document.createElement('a');
            a.href = `data:${img.mimeType};base64,${img.data}`;
            a.download = `합성이미지_${Date.now()}.png`;
            a.click();
          })
        );
      },
    });
  });
}
