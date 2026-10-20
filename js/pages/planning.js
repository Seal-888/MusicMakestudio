import { callGemini, youtubePart, filePart } from '../api/gemini.js';
import { resolveChannel, fetchChannelVideos, parseChannelInput, fetchVideoSeconds } from '../api/youtube.js';
import { toVideo, summarize, rankByPerDay } from '../videostats.js';
import { styles, refs, settings } from '../store.js';
import { readDuration, toTimestamp } from '../audio.js';
import { toast } from '../ui.js';
import { channelPlan, referenceAnalysis, visualPalette, playlistStyleAnalysis } from '../prompts.js';
import * as R from '../render.js';

const MOODS = [
  { label: '몽환적', value: 'dreamy, ethereal' },
  { label: '따뜻한', value: 'warm, cozy' },
  { label: '아늑한', value: 'intimate, snug' },
  { label: '빈티지', value: 'vintage, retro' },
  { label: '모던', value: 'modern, clean' },
  { label: '미니멀', value: 'minimal' },
  { label: '선명한', value: 'vivid, high contrast' },
  { label: '파스텔', value: 'pastel' },
  { label: '어두운', value: 'dark, moody' },
  { label: '밝은', value: 'bright, airy' },
  { label: '사이버펑크', value: 'cyberpunk, neon' },
  { label: '자연스러운', value: 'natural, organic' },
];

export default function renderPlanning(root) {
  const active = sessionStorage.getItem('planning:tab') || 'plan';

  root.innerHTML =
    R.header('channel planning', '플리채널', '기획', '레퍼런스를 뜯어보고, 채널을 기획하고, 비주얼까지 한 번에.') +
    R.tabs(
      [
        { id: 'plan', label: '채널 기획' },
        { id: 'ref', label: '레퍼런스 분석' },
        { id: 'palette', label: '비주얼 팔레트' },
        { id: 'sound', label: '플리 스타일 분석' },
      ],
      active
    ) +
    `<div id="tab-body"></div>`;

  const body = root.querySelector('#tab-body');

  root.querySelector('.tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
    sessionStorage.setItem('planning:tab', tab.dataset.tab);
    paint(tab.dataset.tab);
  });

  R.wireCopy(root);
  R.wirePills(root);
  paint(active);

  function paint(tab) {
    if (tab === 'plan') return planTab(body);
    if (tab === 'ref') return refTab(body);
    if (tab === 'sound') return soundTab(body);
    return paletteTab(body);
  }
}

/** 음원 파일 한도. 아래 takeFile 설명 참고. */
const MAX_UPLOAD_MB = 14;

/* ── 채널 기획 ── */
function planTab(body) {
  body.innerHTML = `
    <div class="card">
      <span class="card-tag is-red">채널 기획안</span>
      <label class="field">
        <span>채널 컨셉과 분위기 <small>필수 · 자세할수록 결과가 좋아집니다</small></span>
        <textarea rows="3" data-f="concept" placeholder="예) 비 오는 날 혼자 듣는 재즈. 도시의 밤, 쓸쓸하지만 따뜻한 느낌"></textarea>
      </label>
      <label class="field">
        <span>타겟 시청자 <small>비워 두면 컨셉에 맞게 알아서 정합니다</small></span>
        <input type="text" data-f="target" placeholder="예) 야근하는 20-30대 직장인">
      </label>
      <label class="field">
        <span>다룰 장르 <small>쉼표로 구분</small></span>
        <input type="text" data-f="genres" placeholder="예) 재즈, 로파이, 시티팝">
      </label>
      <button class="btn is-red" data-go>기획안 만들기</button>
      <div data-out></div>
    </div>`;

  const btn = body.querySelector('[data-go]');
  const out = body.querySelector('[data-out]');

  btn.addEventListener('click', () => {
    const concept = body.querySelector('[data-f=concept]').value.trim();
    if (!concept) return alert('채널 컨셉을 입력해 주세요.');

    R.runTask({
      button: btn,
      output: out,
      working: '기획안 작성 중',
      task: () =>
        callGemini(
          channelPlan({
            concept,
            target: body.querySelector('[data-f=target]').value.trim(),
            genres: body.querySelector('[data-f=genres]').value.trim(),
          })
        ),
      onDone: (d) => {
        out.innerHTML = `
          ${R.block('채널명 후보', R.chips(d.channelNames))}
          ${R.block('슬로건', R.para(d.tagline) + R.copyBtn(d.tagline))}
          ${R.block('채널 소개글', R.para(d.description) + R.copyBtn(d.description))}
          ${R.block('차별화 포인트', R.bullets(d.usp))}
          ${R.block('정기 시리즈', R.pairs(d.contentSeries, 'title', 'desc'))}
          ${R.block('업로드 전략', R.para(d.uploadStrategy))}
          ${R.block('제목 공식', R.pairs(d.titleFormulas, 'formula', 'example'))}
          ${R.block('썸네일 방향', R.para(d.thumbnailDirection))}
          ${R.block('초기 성장 전략', R.bullets(d.growthTips))}
          ${R.block('수익화 아이디어', R.bullets(d.monetizationIdeas))}`;
      },
    });
  });
}

/* ── 레퍼런스 분석 ── */
function refTab(body) {
  body.innerHTML = `
    <div class="card">
      <span class="card-tag is-blue">레퍼런스 채널 분석</span>
      <label class="field">
        <span>채널 주소 또는 핸들 <small>@핸들 · 채널 URL · 영상 URL 다 됩니다</small></span>
        <input type="text" data-f="url" placeholder="예) @서울플리">
      </label>
      <label class="field">
        <span>분석할 영상 개수 <small><b data-count>30</b>개 · 많을수록 정확하지만 오래 걸립니다</small></span>
        <input type="range" min="10" max="50" step="10" value="30" data-f="count">
      </label>
      <button class="btn is-blue" data-go>채널 분석하기</button>
      <div data-out></div>
    </div>`;

  const btn = body.querySelector('[data-go]');
  const out = body.querySelector('[data-out]');
  const range = body.querySelector('[data-f=count]');
  range.addEventListener('input', () => (body.querySelector('[data-count]').textContent = range.value));

  btn.addEventListener('click', () => {
    const url = body.querySelector('[data-f=url]').value.trim();
    if (!url) return alert('채널 주소를 입력해 주세요.');

    R.runTask({
      button: btn,
      output: out,
      working: '채널 데이터 수집 중',
      task: async () => {
        const channel = await resolveChannel(url);
        const videos = (await fetchChannelVideos(channel, +range.value)).map((v) => toVideo(v));
        if (!videos.length) throw new Error('공개된 영상이 없는 채널입니다.');

        const stats = summarize(channel, videos);
        const { top, bottom } = rankByPerDay(videos);

        const analysis = await callGemini(
          referenceAnalysis({
            channel: { name: channel.snippet.title, description: channel.snippet.description },
            stats,
            titles: videos.slice(0, 25).map((v) => v.title),
            topVideos: top,
            bottomVideos: bottom,
          })
        );
        return { channel, stats, analysis };
      },
      onDone: ({ channel, stats, analysis: d }) => {
        out.innerHTML = `
          <section class="rb">
            <h3>${R.esc(channel.snippet.title)}</h3>
            <dl class="facts">
              <div class="fact"><dt>구독자</dt><dd>${stats.subscribers.toLocaleString()}</dd></div>
              <div class="fact"><dt>평균 조회수</dt><dd>${Math.round(stats.avgViews).toLocaleString()}</dd></div>
              <div class="fact"><dt>중앙값</dt><dd>${Math.round(stats.medianViews).toLocaleString()}</dd></div>
              <div class="fact"><dt>평균 길이</dt><dd>${stats.avgDurationText}</dd></div>
              <div class="fact"><dt>업로드 간격</dt><dd>${stats.avgGapDays}일</dd></div>
              <div class="fact"><dt>분석 영상</dt><dd>${stats.sampleSize}개</dd></div>
            </dl>
          </section>
          <p class="muted small">장르·무드·BPM·썸네일은 소리나 이미지를 보지 않고 제목과 소개글로 <b>추정</b>한 것입니다.
          실제 소리를 맞추려면 "플리 스타일 분석" 탭에서 영상을 직접 들려주세요.</p>
          ${R.block('장르 (추정)', R.para(d.genreEstimate))}
          ${R.block('무드 (추정)', R.para(d.moodEstimate))}
          ${R.block('BPM (추정)', R.para(d.bpmEstimate))}
          ${R.block('제목 패턴', R.para(d.titlePattern))}
          ${R.block('썸네일 (추정)', R.para(d.thumbnailStyle))}
          ${R.block('조회수 패턴', R.para(d.viewPattern))}
          ${R.block('이 니치의 성공 공식', R.bullets(d.successFormula))}
          ${R.block('따라 해볼 것', R.bullets(d.copyableElements))}
          <div class="more-wrap">
            <button class="btn is-gold" data-save-ref>이 스타일로 음악 만들기</button>
            <p class="muted small">저장하면 음악 만들기 화면에서 불러 쓸 수 있습니다.</p>
          </div>`;

        out.querySelector('[data-save-ref]').addEventListener('click', () => {
          refs.add({
            name: channel.snippet.title,
            source: '채널 분석',
            summary: `${d.genreEstimate} · ${d.moodEstimate} · ${d.bpmEstimate}`,
            detail: [
              `장르: ${d.genreEstimate}`,
              `무드: ${d.moodEstimate}`,
              `BPM: ${d.bpmEstimate}`,
              `제목 패턴: ${d.titlePattern}`,
            ].join('\n'),
            fields: {
              genre: d.genreEstimate || '',
              bpm: d.bpmEstimate || '',
              vocal: '',
              instruments: '',
              mood: d.moodEstimate || '',
            },
          });
          toast('레퍼런스로 저장했습니다');
        });
      },
    });
  });
}

/* ── 비주얼 팔레트 ── */
function paletteTab(body) {
  body.innerHTML = `
    <div class="card">
      <span class="card-tag" style="background:var(--purple)">비주얼 팔레트</span>
      <label class="field">
        <span>컨셉과 분위기 <small>필수</small></span>
        <textarea rows="3" data-f="concept" placeholder="예) 비 오는 날 혼자 듣는 재즈. 도시의 밤"></textarea>
      </label>
      <label class="field">
        <span>무드 키워드 <small>여러 개 고를 수 있습니다</small></span>
        ${R.pillGroup('mood', MOODS)}
      </label>
      <label class="field">
        <span>타겟 <small>선택</small></span>
        <input type="text" data-f="target" placeholder="예) 야근하는 직장인">
      </label>
      <button class="btn" style="background:var(--purple)" data-go>비주얼 팔레트 만들기</button>
      <div data-out></div>
    </div>`;

  const btn = body.querySelector('[data-go]');
  const out = body.querySelector('[data-out]');

  btn.addEventListener('click', () => {
    const concept = body.querySelector('[data-f=concept]').value.trim();
    if (!concept) return alert('컨셉을 입력해 주세요.');

    R.runTask({
      button: btn,
      output: out,
      working: '비주얼 가이드 만드는 중',
      task: () =>
        callGemini(
          visualPalette({
            concept,
            moods: R.readPills(body, 'mood').join(', '),
            target: body.querySelector('[data-f=target]').value.trim(),
          })
        ),
      onDone: (d) => {
        out.innerHTML = `
          ${R.block('채널명 아이디어', R.chips(d.channelNameIdeas))}
          ${R.block('컬러 팔레트', swatches(d.colorPalette))}
          ${R.block('프로필 이미지 컨셉', R.para(d.profileConcept))}
          ${R.block(
            '프로필 이미지 프롬프트',
            `<pre class="rb-pre">${R.esc(d.profilePrompt)}</pre>${R.copyBtn(d.profilePrompt, '프롬프트 복사')}`
          )}
          ${R.block('폰트 추천', R.pairs((d.fontSuggestions || []).map((f) => ({ a: f.name, b: `${f.mood} · ${f.usage}` })), 'a', 'b'))}
          ${R.block('썸네일 레이아웃', R.pairs(d.thumbnailLayouts, 'name', 'desc'))}
          ${R.block('비주얼 키워드', R.chips(d.visualKeywords))}`;
      },
    });
  });
}

function swatches(colors) {
  // 모델이 hex 를 엉뚱하게 적으면 색이 빈칸으로 보입니다. 형식이 맞는 것만 그립니다.
  return `<div class="swatches">${(colors || [])
    .filter((c) => /^#([0-9a-f]{3}){1,2}$/i.test((c.hex || '').trim()))
    .map(
      (c) => `<button class="swatch copy" data-copy="${R.esc(c.hex)}" title="눌러서 복사">
        <span class="chipcolor" style="background:${R.esc(c.hex)}"></span>
        <b>${R.esc(c.name)}</b>
        <code>${R.esc(c.hex)}</code>
        <small>${R.esc(c.usage)}</small>
      </button>`
    )
    .join('')}</div>`;
}


/* ── 플리 스타일 분석 ──
   유튜브 영상을 Gemini에 통째로 들려주고, 그 소리를 만드는 Suno 프롬프트를 역산합니다. */
function soundTab(body) {
  let picked = null; // 고른 음원 파일

  body.innerHTML = `
    <div class="card">
      <span class="card-tag is-green">플리 스타일 분석</span>
      <p style="margin-top:0">마음에 드는 음악을 넣으면 Gemini가 <b>실제 소리를 듣고</b>
      그 느낌을 내려면 Suno에 무엇을 넣어야 하는지 알려 줍니다.</p>

      <div class="modes">
        <label class="mode"><input type="radio" name="sndsrc" value="youtube" checked>
          <span><strong>유튜브 영상</strong><br>
          <span class="muted small">공개 영상의 주소를 넣습니다. 긴 플레이리스트도 구간을 잘라 들을 수 있습니다.</span></span></label>
        <label class="mode"><input type="radio" name="sndsrc" value="file">
          <span><strong>음원 파일 올리기</strong><br>
          <span class="muted small">내가 가진 mp3를 직접 넣습니다. ${MAX_UPLOAD_MB}MB 이하.</span></span></label>
      </div>

      <div data-src="youtube">
        <label class="field">
          <span>유튜브 영상 URL <small>공개 영상만 됩니다</small></span>
          <input type="text" data-f="url" placeholder="https://www.youtube.com/watch?v=...">
        </label>

        <div class="field">
          <p class="field-label">어느 구간을 들을까요 <small>긴 영상을 통째로 넣으면 느리고 비쌉니다</small></p>
          ${R.pillGroup('where', [
            { label: '앞부분', value: 'start' },
            { label: '중간부터', value: 'middle' },
            { label: '직접 지정', value: 'custom' },
          ], { multi: false, selected: ['middle'] })}
        </div>

        <div class="two-col">
          <label class="field">
            <span>들을 길이</span>
            <select data-f="len">
              <option value="90">1분 30초 (빠름)</option>
              <option value="180" selected>3분 (권장)</option>
              <option value="300">5분 (정확)</option>
            </select>
          </label>
          <label class="field" data-custom-start hidden>
            <span>시작 지점 <small>분:초 또는 초</small></span>
            <input type="text" data-f="start" placeholder="예) 4:30">
          </label>
        </div>
      </div>

      <div data-src="file" hidden>
        <div class="dropzone" data-drop>
          <div class="dz-icon">♪</div>
          <p><strong>음원 파일을 끌어다 놓거나 눌러서 고르세요</strong></p>
          <p class="muted small" data-filelabel>mp3 · wav · m4a · ${MAX_UPLOAD_MB}MB 이하</p>
          <input type="file" accept="audio/*" hidden data-file>
        </div>
      </div>

      <button class="btn is-green" style="margin-top:16px" data-go>소리 분석하기</button>
      <div data-out></div>
    </div>`;

  const btn = body.querySelector('[data-go]');
  const out = body.querySelector('[data-out]');
  const zone = body.querySelector('[data-drop]');
  const fileInput = body.querySelector('[data-file]');

  const mode = () => body.querySelector('input[name=sndsrc]:checked').value;

  body.querySelectorAll('input[name=sndsrc]').forEach((r) =>
    r.addEventListener('change', () => {
      body.querySelector('[data-src=youtube]').hidden = mode() !== 'youtube';
      body.querySelector('[data-src=file]').hidden = mode() !== 'file';
    })
  );

  body.addEventListener('click', (e) => {
    if (e.target.closest('.pill')) {
      const where = R.readPills(body, 'where')[0];
      body.querySelector('[data-custom-start]').hidden = where !== 'custom';
    }
  });

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(x.name));
    if (!f) return toast('음원 파일(mp3 · wav · m4a)만 넣을 수 있습니다');
    takeFile(f);
  });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    takeFile(f);
  });

  function takeFile(file) {
    if (!file) return;
    // Gemini는 요청 하나를 20MB까지 받습니다. 파일은 base64로 바뀌며 4/3배 커지므로
    // 원본은 15MB 아래여야 합니다. 예전 20MB 한도로는 15~20MB 파일이 늘 실패했습니다.
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      return alert(`${MAX_UPLOAD_MB}MB가 넘는 파일은 넣을 수 없습니다. 더 짧은 음원이나 낮은 비트레이트로 바꿔 주세요.`);
    }
    picked = file;
    zone.classList.add('on');
    body.querySelector('[data-filelabel]').textContent = file.name;
  }

  btn.addEventListener('click', () => {
    if (mode() === 'file') return runFile();
    return runYoutube();
  });

  async function runYoutube() {
    const raw = body.querySelector('[data-f=url]').value.trim();
    if (!raw) return alert('유튜브 영상 URL을 넣어 주세요.');

    const parsed = parseChannelInput(raw);
    if (!parsed || parsed.type !== 'video') {
      return alert('영상 URL이 아닙니다. youtube.com/watch?v=... 형태로 넣어 주세요.');
    }
    const url = `https://www.youtube.com/watch?v=${parsed.value}`;
    const len = +body.querySelector('[data-f=len]').value;
    const where = R.readPills(body, 'where')[0] || 'middle';

    /**
     * 영상 길이를 알면 구간을 그 안에 맞춥니다.
     *
     * 예전에는 '중간부터'가 늘 5:00부터였습니다. 3~4분짜리 노래 한 곡을 넣으면
     * 영상이 끝난 뒤를 들으라고 보내는 셈이라, 실패하거나 엉뚱한 분석이 나왔습니다.
     * YouTube 키가 있으면 길이를 읽어(1단위) 진짜 중간을 잡습니다.
     */
    let total = null;
    if (settings.get('youtubeKey')) {
      try {
        total = await fetchVideoSeconds(parsed.value);
      } catch {
        total = null; // 길이를 못 읽어도 분석은 해 봅니다.
      }
    }

    let start = 0;
    if (where === 'middle') start = total ? Math.max(0, Math.round(total / 2 - len / 2)) : 300;
    if (where === 'custom') start = toSeconds(body.querySelector('[data-f=start]').value);

    let end = start + len;
    if (total) {
      if (start >= total) {
        return alert(`시작 지점(${fmtClock(start)})이 영상 길이(${fmtClock(total)})보다 뒤입니다.`);
      }
      end = Math.min(end, total);
    } else if (where === 'middle') {
      toast('YouTube 키가 없어 영상 길이를 모릅니다. 5:00부터 듣습니다. 짧은 영상이면 "앞부분"을 고르세요.');
    }

    run({
      windowNote: `들려드리는 구간은 영상의 ${fmtClock(start)}부터 ${fmtClock(end)}까지입니다.`,
      source: 'youtube',
      parts: [youtubePart(url, { startSec: start, endSec: end })],
    });
  }

  async function runFile() {
    if (!picked) return alert('음원 파일을 골라 주세요.');
    let note = '';
    try {
      const sec = await readDuration(picked);
      note = `이 음원은 전체 ${toTimestamp(sec)} 길이입니다. 처음부터 끝까지 들려드립니다.`;
    } catch {
      note = '음원 전체를 들려드립니다.';
    }
    run({ windowNote: note, source: 'file', parts: [await filePart(picked)] });
  }

  function run({ windowNote, source, parts }) {
    R.runTask({
      button: btn,
      output: out,
      working: '소리 듣는 중',
      task: () =>
        callGemini({
          ...playlistStyleAnalysis({ windowNote, promptCount: 3, source }),
          extraParts: parts,
        }),
      onDone: (d) => paint(d),
    });
  }

  function paint(d) {
    out.innerHTML = `
      ${R.block('한마디로', R.para(d.overview))}
      <section class="rb">
        <h3>소리의 뼈대</h3>
        <dl class="facts">
          <div class="fact"><dt>장르</dt><dd>${R.esc(d.genre)}</dd></div>
          <div class="fact"><dt>BPM</dt><dd>${R.esc(d.bpm)}</dd></div>
          <div class="fact"><dt>조성</dt><dd>${R.esc(d.key)}</dd></div>
        </dl>
        <p class="rb-para" style="margin-top:12px"><b>보컬</b><br>${R.esc(d.vocal)}</p>
      </section>
      ${R.block('들리는 악기', R.pairs(d.instruments, 'name', 'role'))}
      ${R.block('믹싱과 질감', R.para(d.production))}
      ${R.block('곡 전개', R.para(d.structure))}
      ${R.block(
        'Suno 스타일 프롬프트',
        `<p class="muted small">Suno의 Style 칸에 그대로 붙여넣으세요.</p>` +
          (d.sunoPrompts || [])
            .map(
              (p, i) => `<div class="style-card">
                <div class="style-head"><b>${R.esc(p.label)}</b>
                  <span class="lenbadge is-${p.prompt.length < 400 ? 'short' : p.prompt.length > 1000 ? 'long' : 'ok'}">${p.prompt.length}자${p.prompt.length > 1000 ? ' · 1000자 초과, Suno에서 잘립니다' : ''}</span>
                  ${R.copyBtn(p.prompt)}
                  <button class="btn sm is-gold" data-save="${i}">보관함에 저장</button>
                </div>
                <pre class="rb-pre">${R.esc(p.prompt)}</pre>
              </div>`
            )
            .join('')
      )}
      ${R.block(
        '피해야 할 것',
        `<p class="muted small">Suno의 Exclude Styles 칸에 넣으세요.</p>
         <div class="style-head">${R.copyBtn(d.negativePrompt)}</div>
         <pre class="rb-pre">${R.esc(d.negativePrompt)}</pre>`
      )}
      ${R.block('더 가깝게 가려면', R.bullets(d.tips))}
      <div class="more-wrap">
        <button class="btn is-gold" data-save-ref>이 스타일로 음악 만들기</button>
        <p class="muted small">저장하면 음악 만들기 화면에서 불러 쓸 수 있습니다.</p>
      </div>`;

    out.onclick = (e) => {
      if (e.target.dataset.saveRef !== undefined) {
        refs.add({
          name: d.genre.slice(0, 40),
          source: '소리 분석',
          summary: `${d.genre} · ${d.bpm}`,
          detail: [
            `장르: ${d.genre}`,
            `BPM: ${d.bpm}`,
            `조성: ${d.key}`,
            `보컬: ${d.vocal}`,
            `악기: ${(d.instruments || []).map((x) => `${x.name}(${x.role})`).join(', ')}`,
            `믹싱: ${d.production}`,
            `전개: ${d.structure}`,
            `Suno 스타일 참고: ${d.sunoPrompts?.[0]?.prompt || ''}`,
            `피할 것: ${d.negativePrompt}`,
          ].join('\n'),
          sunoPrompt: d.sunoPrompts?.[0]?.prompt || '',
          negative: d.negativePrompt || '',
          // 음악 만들기의 옵션을 자동으로 맞추기 위해 원본 값을 따로 담아 둡니다.
          fields: {
            genre: d.genre || '',
            bpm: d.bpm || '',
            vocal: d.vocal || '',
            instruments: (d.instruments || []).map((x) => x.name).join(', '),
            mood: d.overview || '',
          },
        });
        toast('레퍼런스로 저장했습니다');
        return;
      }
      const i = e.target.dataset.save;
      if (i === undefined) return;
      const p = d.sunoPrompts[+i];
      styles.add({ label: p.label, prompt: p.prompt, genres: d.genre });
      toast('스타일 보관함에 저장했습니다');
    };
  }
}

function toSeconds(text) {
  const t = (text || '').trim();
  if (!t) return 0;
  if (t.includes(':')) {
    const parts = t.split(':').map(Number).reverse();
    return (parts[0] || 0) + (parts[1] || 0) * 60 + (parts[2] || 0) * 3600;
  }
  return +t || 0;
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
