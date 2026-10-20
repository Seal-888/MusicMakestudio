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
  let en = [];       // 가사 원문으로 바로잡은 영어 줄

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
        <span>이 곡이 어떤 이야기인가 <small>옮길 때의 기준이 됩니다</small></span>
        <textarea rows="3" data-concept placeholder="예) 이 곡은 7대 죄악 중 교만이다. 가장 높은 자리에 올라선 사람이..."></textarea>
        <small class="field-hint">음악 만들기에 넣었던 주제를 그대로 붙여 넣으시면 됩니다.
        아래 말투와 어긋나면 이쪽을 따릅니다.</small>
      </label>

      <div class="field">
        <p class="field-label">옮길 때의 말투 <small>어떻게 들리게 할지</small></p>
        ${R.pillGroup(
          'persona',
          // 라벨에서 '— 설명' 부분을 떼어 짧게 보여 줍니다. 여기서는 말투만 고르면 됩니다.
          Object.entries(PERSONAS).map(([k, v]) => ({ label: v.label.split(' — ')[0], value: k })),
          { multi: false, selected: ['villain'] }
        )}
        <div class="muted small" data-voice-note></div>
      </div>

      <div class="style-head">
        <button class="btn is-red" data-go>우리말로 옮기기</button>
      </div>
      <div data-out></div>
    </div>
  `;

  // 알약을 눌렀을 때 켜지고 꺼지게 합니다. 이걸 빠뜨리면 그려지기만 하고 눌리지 않습니다.
  R.wirePills(root);

  const $ = (s) => root.querySelector(s);
  const info = $('[data-srt-info]');

  /** 고른 말투가 실제로 어떤 지시인지 보여 줍니다. 고르고 나서야 알면 늦습니다. */
  function paintVoice() {
    const key = R.readPills(root, 'persona')[0] || 'villain';
    const v = PERSONAS[key]?.voice || '';
    const el = $('[data-voice-note]');
    if (el) el.textContent = v.replace(/\n/g, ' ');
  }
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-pills="persona"]')) setTimeout(paintVoice, 0);
  });
  paintVoice();

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
    const byN = new Map(lines.map((x) => [String(x.n).trim(), x]));
    ko = blocks.map((_, i) => (byN.get(String(i + 1))?.ko || '').trim());
    // 영어는 원문으로 바로잡힌 것을 쓰되, 못 찾았으면 자동 자막 그대로 둡니다.
    en = blocks.map(
      (b, i) => (byN.get(String(i + 1))?.en || '').trim() || b.text.replace(/\n/g, ' ').trim()
    );

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
        <div class="sub-head"><span>시각</span><span>영어 (교정됨)</span><span>한국어</span></div>
        <div class="sub-list">
          ${blocks
            .map(
              (b, i) => `<div class="sub-row">
                <span class="sub-time">${fmt(b.start)}</span>
                <input type="text" data-en="${i}" value="${R.esc(en[i])}" placeholder="—">
                <input type="text" data-ko="${i}" value="${R.esc(ko[i])}" placeholder="—">
              </div>`
            )
            .join('')}
        </div>
        <p class="muted small" style="margin-top:10px"><b>트랙을 나눠 쓰시려면</b> 영어와 한국어를 따로 받아 캡컷에 각각 올리세요. 시각이 같아서 정확히 겹칩니다.</p>
        <div class="style-head" style="margin-top:8px">
          <button class="btn is-red" data-dl-en>영어 SRT</button>
          <button class="btn is-red" data-dl-ko>한국어 SRT</button>
          <button class="btn is-ghost" data-dl-both>두 줄 한 파일</button>
          <button class="btn is-ghost" data-copy>한국어 복사</button>
        </div>
        <p class="muted small">「두 줄 한 파일」은 한 트랙에 영어와 한국어가 같이 들어갑니다. 따로 꾸미거나 위치를 달리할 수 없습니다.</p>
        <details class="sub-tip">
          <summary>캡컷에서 두 트랙으로 겹치는 법</summary>
          <p>두 파일을 각각 자막 트랙으로 불러온 뒤 위치만 나눠 주세요. 시각이 같아 자동으로 맞습니다.</p>
          <table>
            <tr><th></th><th>화면 아래에서</th><th>크기</th></tr>
            <tr><td>영어</td><td>24%</td><td>100%</td></tr>
            <tr><td>한국어</td><td>18%</td><td>90%</td></tr>
          </table>
          <p>한국어를 조금 작게 하면 영어가 주가 되고 한국어가 보조로 읽힙니다.
          노래가 영어로 들리니 그 쪽이 자연스럽습니다.</p>
          <p>화면 아래 10%에는 아무것도 두지 마세요. 유튜브 진행 막대가 가립니다.</p>
        </details>
      </div>`;

    out.querySelectorAll('[data-ko]').forEach((el) => {
      el.addEventListener('input', () => {
        ko[+el.dataset.ko] = el.value;
      });
    });
    out.querySelectorAll('[data-en]').forEach((el) => {
      el.addEventListener('input', () => {
        en[+el.dataset.en] = el.value;
      });
    });

    out.querySelector('[data-dl-en]').addEventListener('click', () => download('en'));
    out.querySelector('[data-dl-ko]').addEventListener('click', () => download('ko'));
    out.querySelector('[data-dl-both]').addEventListener('click', () => download('both'));
    out.querySelector('[data-copy]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(build('ko'));
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
  function build(kind) {
    const pick = (i) =>
      kind === 'en'
        ? (en[i] || '').trim()
        : kind === 'ko'
          ? (ko[i] || '').trim()
          : [(en[i] || '').trim(), (ko[i] || '').trim()].filter(Boolean).join('\n');

    // 한국어가 빈 칸은 어느 버전에서도 내보내지 않습니다.
    // 추임새나 구간 태그 자리라, 영어만 혼자 떠 있으면 화면이 지저분해집니다.
    const subs = blocks
      .map((b, i) => ({ start: b.start, duration: b.duration, text: ko[i]?.trim() ? pick(i) : '' }))
      .filter((x) => x.text);
    return toSrt(subs);
  }

  function download(kind) {
    const text = build(kind);
    if (!text.trim()) return alert('내보낼 자막이 없습니다.');
    R.saveFile(`subtitle-${kind}-${new Date().toISOString().slice(0, 10)}.srt`, '\uFEFF' + text);
  }

  function fmt(t) {
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  }
}
