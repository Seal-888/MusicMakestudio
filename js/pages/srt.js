import { callGemini, filePart } from '../api/gemini.js';
import { transcribeLyrics, translateLines, alignLyrics } from '../prompts.js';
import { lyricsToLines, tidyTiming } from '../lyrics.js';
import { parseSrt, toSrt } from '../capcut.js';
import { readDuration, toTimestamp } from '../audio.js';
import { getTask, getTimestampedLyrics, wordsToSubtitles } from '../api/kie.js';
import { jobs } from '../store.js';
import * as R from '../render.js';

const TARGETS = [
  ['한국어', '한국어', '한국 정서에 맞게 자연스럽게 의역합니다. 직역투를 피하세요.'],
  ['English', '영어', '노래로 부를 수 있게 리듬감 있는 영어로 옮깁니다.'],
  ['日本語', '일본어', '일본 가요 가사처럼 자연스럽게 옮깁니다.'],
  ['中文', '중국어(간체)', '중국어 가사처럼 자연스럽게 옮깁니다.'],
  ['Español', '스페인어', '스페인어 가사처럼 자연스럽게 옮깁니다.'],
];

/**
 * AI가 준 타임코드를 곡 길이에 맞게 정리합니다.
 * 곡이 끝난 뒤의 자막, 뒤집힌 시각, 지나치게 긴 줄, 겹침을 잡아냅니다.
 * 무엇을 고쳤는지 사용자에게 알려 주기 위해 문제 목록도 함께 돌려줍니다.
 */
function sanitizeCues(lines, duration, { maxDur = 10 } = {}) {
  const issues = [];
  let dropped = 0;
  let trimmed = 0;
  let flipped = 0;

  let cues = [];
  for (const l of lines || []) {
    const text = (l.text || '').trim();
    if (!text) continue;

    // 괄호로만 된 연출 지시는 가사가 아닙니다.
    if (/^[（(\[].*[）)\]]$/.test(text)) {
      dropped++;
      continue;
    }

    let start = Number(l.start);
    let end = Number(l.end);
    if (!Number.isFinite(start)) continue;

    // 곡이 끝난 뒤라면 버립니다.
    if (start >= duration) {
      dropped++;
      continue;
    }

    if (!Number.isFinite(end) || end <= start) {
      end = start + 3;
      flipped++;
    }
    if (end - start > maxDur) {
      end = start + maxDur;
      trimmed++;
    }
    if (end > duration) end = duration;
    if (end <= start) continue;

    cues.push({ text, start: Math.max(0, start), end });
  }

  cues.sort((a, b) => a.start - b.start);

  // 앞 줄이 뒤 줄을 덮지 않게 합니다.
  let overlapped = 0;
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) {
      cues[i].end = Math.max(cues[i].start + 0.4, cues[i + 1].start - 0.05);
      overlapped++;
    }
  }

  if (dropped) issues.push(`곡 길이를 벗어나거나 가사가 아닌 줄 ${dropped}개를 뺐습니다.`);
  if (flipped) issues.push(`끝 시각이 시작보다 빠른 줄 ${flipped}개를 바로잡았습니다.`);
  if (trimmed) issues.push(`${maxDur}초를 넘는 줄 ${trimmed}개를 줄였습니다.`);
  if (overlapped) issues.push(`앞뒤가 겹치는 줄 ${overlapped}개를 떼어 놓았습니다.`);

  return {
    cues: cues.map((c) => ({ text: c.text, start: c.start, duration: c.end - c.start })),
    issues,
  };
}

export default function renderSrt(root) {
  let cues = [];
  let sourceName = '자막';

  root.innerHTML =
    R.header('translate & srt', '번역', '+ SRT', '자막을 다른 언어로 옮기거나, 음원에서 가사를 뽑아 자막으로 만듭니다.') +
    `<div class="card">
      <span class="card-tag is-blue">1 · 원본 가져오기</span>
      <div class="modes">
        <label class="mode"><input type="radio" name="src" value="srt" checked>
          <span><strong>SRT 파일 올리기</strong><br>
          <span class="muted small">타임코드를 그대로 두고 글자만 옮깁니다. 가장 정확합니다.</span></span></label>
        <label class="mode"><input type="radio" name="src" value="kie">
          <span><strong>Suno로 만든 곡의 자막 받기</strong><br>
          <span class="muted small">Suno가 알려 준 실제 발음 시각을 씁니다. 가장 정확합니다.</span></span></label>
        <label class="mode"><input type="radio" name="src" value="paste">
          <span><strong>음원 + 가사 붙여넣기</strong><br>
          <span class="muted small">가사를 알고 있을 때. 받아쓰기가 아니라 시각만 찾으므로 훨씬 정확합니다.</span></span></label>
        <label class="mode"><input type="radio" name="src" value="audio">
          <span><strong>음원에서 가사 뽑기</strong><br>
          <span class="muted small">가사를 모를 때만. 정확도가 가장 낮습니다.</span></span></label>
      </div>

      <div data-mode-paste hidden>
        <label class="field">
          <span>가사 붙여넣기 <small>Suno에서 쓴 가사를 그대로 붙여넣으세요</small></span>
          <textarea rows="10" data-p="lyrics" spellcheck="false"
            placeholder="[Verse 1 - ...]&#10;가사 첫 줄&#10;가사 둘째 줄&#10;&#10;[Chorus]&#10;후렴..."></textarea>
        </label>
        <p class="muted small">[구간 표시]와 (연출 지시)는 알아서 걸러냅니다.
        긴 줄은 화면에서 읽기 좋게 나눕니다.</p>
      </div>

      <div data-mode-kie hidden>
        ${
          jobs.all().length
            ? `<label class="field">
                <span>최근에 만든 곡 <small>이 브라우저에서 만든 곡들입니다</small></span>
                <select data-k="job">
                  <option value="">— 작업 번호 직접 입력 —</option>
                  ${jobs
                    .all()
                    .map(
                      (j) =>
                        `<option value="${R.esc(j.taskId)}">${R.esc(j.title)} · ${new Date(j.savedAt).toLocaleDateString('ko-KR')}</option>`
                    )
                    .join('')}
                </select>
              </label>`
            : `<p class="muted small">아직 만든 곡이 없습니다. 작업 번호를 알고 있다면 직접 넣어 주세요.</p>`
        }
        <label class="field">
          <span>작업 번호 (taskId) <small>kie.ai 대시보드에서도 확인할 수 있습니다</small></span>
          <input type="text" data-k="taskId" placeholder="5c79...be8e">
        </label>
        <button class="btn is-blue" data-k="load">곡 목록 불러오기</button>
        <div data-k="tracks"></div>
      </div>

      <div class="dropzone" data-drop>
        <div class="dz-icon" data-icon>📄</div>
        <p><strong data-dztext>SRT 파일을 끌어다 놓거나 눌러서 고르세요</strong></p>
        <p class="muted small" data-dzsub>.srt</p>
        <input type="file" accept=".srt,text/plain" hidden data-file>
      </div>

      <div data-load></div>
    </div>

    <div class="card" data-step2 hidden>
      <span class="card-tag is-red">2 · 번역</span>
      <div class="field">
        <p class="field-label">옮길 언어 <small>번역하지 않고 그대로 받으려면 아래 "원본 그대로 받기"를 쓰세요</small></p>
        ${R.pillGroup('target', TARGETS.map(([v, label]) => ({ label, value: v })), {
          multi: false,
          selected: ['한국어'],
        })}
      </div>
      <div class="style-head">
        <button class="btn is-red" data-go>번역해서 SRT 받기</button>
        <button class="btn is-ghost" data-raw>원본 그대로 받기</button>
      </div>
      <div data-out></div>
    </div>`;

  R.wireCopy(root);
  R.wirePills(root);

  const zone = root.querySelector('[data-drop]');
  const input = root.querySelector('[data-file]');
  const load = root.querySelector('[data-load]');
  const step2 = root.querySelector('[data-step2]');
  const out = root.querySelector('[data-out]');

  const mode = () => root.querySelector('input[name=src]:checked').value;

  root.querySelectorAll('input[name=src]').forEach((r) =>
    r.addEventListener('change', () => {
      const m = mode();
      root.querySelector('[data-mode-kie]').hidden = m !== 'kie';
      root.querySelector('[data-mode-paste]').hidden = m !== 'paste';
      zone.hidden = m === 'kie';
      const audio = m === 'audio' || m === 'paste';
      input.accept = audio ? 'audio/*' : '.srt,text/plain';
      root.querySelector('[data-icon]').textContent = audio ? '♪' : '📄';
      root.querySelector('[data-dztext]').textContent = audio
        ? '음악 파일을 끌어다 놓거나 눌러서 고르세요'
        : 'SRT 파일을 끌어다 놓거나 눌러서 고르세요';
      root.querySelector('[data-dzsub]').textContent = audio ? 'mp3 · wav · m4a · 20MB 이하' : '.srt';
      cues = [];
      load.innerHTML = '';
      step2.hidden = true;
    })
  );

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    handle(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    handle(f);
  });

  /* ── Suno 작업 번호로 자막 받기 ── */
  const kieBox = root.querySelector('[data-mode-kie]');
  const kk = (n) => kieBox.querySelector(`[data-k=${n}]`);

  kk('job')?.addEventListener('change', () => {
    kk('taskId').value = kk('job').value;
    if (kk('job').value) loadTracks();
  });

  kk('load').addEventListener('click', loadTracks);

  async function loadTracks() {
    const taskId = kk('taskId').value.trim();
    if (!taskId) return alert('작업 번호를 넣어 주세요.');

    const box = kk('tracks');
    box.className = 'task-state';
    box.innerHTML = `<div class="spinner"></div><p>곡 목록을 가져오는 중…</p>`;

    try {
      const task = await getTask(taskId);
      const list = task.response?.sunoData || task.sunoData || [];
      if (!list.length) throw new Error('이 작업 번호에서 곡을 찾지 못했습니다.');

      box.className = '';
      box.innerHTML = `<section class="rb">
        <h3>곡 ${list.length}개</h3>
        <ul class="rowlist">
          ${list
            .map(
              (t, i) => `<li class="row">
                <span class="row-no">${i + 1}</span>
                <span class="row-name">${R.esc(t.title || '제목 없음')}
                  <br><span class="muted small">${Math.floor((t.duration || 0) / 60)}:${String(Math.round((t.duration || 0) % 60)).padStart(2, '0')}</span></span>
                <button class="btn sm is-blue" data-pick-track="${R.esc(t.id)}">자막 가져오기</button>
              </li>`
            )
            .join('')}
        </ul>
      </section>`;

      box.querySelectorAll('[data-pick-track]').forEach((b) =>
        b.addEventListener('click', async () => {
          const audioId = b.dataset.pickTrack;
          const track = list.find((t) => t.id === audioId);
          b.disabled = true;
          b.textContent = '가져오는 중…';
          try {
            const words = await getTimestampedLyrics(taskId, audioId);
            const lines = wordsToSubtitles(words);
            if (!lines.length) throw new Error('자막으로 만들 가사가 없습니다.');
            cues = lines;
            sourceName = track?.title || '자막';
            load.className = '';
            load.innerHTML = `<section class="rb">
              <h3>${R.esc(sourceName)} · ${lines.length}줄</h3>
              <p class="muted small">Suno가 알려 준 실제 발음 시각입니다.</p>
              <div class="cuelist">
                ${lines
                  .slice(0, 60)
                  .map(
                    (c) => `<div class="cue"><span class="row-time">${toTimestamp(c.start)}</span><span>${R.esc(c.text)}</span></div>`
                  )
                  .join('')}
              </div>
            </section>`;
            step2.hidden = false;
            load.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } catch (err) {
            alert(err.message);
          }
          b.disabled = false;
          b.textContent = '자막 가져오기';
        })
      );
    } catch (err) {
      box.className = 'task-state fail';
      box.innerHTML = `<p><strong>실패했습니다.</strong></p><p>${R.esc(err.message)}</p>`;
    }
  }

  async function handle(file) {
    if (!file) return;
    sourceName = file.name.replace(/\.[^.]+$/, '');

    const currentMode = mode();

    if (currentMode === 'srt') {
      try {
        const parsed = parseSrt(await file.text());
        if (!parsed.length) throw new Error('자막을 읽지 못했습니다.');
        cues = parsed;
        showCues();
      } catch (err) {
        load.className = 'task-state fail';
        load.innerHTML = `<p><strong>실패했습니다.</strong></p><p>${R.esc(err.message)}</p>`;
      }
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      alert('20MB가 넘는 파일은 넣을 수 없습니다. 더 짧은 음원을 써 주세요.');
      return;
    }

    // 붙여넣은 가사가 있으면 그것을 기준으로 시각만 찾습니다.
    const pasted = currentMode === 'paste' ? root.querySelector('[data-p=lyrics]').value.trim() : '';
    if (currentMode === 'paste' && !pasted) {
      alert('가사를 먼저 붙여넣어 주세요.');
      return;
    }

    load.className = 'task-state';
    load.innerHTML = `<div class="spinner"></div><p>음원을 듣는 중… 1~2분 걸립니다.</p>`;
    try {
      const duration = await readDuration(file);
      const part = await filePart(file);

      let rawLines;
      let issues = [];

      if (pasted) {
        const known = lyricsToLines(pasted);
        if (!known.length) throw new Error('가사에서 읽을 수 있는 줄을 찾지 못했습니다.');

        const res = await callGemini({
          ...alignLyrics({ lines: known, durationSec: duration }),
          extraParts: [part],
        });
        const got = res.lines || [];

        // 모델이 줄을 빠뜨려도 내가 넣은 가사가 기준입니다.
        rawLines = known.map((text, i) => ({
          text,
          start: got[i]?.start,
          end: got[i]?.end,
        }));
        const missing = rawLines.filter((l) => !Number.isFinite(l.start)).length;
        if (missing) issues.push(`시각을 못 찾은 줄 ${missing}개를 뺐습니다.`);
      } else {
        const res = await callGemini({
          ...transcribeLyrics({ durationSec: duration, language: '' }),
          extraParts: [part],
        });
        rawLines = res.lines || [];
      }

      const checked = sanitizeCues(rawLines, duration);
      cues = tidyTiming(
        checked.cues.map((c) => ({ text: c.text, start: c.start, end: c.start + c.duration })),
        duration
      );
      if (!cues.length) throw new Error('가사를 찾지 못했습니다. 연주곡이거나 목소리가 묻혀 있을 수 있습니다.');
      load.className = '';
      showCues(true, [...issues, ...checked.issues], duration, !!pasted);
    } catch (err) {
      load.className = 'task-state fail';
      load.innerHTML = `<p><strong>실패했습니다.</strong></p><p>${R.esc(err.message)}</p>`;
    }
  }

  function showCues(fromAudio = false, issues = [], duration = 0, aligned = false) {
    load.className = '';
    load.innerHTML = `<section class="rb">
      <h3>${cues.length}줄 · ${toTimestamp(cues[cues.length - 1].start + cues[cues.length - 1].duration)}까지</h3>
      ${
        fromAudio
          ? `<div class="note" style="margin-bottom:12px">
              <strong>${aligned ? '가사는 붙여넣은 그대로입니다' : '타임코드를 한 번 확인해 주세요'}</strong>
              ${
                aligned
                  ? '글자는 고치지 않았고 시각만 찾았습니다. 그래도 몇 초 어긋날 수 있으니 한 번 들어 보세요.'
                  : 'AI가 듣고 받아 적은 것이라 글자와 시각 모두 어긋날 수 있습니다. 가사를 알고 있다면 "음원 + 가사 붙여넣기"가 훨씬 정확합니다.'
              }
              ${duration ? `곡 길이 ${toTimestamp(duration)} 안으로 맞춰 두었습니다.` : ''}
              ${issues.length ? `<ul>${issues.map((x) => `<li>${R.esc(x)}</li>`).join('')}</ul>` : ''}
            </div>`
          : ''
      }
      <div class="cuelist">
        ${cues
          .slice(0, 60)
          .map(
            (c) => `<div class="cue">
              <span class="row-time">${toTimestamp(c.start)}</span>
              <span>${R.esc(c.text)}</span>
            </div>`
          )
          .join('')}
        ${cues.length > 60 ? `<p class="muted small">…외 ${cues.length - 60}줄</p>` : ''}
      </div>
    </section>`;
    step2.hidden = false;
  }

  root.querySelector('[data-raw]').addEventListener('click', () => download(cues, sourceName));

  root.querySelector('[data-go]').addEventListener('click', () => {
    if (!cues.length) return alert('먼저 파일을 올려 주세요.');
    const target = R.readPills(root, 'target')[0] || '한국어';
    const meta = TARGETS.find((t) => t[0] === target);

    R.runTask({
      button: root.querySelector('[data-go]'),
      output: out,
      working: `${meta[1]}로 옮기는 중`,
      task: async () => {
        // 한 번에 다 보내면 잘리기 쉬워서 나눠 보냅니다.
        const CHUNK = 40;
        const result = [];
        for (let i = 0; i < cues.length; i += CHUNK) {
          const slice = cues.slice(i, i + CHUNK).map((c) => c.text);
          const { lines } = await callGemini(
            translateLines({ lines: slice, target: meta[1], tone: meta[2] })
          );
          const got = lines || [];
          for (let j = 0; j < slice.length; j++) result.push(got[j] ?? slice[j]);
        }
        return result;
      },
      onDone: (translated) => {
        const merged = cues.map((c, i) => ({ ...c, text: translated[i] || c.text }));
        out.innerHTML = `<section class="rb">
          <h3>${meta[1]} 자막</h3>
          <div class="style-head">
            <button class="btn sm is-gold" data-dl>SRT 받기</button>
            ${R.copyBtn(merged.map((m) => m.text).join('\n'), '가사만 복사')}
          </div>
          <div class="cuelist">
            ${merged
              .slice(0, 60)
              .map(
                (c, i) => `<div class="cue">
                  <span class="row-time">${toTimestamp(c.start)}</span>
                  <span><b>${R.esc(c.text)}</b><br><span class="muted small">${R.esc(cues[i].text)}</span></span>
                </div>`
              )
              .join('')}
          </div>
        </section>`;
        out.querySelector('[data-dl]').addEventListener('click', () =>
          download(merged, `${sourceName}_${meta[1]}`)
        );
      },
    });
  });

  function download(list, name) {
    if (!list.length) return alert('받을 자막이 없습니다.');
    const blob = new Blob(['\uFEFF' + toSrt(list)], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[/\\:*?"<>|]/g, '')}.srt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
