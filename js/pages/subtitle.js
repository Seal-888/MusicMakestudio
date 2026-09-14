import * as R from '../render.js';
import { callGemini } from '../api/gemini.js';
import { lyricsSubtitle, PERSONAS } from '../prompts.js';
import { parseSrt, toSrt } from '../lyrics.js';
import { toast } from '../ui.js';

/**
 * 캡컷이 뽑아 준 자막의 시각은 그대로 두고, 글자만 우리말로 갈아 끼웁니다.
 *
 * 시각을 우리가 만들지 않는 것이 이 화면의 전부입니다.
 * 곡 길이만 보고 줄마다 시각을 추정하면 반드시 밀립니다.
 * 캡컷 자동 자막은 받아쓴 글자는 자주 틀리지만 시각은 잘 잡으므로,
 * 시각만 빌려 오고 글자는 정확한 가사 원문에서 가져옵니다.
 */
export default function renderSubtitle(root) {
  let blocks = [];   // 원본 SRT에서 읽은 것 (시각 포함)
  let ko = [];       // 옮긴 한국어 줄

  root.innerHTML = `
    <h1>가사 자막</h1>
    <p class="muted">캡컷 자동 자막으로 시각을 잡은 뒤, 여기서 글자만 우리말로 바꿉니다.</p>

    <div class="card">
      <span class="card-tag is-gold">먼저 캡컷에서</span>
      <ol class="muted small" style="margin:6px 0 0;padding-left:18px;line-height:1.8">
        <li>영상에 음원을 올리고 <b>자동 자막</b>을 돌립니다. 글자가 틀려도 괜찮습니다.</li>
        <li>자막을 <b>SRT 파일로 내보내기</b> 합니다.</li>
        <li>그 파일을 아래에 올리세요. 시각만 가져오고 글자는 새로 씁니다.</li>
      </ol>
    </div>

    <div class="card">
      <span class="card-tag is-red">1 · 넣기</span>

      <label class="field">
        <span>캡컷에서 내보낸 SRT</span>
        <input type="file" accept=".srt,.txt" data-srt-file>
        <small class="field-hint">또는 아래에 내용을 그대로 붙여 넣으셔도 됩니다.</small>
        <textarea rows="5" data-srt placeholder="1&#10;00:00:12,340 --> 00:00:15,100&#10;I told you not to look me..."></textarea>
      </label>
      <div data-srt-info></div>

      <label class="field">
        <span>정확한 가사 원문 <small>영어 그대로</small></span>
        <textarea rows="8" data-lyrics placeholder="[Verse 1]&#10;I told you not to look me in the eyes.&#10;..."></textarea>
        <small class="field-hint">구간 태그가 섞여 있어도 됩니다. 알아서 걸러 씁니다.</small>
      </label>

      <label class="field">
        <span>이 곡의 화자 <small>말투를 정합니다</small></span>
        <textarea rows="3" data-concept placeholder="예) 이 곡은 7대 죄악 중 교만이다. 가장 높은 자리에 올라선 사람이..."></textarea>
      </label>

      <div class="field">
        <p class="field-label">화자 성격</p>
        ${R.pillGroup(
          'persona',
          Object.entries(PERSONAS).map(([k, v]) => ({ label: v.label, value: k })),
          { multi: false, selected: ['villain'] }
        )}
      </div>

      <div class="style-head">
        <button class="btn is-red" data-go>우리말로 옮기기</button>
      </div>
      <div data-out></div>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  const info = $('[data-srt-info]');

  /** SRT를 읽어 몇 칸인지 보여 줍니다. 여기서 시각이 확정됩니다. */
  function readSrt(text) {
    blocks = parseSrt(text || '');
    if (!blocks.length) {
      info.innerHTML = text.trim()
        ? '<p class="mood-why is-weak">SRT로 읽히지 않습니다. 시각 줄(-->)이 있는지 확인해 주세요.</p>'
        : '';
      return;
    }
    const last = blocks[blocks.length - 1];
    const end = last.start + last.duration;
    info.innerHTML = `<p class="mood-why">자막 ${blocks.length}칸 · 끝나는 시각 ${fmt(end)}</p>`;
  }

  $('[data-srt]').addEventListener('input', (e) => readSrt(e.target.value));

  $('[data-srt-file]').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    $('[data-srt]').value = text;
    readSrt(text);
  });

  $('[data-go]').addEventListener('click', () => {
    if (!blocks.length) return alert('먼저 SRT를 올리거나 붙여 넣어 주세요.');
    const lyrics = $('[data-lyrics]').value.trim();
    if (!lyrics) return alert('정확한 가사 원문을 넣어 주세요. 자동 자막은 글자가 자주 틀립니다.');

    R.runTask({
      button: $('[data-go]'),
      output: $('[data-out]'),
      working: `${blocks.length}칸 옮기는 중`,
      task: () =>
        callGemini(
          lyricsSubtitle({
            blocks,
            lyrics,
            concept: $('[data-concept]').value.trim(),
            persona: R.readPills(root, 'persona')[0] || 'villain',
          })
        ),
      onDone: (d) => paint(d.lines || []),
    });
  });

  function paint(lines) {
    // 번호로 짝을 맞춥니다. 모델이 순서를 바꾸거나 빠뜨려도 어긋나지 않습니다.
    const byN = new Map(lines.map((x) => [String(x.n).trim(), (x.ko || '').trim()]));
    ko = blocks.map((_, i) => byN.get(String(i + 1)) || '');

    const filled = ko.filter(Boolean).length;
    const out = $('[data-out]');

    out.innerHTML = `
      <div class="card" style="margin-top:14px">
        <span class="card-tag is-gold">옮긴 결과 ${filled} / ${blocks.length}칸</span>
        ${
          filled < blocks.length
            ? `<p class="muted small">빈 칸은 추임새이거나 옮길 말이 없는 자리입니다. 아래에서 직접 채우셔도 됩니다.</p>`
            : ''
        }
        <div class="sub-list">
          ${blocks
            .map(
              (b, i) => `<div class="sub-row">
                <span class="sub-time">${fmt(b.start)}</span>
                <span class="sub-en">${R.esc(b.text.replace(/\n/g, ' '))}</span>
                <input type="text" data-ko="${i}" value="${R.esc(ko[i])}" placeholder="—">
              </div>`
            )
            .join('')}
        </div>
        <div class="style-head" style="margin-top:12px">
          <button class="btn is-red" data-dl-ko>한국어 SRT 내려받기</button>
          <button class="btn is-ghost" data-dl-both>영어+한국어 두 줄로 내려받기</button>
          <button class="btn is-ghost" data-copy>복사</button>
        </div>
        <p class="muted small">두 줄 버전은 위에 영어, 아래에 한국어입니다. 노래가 영어로 들리니 그 순서가 자연스럽습니다.</p>
      </div>`;

    out.querySelectorAll('[data-ko]').forEach((el) => {
      el.addEventListener('input', () => {
        ko[+el.dataset.ko] = el.value;
      });
    });

    out.querySelector('[data-dl-ko]').addEventListener('click', () => download(false));
    out.querySelector('[data-dl-both]').addEventListener('click', () => download(true));
    out.querySelector('[data-copy]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(build(false));
        toast('복사했습니다.');
      } catch {
        toast('복사하지 못했습니다. 내려받기를 쓰세요.');
      }
    });
  }

  /**
   * 시각은 원본 그대로, 글자만 바꿔 SRT를 다시 만듭니다.
   *
   * 한국어가 빈 칸은 두 버전 모두에서 뺍니다.
   * 추임새 자리라 영어만 남겨 두면 화면에 'yeah' 같은 것이 혼자 떠 버립니다.
   */
  function build(both) {
    const subs = blocks
      .map((b, i) => ({ b, ko: (ko[i] || '').trim() }))
      .filter((x) => x.ko)
      .map(({ b, ko: line }) => ({
        start: b.start,
        duration: b.duration,
        text: both ? `${b.text.replace(/\n/g, ' ')}\n${line}` : line,
      }));
    return toSrt(subs);
  }

  function download(both) {
    const text = build(both);
    if (!text.trim()) return alert('내보낼 자막이 없습니다.');
    const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `subtitle-${both ? 'en-ko' : 'ko'}-${new Date().toISOString().slice(0, 10)}.srt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function fmt(t) {
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  }
}
