import { callGemini } from '../api/gemini.js';
import { seoOptimize } from '../prompts.js';
import { songs } from '../store.js';
import { tidyLyrics, tidyStyle } from '../lyrics.js';
import { toast } from '../ui.js';
import * as R from '../render.js';

const MARKETS = [
  { label: '한국', value: 'kr' },
  { label: '글로벌 (영어)', value: 'global' },
  { label: '일본', value: 'jp' },
  { label: '중국', value: 'cn' },
  { label: '한국 + 글로벌', value: 'both' },
];

export default function renderMetadata(root) {
  const active = sessionStorage.getItem('meta:tab') || 'songs';

  root.innerHTML =
    R.header('metadata tools', '메타데이터', '', '저장한 노래를 모아 두고, 영상 제목·설명·태그를 만듭니다.') +
    R.tabs(
      [
        { id: 'songs', label: '저장된 노래' },
        { id: 'seo', label: 'SEO 최적화' },
      ],
      active
    ) +
    `<div id="tab-body"></div>`;

  const body = root.querySelector('#tab-body');

  root.querySelector('.tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
    sessionStorage.setItem('meta:tab', tab.dataset.tab);
    tab.dataset.tab === 'songs' ? songsTab(body) : seoTab(body);
  });

  R.wireCopy(root);
  R.wirePills(root);
  active === 'songs' ? songsTab(body) : seoTab(body);
}

/* ── 저장된 노래 ── */
function songsTab(body) {
  function paint() {
    const all = songs.all();
    body.innerHTML = `<div class="card">
      ${
        all.length
          ? `<div class="lib-bar"><span>${all.length}곡 저장됨</span></div>` +
            all
              .map(
                (s) => `<article class="lib-item">
                  <div class="style-head">
                    <b>${R.esc(s.title)}</b>
                    ${R.copyBtn(tidyLyrics(s.lyrics), '가사 복사')}
                    <button class="btn sm is-red" data-del="${s.id}">삭제</button>
                  </div>
                  <p class="muted small">
                    ${s.titleAlt ? `다른 제목: ${R.esc(s.titleAlt)} · ` : ''}
                    ${R.esc(s.genres || '')} · ${s.duration || ''} ·
                    ${new Date(s.savedAt).toLocaleDateString('ko-KR')}
                  </p>
                  ${s.style ? `<pre class="rb-pre">${R.esc(tidyStyle(s.style))}</pre>` : ''}
                  <details><summary>가사 보기</summary><pre class="rb-pre lyrics">${R.esc(tidyLyrics(s.lyrics))}</pre></details>
                </article>`
              )
              .join('')
          : `<div class="placeholder">
              <div class="big">${R.icon('list')}</div>
              <p><strong>아직 저장된 노래가 없습니다.</strong></p>
              <p>음악 만들기에서 "메타데이터에 저장"을 눌러 주세요.</p>
              <p style="margin-top:16px"><a class="btn is-ghost" href="#/music">음악 만들기로 가기</a></p>
            </div>`
      }
    </div>`;

    body.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (!confirm('이 노래를 지울까요?')) return;
        songs.remove(btn.dataset.del);
        paint();
        toast('삭제했습니다');
      })
    );
  }
  paint();
}

/* ── SEO 최적화 ── */
function seoTab(body) {
  const saved = songs.all();

  body.innerHTML = `<div class="card">
    <span class="card-tag is-red">제목 · 설명 · 태그</span>

    ${
      saved.length
        ? `<label class="field">
            <span>저장된 노래에서 가져오기 <small>여러 곡을 고르면 수록곡 목록으로 넣습니다</small></span>
            <select data-f="saved" multiple size="${Math.min(5, saved.length)}">
              ${saved.map((s) => `<option value="${s.id}">${R.esc(s.title)}</option>`).join('')}
            </select>
          </label>`
        : ''
    }

    <label class="field">
      <span>영상 주제 / 컨셉 <small>필수</small></span>
      <textarea rows="2" data-f="topic" placeholder="예) 카페에서 듣기 좋은 K-Lo-Fi 플레이리스트 / 비 오는 날 발라드 모음"></textarea>
    </label>

    <label class="field">
      <span>메인 장르 / 무드</span>
      <input type="text" data-f="genre" placeholder="예) K-Lo-Fi, dreamy, slow tempo, Korean female vocal">
    </label>

    <label class="field">
      <span>타겟 시장 / 언어</span>
      ${R.pillGroup('market', MARKETS, { multi: false, selected: ['kr'] })}
    </label>

    <button class="btn is-red" data-go>SEO 최적화 생성</button>
    <div data-out></div>
  </div>`;

  const btn = body.querySelector('[data-go]');
  const out = body.querySelector('[data-out]');
  const savedSel = body.querySelector('[data-f=saved]');

  savedSel?.addEventListener('change', () => {
    const picked = [...savedSel.selectedOptions].map((o) => saved.find((s) => s.id === o.value)).filter(Boolean);
    if (picked.length && !body.querySelector('[data-f=genre]').value) {
      body.querySelector('[data-f=genre]').value = picked[0].genres || '';
    }
  });

  btn.addEventListener('click', () => {
    const topic = body.querySelector('[data-f=topic]').value.trim();
    if (!topic) return alert('영상 주제를 입력해 주세요.');

    const songTitles = savedSel
      ? [...savedSel.selectedOptions].map((o) => saved.find((s) => s.id === o.value)?.title).filter(Boolean)
      : [];

    R.runTask({
      button: btn,
      output: out,
      working: '키워드 뽑는 중',
      task: () =>
        callGemini(
          seoOptimize({
            topic,
            genre: body.querySelector('[data-f=genre]').value.trim(),
            market: R.readPills(body, 'market')[0] || 'kr',
            songTitles,
          })
        ),
      onDone: (d) => {
        // 유튜브 규칙에 맞게 다듬습니다. 모델이 지키라는 걸 자주 놓칩니다.
        const hashtags = (d.hashtags || []).map((h) => '#' + String(h).trim().replace(/^#+/, '').replace(/\s+/g, ''));
        const tags = [...new Set((d.tags || []).map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean))];
        const tagLine = tags.join(', ');
        const longTitles = (d.titles || []).filter((t) => t.length > 100);
        out.innerHTML = `
          ${R.block(
            '제목 후보',
            R.chips(d.titles) +
              (longTitles.length
                ? `<p class="lenbadge is-long">${longTitles.length}개가 유튜브 한도(100자)를 넘습니다. 줄여서 쓰세요.</p>`
                : '')
          )}
          ${R.block('해시태그', R.chips(hashtags))}
          ${R.block(
            '설명글',
            `<div class="style-head">${R.copyBtn(d.description, '설명 복사')}</div>
             <pre class="rb-pre">${R.esc(d.description)}</pre>`
          )}
          ${R.block(
            '태그',
            `<div class="style-head">${R.copyBtn(tagLine, '태그 전체 복사')}</div>
             <p class="muted small">유튜브 태그 칸에 그대로 붙여넣으세요. ${tagLine.length} / 500자${
               tagLine.length > 500 ? ' — <b>500자를 넘어 유튜브가 받지 않습니다.</b> 뒤쪽 태그를 몇 개 빼세요.' : ''
             }</p>
             ${R.chips(tags)}`
          )}
          ${R.block('썸네일 문구', R.chips(d.thumbnailText))}
          ${R.block('키워드를 이렇게 고른 이유', R.bullets(d.keywordStrategy))}
          <p class="muted small">AI는 실제 검색량 데이터를 보지 않습니다. 고른 키워드는 유튜브 검색창 자동완성으로 한 번 확인해 보세요.</p>`;
      },
    });
  });
}
