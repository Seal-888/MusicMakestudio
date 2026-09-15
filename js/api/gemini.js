import { settings } from '../store.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

class ApiError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.status = status;
    // 무엇이 잘못됐는지 한눈에 알 수 있는 짧은 이름입니다.
    this.code = code || (status ? `GEMINI-${status}` : 'GEMINI-ERR');
  }
}

/**
 * Gemini 3세대부터는 답을 내기 전 '생각'하는 토큰이 maxOutputTokens에서 함께 깎입니다.
 * 그래서 예산을 그대로 넣으면 본문이 잘립니다. 생각 강도별로 여유분을 더해 줍니다.
 */
const THINK_HEADROOM = { minimal: 512, low: 2048, medium: 8192, high: 16384 };

function isGemini3(model) {
  return /^gemini-3/.test(model);
}

function buildConfig({ model, schema, temperature, maxOutputTokens, thinkingLevel }) {
  const level = thinkingLevel || 'low';
  const config = {
    maxOutputTokens: maxOutputTokens + (THINK_HEADROOM[level] ?? 2048),
  };

  if (schema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = schema;
  }

  if (isGemini3(model)) {
    // 3.x는 thinkingLevel을 쓰고, temperature는 기본값을 쓰라는 게 구글 권고입니다.
    config.thinkingConfig = { thinkingLevel: level };
  } else {
    // 2.x는 생각을 끌 수 있고, temperature가 결과에 영향을 줍니다.
    config.temperature = temperature;
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

/**
 * 사용 가능한 모델 목록. generateContent를 지원하는 것만 골라서 돌려줍니다.
 * 구글이 모델을 예고 없이 내리는 일이 있어서, 목록을 직접 읽어옵니다.
 */
export async function listModels() {
  const key = settings.get('geminiKey');
  if (!key) throw new ApiError('Gemini 키가 없습니다.', 0);

  const res = await fetch(`${BASE}/models?key=${encodeURIComponent(key)}&pageSize=200`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body?.error?.message || `모델 목록을 못 받았습니다 (${res.status})`, res.status);
  }

  return (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => !n.includes('embedding') && !n.includes('aqa'))
    .sort();
}

async function requestOnce({ prompt, model, key, config, extraParts = [], retry = true }) {
  let res;
  try {
    res = await doFetch();
  } catch (err) {
    // 네트워크가 잠깐 끊긴 경우 한 번 더 시도합니다.
    if (!retry) throw new ApiError('연결하지 못했습니다. 인터넷 상태를 확인해 주세요.', 0, 'NET-FAIL');
    await new Promise((r) => setTimeout(r, 1500));
    res = await doFetch();
  }

  // 구글이 잠시 붐빌 때는 잠깐 쉬었다 한 번 더 부릅니다.
  if ((res.status === 503 || res.status === 429) && retry) {
    await new Promise((r) => setTimeout(r, 4000));
    res = await doFetch();
  }

  const body = await res.json().catch(() => ({}));
  return finish(res, body, model);

  function doFetch() {
    return fetch(
      `${BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [...extraParts, { text: prompt }] }],
          generationConfig: config,
        }),
      }
    );
  }
}

function finish(res, body, model) {
  if (!res.ok) {
    const msg = body?.error?.message || `요청이 실패했습니다 (${res.status})`;
    if (res.status === 404) {
      throw new ApiError(
        `${model} 모델을 쓸 수 없습니다. API 설정에서 "목록 불러오기"로 다른 모델을 골라 주세요.\n\n구글 응답: ${msg}`,
        404,
        'GEMINI-MODEL-GONE'
      );
    }
    if (res.status === 429) {
      throw new ApiError(
        `한도를 다 썼습니다. 1분 뒤 다시 시도하거나 결제 카드를 등록해 주세요.\n\n구글 응답: ${msg}`,
        429,
        'GEMINI-QUOTA'
      );
    }
    if (/youtube|video|fileUri|file_uri/i.test(msg)) {
      throw new ApiError(
        '유튜브 영상을 읽지 못했습니다.\n\n' +
          '이런 경우에 자주 생깁니다.\n' +
          '· 비공개, 미등록, 연령 제한이 걸린 영상\n' +
          '· 지역이 제한된 영상\n' +
          '· 아주 긴 영상 — 듣는 구간을 짧게 잡아 보세요\n' +
          '· 방금 올라온 영상 — 잠시 뒤 다시 시도해 보세요\n\n' +
          `구글 응답: ${msg}`,
        res.status,
        'GEMINI-YOUTUBE'
      );
    }
    if (res.status === 503 || res.status === 500) {
      throw new ApiError(
        '구글 쪽이 잠시 붐빕니다. 1~2분 뒤에 다시 시도해 주세요.\n\n' + `구글 응답: ${msg}`,
        res.status,
        'GEMINI-BUSY'
      );
    }
    if (res.status === 400 && /thinking|thought/i.test(msg)) {
      throw new ApiError(
        `이 모델은 지정한 생각 설정을 받지 않습니다. 다른 모델을 고르거나 생각 강도를 low로 바꿔 주세요.\n\n구글 응답: ${msg}`,
        400
      );
    }
    throw new ApiError(msg, res.status);
  }

  return body;
}

/**
 * Gemini 호출. schema를 주면 JSON 객체가, 없으면 문자열이 돌아옵니다.
 * 본문이 잘리면 예산을 두 배로 늘려 한 번 자동으로 다시 시도합니다.
 */
export async function callGemini({
  prompt,
  schema = null,
  temperature = 1,
  maxOutputTokens = 8000,
  model = null,
  thinkingLevel = 'low',
  extraParts = [],
  maxBudget = 120000,
}) {
  const key = settings.get('geminiKey');
  if (!key) throw new ApiError('Gemini 키를 먼저 저장해 주세요. (API 설정)', 0, 'NO-KEY');

  const useModel = model || settings.get('geminiModel');
  let budget = maxOutputTokens;

  for (let attempt = 0; attempt < 3; attempt++) {
    const config = buildConfig({
      model: useModel,
      schema,
      temperature,
      maxOutputTokens: budget,
      thinkingLevel,
    });

    const body = await requestOnce({ prompt, model: useModel, key, config, extraParts });
    const cand = body.candidates?.[0];

    if (!cand) {
      const blocked = body.promptFeedback?.blockReason;
      throw new ApiError(
        blocked
          ? `안전 필터에 걸렸습니다 (${blocked}). 표현을 바꿔서 다시 시도해 주세요.`
          : '응답이 비어 있습니다. 프롬프트를 줄여서 다시 시도해 주세요.',
        0,
        blocked ? 'GEMINI-BLOCKED' : 'GEMINI-EMPTY'
      );
    }

    if (cand.finishReason === 'SAFETY') {
      throw new ApiError('안전 필터에 걸렸습니다. 표현을 바꿔서 다시 시도해 주세요.', 0, 'GEMINI-SAFETY');
    }

    if (cand.finishReason === 'MAX_TOKENS') {
      if (budget < maxBudget) {
        budget = Math.min(Math.round(budget * 1.8), maxBudget);
        continue;
      }
      const thoughts = body.usageMetadata?.thoughtsTokenCount;
      throw new ApiError(
        `응답이 너무 길어서 잘렸습니다.` +
          (thoughts ? ` (생각에 ${thoughts.toLocaleString()}토큰 사용)` : '') +
          `\n\n한 번에 만드는 양을 줄여 보세요. 곡 수를 줄이거나, 곡 길이를 짧게 하면 됩니다.`,
        0,
        'GEMINI-TOO-LONG'
      );
    }

    const text = (cand.content?.parts || [])
      .filter((p) => !p.thought) // 생각 조각은 본문에서 제외
      .map((p) => p.text || '')
      .join('');

    if (!schema) return text;

    try {
      return JSON.parse(text);
    } catch {
      if (budget < maxBudget) {
        budget = Math.min(Math.round(budget * 1.8), maxBudget);
        continue;
      }
      throw new ApiError(
        'JSON 형식이 깨져서 돌아왔습니다.\n한 번에 만드는 양을 줄이면 안정적입니다.',
        0,
        'GEMINI-BAD-JSON'
      );
    }
  }

  throw new ApiError('응답을 받지 못했습니다.', 0);
}

/** 설정 화면의 '테스트' 버튼용. 실제로 모델을 한 번 호출해 봅니다. */
export async function testGemini() {
  const model = settings.get('geminiModel');
  const text = await callGemini({
    prompt: 'ping 이라고만 답하세요.',
    temperature: 0,
    maxOutputTokens: 512,
    thinkingLevel: 'low',
  });
  const reply = text.trim().slice(0, 40) || '(빈 응답)';
  return `연결 성공 · ${model} 응답: ${reply}`;
}


/**
 * 유튜브 영상을 Gemini에 통째로 넘깁니다. 화면과 소리를 함께 읽습니다.
 * 긴 영상을 전부 넣으면 토큰이 폭발하므로 구간을 잘라 보냅니다.
 */
export function youtubePart(url, { startSec = null, endSec = null } = {}) {
  const part = { fileData: { fileUri: url } };
  if (startSec !== null || endSec !== null) {
    part.videoMetadata = {};
    if (startSec !== null) part.videoMetadata.startOffset = `${Math.round(startSec)}s`;
    if (endSec !== null) part.videoMetadata.endOffset = `${Math.round(endSec)}s`;
  }
  return part;
}


/** 파일을 그대로 Gemini에 넣습니다. 20MB 안쪽에서만 씁니다. */
export async function filePart(file) {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return {
    inlineData: {
      mimeType: file.type || 'audio/mpeg',
      data: btoa(binary),
    },
  };
}

/* ────────────────────────────────
   이미지 생성 · 합성 (나노바나나)
──────────────────────────────── */



