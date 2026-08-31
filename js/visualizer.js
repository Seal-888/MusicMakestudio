import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.mjs';

/* ────────────────────────────────
   FFT — 주파수 대역별 세기를 얻기 위해 필요합니다.
   진폭(파형)만으로는 막대가 전부 똑같이 움직여서
   "춤추는" 느낌이 나지 않습니다.
──────────────────────────────── */

/** 제자리 계산 방식의 radix-2 FFT. re와 im은 길이가 2의 거듭제곱이어야 합니다. */
function fft(re, im) {
  const n = re.length;

  // 비트 뒤집기로 순서를 바꿉니다.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

const FFT_SIZE = 2048;

/**
 * 음원을 프레임 단위로 분석해 막대 높이를 뽑아냅니다.
 * @returns { frames: Float32Array[], duration, fps, bands }
 */
/**
 * 음원을 프레임 단위로 분석해 막대 높이를 뽑아냅니다.
 *
 * 두 번에 나눠 봅니다.
 * 먼저 곡 전체의 세기를 재서 이 곡이 얼마나 큰지 기준을 잡고,
 * 그 기준에 맞춰 0~1로 바꿉니다. 곡마다 볼륨이 달라도 알아서 맞춰집니다.
 *
 * @returns { frames: Float32Array[], duration, fps, bands }
 */
export async function analyzeAudio(file, {
  fps = 30,
  bands = 48,
  headroomDb = 6,      // 가장 큰 순간을 천장에서 이만큼 띄웁니다
  rangeDb = 48,        // 이보다 조용한 소리는 바닥으로 봅니다
  gamma = 1.35,        // 클수록 조용한 부분이 더 낮게 깔립니다
  onProgress = null,
} = {}) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  const rate = decoded.sampleRate;
  const duration = decoded.duration;

  // 채널을 하나로 합칩니다.
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
  }

  const hann = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }

  // 사람 귀에 맞게 낮은 음역을 넓게, 높은 음역을 좁게 나눕니다.
  const minHz = 40;
  const maxHz = Math.min(16000, rate / 2);
  const edges = [];
  for (let b = 0; b <= bands; b++) {
    const hz = minHz * Math.pow(maxHz / minHz, b / bands);
    edges.push(Math.max(1, Math.round((hz / rate) * FFT_SIZE)));
  }

  // 고음역은 원래 에너지가 적어서 그대로 두면 거의 안 보입니다.
  const tilt = new Float32Array(bands);
  for (let b = 0; b < bands; b++) tilt[b] = (b / (bands - 1)) * 14; // 최대 +14dB

  const total = Math.max(1, Math.floor(duration * fps));
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  // ── 1단계: 데시벨 값을 그대로 모읍니다 ──
  const raw = [];
  const SCALE = 2 / FFT_SIZE; // 창 길이에 비례해 커지는 것을 되돌립니다

  for (let f = 0; f < total; f++) {
    const center = Math.floor((f / fps) * rate);
    const start = Math.max(0, center - FFT_SIZE / 2);

    for (let i = 0; i < FFT_SIZE; i++) {
      const s = start + i;
      re[i] = s < mono.length ? mono[s] * hann[i] : 0;
      im[i] = 0;
    }
    fft(re, im);

    const row = new Float32Array(bands);
    for (let b = 0; b < bands; b++) {
      const from = edges[b];
      const to = Math.max(from + 1, edges[b + 1]);

      // 대역 안에서는 평균을 씁니다. 최댓값만 보면 너무 튑니다.
      let sum = 0;
      let n = 0;
      for (let k = from; k < to && k < FFT_SIZE / 2; k++) {
        sum += Math.hypot(re[k], im[k]) * SCALE;
        n++;
      }
      const mag = n ? sum / n : 0;
      row[b] = 20 * Math.log10(mag + 1e-7) + tilt[b];
    }
    raw.push(row);

    if (onProgress && f % 30 === 0) onProgress((f / total) * 0.9);
  }

  // ── 2단계: 이 곡의 기준 세기를 찾습니다 ──
  // 가장 큰 값 하나에 맞추면 그 순간만 튀고 나머지가 눌립니다.
  // 상위 2% 지점을 기준으로 삼으면 곡 전체가 고르게 보입니다.
  const flat = [];
  for (const row of raw) for (const v of row) if (v > -120) flat.push(v);
  flat.sort((a, b) => a - b);
  const ceiling = (flat[Math.floor(flat.length * 0.98)] ?? -20) + headroomDb;
  const floor = ceiling - rangeDb;

  // ── 3단계: 0~1로 바꾸고 부드럽게 이어 줍니다 ──
  const frames = [];
  const smooth = new Float32Array(bands);

  for (let f = 0; f < total; f++) {
    const row = raw[f];
    const level = new Float32Array(bands);
    for (let b = 0; b < bands; b++) {
      let v = (row[b] - floor) / (ceiling - floor);
      v = Math.max(0, Math.min(1, v));
      v = Math.pow(v, gamma); // 조용한 부분을 낮춰 대비를 줍니다

      // 올라갈 때는 빠르게, 내려올 때는 천천히 — 그래야 춤추듯 보입니다.
      smooth[b] = v > smooth[b] ? v * 0.55 + smooth[b] * 0.45 : v * 0.16 + smooth[b] * 0.84;
      level[b] = smooth[b];
    }
    frames.push(level);
    if (onProgress && f % 60 === 0) onProgress(0.9 + (f / total) * 0.1);
  }

  ctx.close?.();
  return { frames, duration, fps, bands };
}

/* ────────────────────────────────
   그리기
──────────────────────────────── */

const SHAPES = {
  bars(ctx, level, w, h, style) {
    const n = level.length;
    const gap = Math.max(1, Math.round((w / n) * 0.25));
    const bw = w / n - gap;
    for (let i = 0; i < n; i++) {
      const bh = Math.max(2, level[i] * h * 0.8);
      ctx.fillStyle = paint(ctx, style, i / n, h);
      roundRect(ctx, i * (bw + gap) + gap / 2, h - bh, bw, bh, Math.min(bw / 2, 6));
    }
  },

  mirror(ctx, level, w, h, style) {
    const n = level.length;
    const gap = Math.max(1, Math.round((w / n) * 0.25));
    const bw = w / n - gap;
    const mid = h / 2;
    for (let i = 0; i < n; i++) {
      const bh = Math.max(2, level[i] * h * 0.45);
      ctx.fillStyle = paint(ctx, style, i / n, h);
      roundRect(ctx, i * (bw + gap) + gap / 2, mid - bh, bw, bh * 2, Math.min(bw / 2, 6));
    }
  },

  circle(ctx, level, w, h, style) {
    const n = level.length;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.22;
    const bw = Math.max(2, (2 * Math.PI * radius) / n - 3);

    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const bh = Math.max(3, level[i] * Math.min(w, h) * 0.22);
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = paint(ctx, style, i / n, h);
      roundRect(ctx, -bw / 2, radius, bw, bh, bw / 2);
      ctx.restore();
    }
    ctx.restore();
  },
};

function paint(ctx, style, t, h) {
  if (!style.color2) return style.color;
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, style.color);
  g.addColorStop(1, style.color2);
  return g;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, Math.max(h, 1), r);
  ctx.fill();
}

/** 미리보기 한 장을 그립니다. */
export function drawFrame(canvas, level, style) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'lighter';
  (SHAPES[style.shape] || SHAPES.bars)(ctx, level, canvas.width, canvas.height, style);
  ctx.globalCompositeOperation = 'source-over';
}

/* ────────────────────────────────
   MP4로 굽기
──────────────────────────────── */

export function canRender() {
  return typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';
}

/**
 * 분석 결과를 MP4 영상으로 만듭니다.
 * 소리는 넣지 않습니다. 캡컷에 이미 음악이 있으니 화면만 얹으면 됩니다.
 */
export async function renderVideo({ frames, fps, width, height, style, onProgress = null }) {
  if (!canRender()) {
    throw new Error(
      '이 브라우저에서는 영상을 만들 수 없습니다.\n최신 Chrome 또는 Edge로 열어 주세요.'
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const codecs = ['avc1.4d0028', 'avc1.42001f', 'avc1.640028'];
  let codec = null;
  for (const c of codecs) {
    const check = await VideoEncoder.isConfigSupported({ codec: c, width, height, framerate: fps });
    if (check.supported) {
      codec = c;
      break;
    }
  }
  if (!codec) throw new Error('이 크기로는 영상을 만들 수 없습니다. 다른 비율을 골라 주세요.');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });

  encoder.configure({
    codec,
    width,
    height,
    framerate: fps,
    bitrate: Math.round(width * height * fps * 0.08),
  });

  for (let i = 0; i < frames.length; i++) {
    drawFrame(canvas, frames[i], style);

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i / fps) * 1_000_000),
      duration: Math.round(1_000_000 / fps),
    });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    // 인코더가 밀리지 않게 잠깐씩 양보합니다.
    if (encoder.encodeQueueSize > 20) {
      await new Promise((r) => setTimeout(r, 0));
      while (encoder.encodeQueueSize > 10) await new Promise((r) => setTimeout(r, 4));
    }
    if (onProgress && i % 15 === 0) onProgress(i / frames.length);
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
