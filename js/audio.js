/**
 * 오디오 파일의 길이를 재는 공용 엔진.
 * 타임스탬프 만들기와 캡컷 내보내기가 같은 계산을 씁니다.
 */

let ctx = null;
function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

/**
 * 파일 하나의 길이를 초 단위로 정확히 잽니다.
 * 디코딩해서 재기 때문에 MP3 헤더 값보다 정확하고, 캡컷 트랙과도 어긋나지 않습니다.
 */
export async function readDuration(file) {
  try {
    const buffer = await file.arrayBuffer();
    const decoded = await audioContext().decodeAudioData(buffer);
    return decoded.duration; // 디코딩 결과는 바로 버려서 메모리를 아낍니다
  } catch {
    // 디코딩이 안 되는 형식이면 브라우저의 메타데이터로 물러섭니다
    return readDurationFallback(file);
  }
}

function readDurationFallback(file) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('audio');
    const url = URL.createObjectURL(file);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(el.duration || 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} 의 길이를 읽을 수 없습니다.`));
    };
    el.src = url;
  });
}

/**
 * 파일 여러 개를 순서대로 재서 누적 시작 시각까지 계산합니다.
 * onProgress로 진행 상황을 화면에 보여 줄 수 있습니다.
 */
export async function measureTracks(files, onProgress = null) {
  const tracks = [];
  let cursor = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, file.name);
    const duration = await readDuration(file);
    tracks.push({
      file,
      name: file.name,
      title: cleanTitle(file.name),
      duration,
      start: cursor,
      end: cursor + duration,
    });
    cursor += duration;
  }

  return { tracks, total: cursor };
}

/** 파일명에서 제목만 남깁니다. 확장자, 앞번호, 흔한 접미사를 떼어 냅니다. */
export function cleanTitle(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/^\s*\d{1,3}[\s._\-)]+/, '')
    .replace(/[\s_]*\(?(final|master|mix|v\d+)\)?$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

/** 초 → 0:00 또는 1:02:03 */
export function toTimestamp(seconds, { forceHours = false } = {}) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h || forceHours ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** 초 → SRT 형식 00:00:00,000 */
export function toSrtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(
    Math.floor(ms / 1000) % 60
  )},${pad(ms % 1000, 3)}`;
}

/** 초 → 캡컷이 쓰는 마이크로초 */
export function toMicros(seconds) {
  return Math.round(seconds * 1000000);
}
