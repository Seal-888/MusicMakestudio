import { settings } from '../store.js';

const DIRECT = 'https://api.kie.ai/api/v1';
const RELAY = '/kie/api/v1'; // serve.py가 대신 불러 주는 통로

// 브라우저에서 kie.ai를 직접 못 부르는 경우(CORS)가 있어서,
// 한 번 막히면 그 다음부터는 로컬 서버를 거칩니다.
let useRelay = false;

// kie.ai는 callBackUrl을 필수로 받습니다.
// 우리는 폴링으로 직접 상태를 확인하기 때문에 콜백을 실제로 쓰지는 않지만,
// 값이 없으면 요청 자체를 거절하므로 채워서 보냅니다.
// 로컬 주소는 kie.ai 서버에서 닿을 수 없고, 닿지 못해도 작업은 정상 진행됩니다.
const CALLBACK = `${location.origin}/kie-callback`;
const CALLBACK_FALLBACK = 'https://example.com/callback'; // 문서용으로 예약된 주소

async function kie(path, { method = 'GET', body = null } = {}) {
  const key = settings.get('kieKey');
  if (!key) throw new Error('kie.ai 키를 먼저 저장해 주세요. (API 설정)');

  const send = (base) =>
    fetch(`${base}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  let res;
  if (useRelay) {
    res = await send(RELAY);
  } else {
    try {
      res = await send(DIRECT);
    } catch {
      // 네트워크 단계에서 막히면 CORS일 가능성이 높습니다. 통로를 바꿔 다시 시도합니다.
      useRelay = true;
      try {
        res = await send(RELAY);
      } catch {
        throw new Error(
          'kie.ai에 연결하지 못했습니다.\n\n' +
            'run.command로 띄운 서버가 아니라 파일을 직접 열었다면 이 기능이 동작하지 않습니다.\n' +
            'http://localhost 로 접속했는지 확인해 주세요.'
        );
      }
    }
  }

  if (res.status === 401) throw new Error('kie.ai 키가 올바르지 않습니다.');
  if (res.status === 402) throw new Error('크레딧이 부족합니다. kie.ai에서 충전해 주세요.');

  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.code) throw new Error(`요청이 실패했습니다 (${res.status})`);
  if (data.code && data.code !== 200) {
    throw new Error(data.msg || `kie.ai 오류 (코드 ${data.code})`);
  }
  return data.data ?? data;
}

export async function getCredit() {
  return kie('chat/credit');
}

/**
 * 노래 생성 요청. 바로 결과가 오지 않고 작업 번호만 돌아옵니다.
 * customMode에서는 prompt 칸에 가사가 들어갑니다.
 */
export async function generateSong({
  lyrics,
  style,
  title,
  model = null,
  instrumental = false,
  negativeTags = '',
  vocalGender = '',
}) {
  const body = {
    customMode: true,
    instrumental,
    model: model || settings.get('kieModel') || 'V5',
    prompt: instrumental ? '' : lyrics,
    style,
    title,
    callBackUrl: CALLBACK,
  };
  if (negativeTags) body.negativeTags = negativeTags;
  if (vocalGender) body.vocalGender = vocalGender;

  let data;
  try {
    data = await kie('generate', { method: 'POST', body });
  } catch (err) {
    // 로컬 주소를 거절하는 경우가 있어 한 번 더 시도합니다.
    if (!/callback/i.test(err.message)) throw err;
    body.callBackUrl = CALLBACK_FALLBACK;
    data = await kie('generate', { method: 'POST', body });
  }

  const taskId = data.taskId || data.task_id;
  if (!taskId) throw new Error('작업 번호를 받지 못했습니다.');
  return taskId;
}

export async function getTask(taskId) {
  return kie(`generate/record-info?taskId=${encodeURIComponent(taskId)}`);
}

const DONE = ['SUCCESS', 'complete', 'COMPLETE'];
const FAILED = [
  'CREATE_TASK_FAILED', 'GENERATE_AUDIO_FAILED', 'CALLBACK_EXCEPTION',
  'SENSITIVE_WORD_ERROR', 'FAILED', 'fail',
];

/**
 * 완성될 때까지 기다립니다. 보통 3~4분 걸리고 한 번에 2버전이 나옵니다.
 * onTick으로 경과 시간과 상태를 화면에 보여 줄 수 있습니다.
 */
export async function waitForSong(taskId, { onTick = null, timeoutMs = 10 * 60 * 1000 } = {}) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 6000));

    let task;
    try {
      task = await getTask(taskId);
    } catch (err) {
      onTick?.(elapsed(started), '연결이 잠깐 끊겼습니다. 다시 확인합니다');
      continue; // 일시적인 오류로 작업을 버리지 않습니다
    }

    const status = task.status || task.state || '';
    const tracks = task.response?.sunoData || task.sunoData || [];

    if (DONE.includes(status)) return normalize(tracks, taskId);
    if (FAILED.includes(status)) {
      throw new Error(
        task.errorMessage || task.failMsg || `노래 생성에 실패했습니다 (${status})`
      );
    }

    // 첫 번째 트랙만 먼저 나오는 단계에서도 미리 보여 줍니다.
    onTick?.(elapsed(started), statusText(status), normalize(tracks, taskId));
  }

  throw new Error('10분이 지나도 끝나지 않았습니다. kie.ai에서 직접 확인해 주세요.');
}

function elapsed(started) {
  return Math.round((Date.now() - started) / 1000);
}

function statusText(status) {
  const map = {
    PENDING: '순서를 기다리는 중',
    TEXT_SUCCESS: '가사 처리 완료 · 작곡 중',
    FIRST_SUCCESS: '첫 번째 버전 완성 · 두 번째 만드는 중',
  };
  return map[status] || '만드는 중';
}

function normalize(tracks, taskId = '') {
  return (tracks || [])
    .filter((t) => t.audioUrl || t.streamAudioUrl)
    .map((t) => ({
      id: t.id,
      taskId,
      title: t.title || '제목 없음',
      audioUrl: t.audioUrl || t.streamAudioUrl,
      imageUrl: t.imageUrl || '',
      duration: t.duration || 0,
      tags: t.tags || '',
    }));
}

/** 음원을 받아 옵니다. 직접 받다 막히면 로컬 서버를 거칩니다. */
export async function downloadTrack(url, filename) {
  let blob;
  try {
    blob = await (await fetch(url)).blob();
  } catch {
    blob = await (await fetch(`/grab?url=${encodeURIComponent(url)}`)).blob();
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function testKie() {
  const credit = await getCredit();
  const n = typeof credit === 'number' ? credit : credit?.credit ?? credit?.credits;
  return `연결 성공 · 남은 크레딧 ${n ?? '확인 불가'}${useRelay ? ' (로컬 서버 경유)' : ''}`;
}

/* ────────────────────────────────
   가사 타임코드 — Suno가 실제 발음 시각을 알려 줍니다.
   AI가 오디오를 듣고 추측하는 것보다 훨씬 정확합니다.
──────────────────────────────── */

export async function getTimestampedLyrics(taskId, audioId) {
  const data = await kie('generate/get-timestamped-lyrics', {
    method: 'POST',
    body: { taskId, audioId },
  });
  const words = data.alignedWords || [];
  if (!words.length) throw new Error('이 곡에는 타임코드가 없습니다. 연주곡이거나 아직 처리 중일 수 있습니다.');
  return words;
}

/**
 * 단어 목록을 읽기 좋은 자막 줄로 묶습니다.
 *
 * Suno는 구간 태그와 연출 지시문을 여러 단어에 걸쳐 쪼개서 줍니다.
 * 예) "[Intro" / "Bedroom" / "R&" / "B," / ... / "Vocals]"
 * 그래서 단어 하나만 보고 판단하면 안 되고, 괄호가 열리고 닫히는 것을
 * 글자 단위로 따라가면서 그 안쪽을 통째로 버려야 합니다.
 */
export function wordsToSubtitles(words, {
  maxChars = 32,   // 한 줄 최대 글자 수 — 화면에서 읽을 수 있는 정도
  gapSec = 1.0,    // 이만큼 쉬면 줄을 끊습니다
  minDur = 1.2,    // 너무 빨리 사라지지 않게
  maxDur = 7,      // 너무 오래 남지 않게
} = {}) {
  const clean = [];
  let depth = 0; // 대괄호·소괄호 안쪽인지

  for (const w of words || []) {
    // 부르지 않은 단어는 Suno가 success를 false로 표시해 줍니다.
    if (w.success === false) {
      depth = 0; // 태그를 지나쳤으므로 상태를 되돌립니다
      continue;
    }

    const raw = w.word ?? '';
    let text = '';
    let broke = false;

    for (const ch of raw) {
      if (ch === '[' || ch === '(' || ch === '（') {
        depth++;
        broke = true;
        continue;
      }
      if (ch === ']' || ch === ')' || ch === '）') {
        depth = Math.max(0, depth - 1);
        broke = true;
        continue;
      }
      if (ch === '\n') {
        broke = true;
        continue;
      }
      if (depth === 0) text += ch;
    }

    text = text.trim();
    if (!text) {
      if (broke && clean.length) clean[clean.length - 1].breakAfter = true;
      continue;
    }

    const start = Number(w.startS) || 0;
    let end = Number(w.endS);
    if (!(end > start) || end - start > 4) end = start + 0.35;

    clean.push({ text, start, end, breakBefore: broke });
  }

  if (!clean.length) return [];

  // 끝 시각이 없는 단어는 다음 단어가 시작하기 직전까지로 봅니다.
  for (let i = 0; i < clean.length - 1; i++) {
    const next = clean[i + 1].start;
    if (clean[i].end > next) clean[i].end = Math.max(clean[i].start + 0.15, next);
  }

  const lines = [];
  let cur = null;

  const flush = () => {
    if (!cur) return;
    const text = cur.text.replace(/\s+/g, ' ').trim();
    if (text) lines.push({ text, start: cur.start, end: cur.end });
    cur = null;
  };

  for (const w of clean) {
    if (cur) {
      const tooLong = (cur.text + ' ' + w.text).trim().length > maxChars;
      const bigGap = w.start - cur.end > gapSec;
      if (w.breakBefore || tooLong || bigGap) flush();
    }
    if (!cur) cur = { text: w.text, start: w.start, end: w.end };
    else {
      cur.text += ' ' + w.text;
      cur.end = w.end;
    }
  }
  flush();

  // 읽을 시간을 확보하고, 앞 줄이 뒤 줄을 덮지 않게 합니다.
  return lines.map((l, i) => {
    const next = lines[i + 1];
    let end = Math.max(l.end, l.start + minDur);
    end = Math.min(end, l.start + maxDur);
    if (next) end = Math.min(end, next.start - 0.05);
    return { text: l.text, start: l.start, duration: Math.max(0.4, end - l.start) };
  });
}
