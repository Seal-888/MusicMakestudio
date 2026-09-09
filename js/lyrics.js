import { toSrtTime } from './audio.js';

/**
 * 붙여넣은 가사를 자막으로 쓸 수 있게 다듬습니다.
 * 구간 태그와 연출 지시문을 걷어내고, 화면에서 읽기 좋은 길이로 나눕니다.
 */

/** [Verse - ...] 같은 구간 표시와 ( 연출 지시 )를 걷어냅니다. */
export function stripDirections(text) {
  return (text || '')
    .split('\n')
    .map((line) => {
      let out = '';
      let depth = 0;
      for (const ch of line) {
        if (ch === '[' || ch === '(' || ch === '（') depth++;
        else if (ch === ']' || ch === ')' || ch === '）') depth = Math.max(0, depth - 1);
        else if (depth === 0) out += ch;
      }
      return out.replace(/\s+/g, ' ').trim();
    })
    .filter((line) => line && !/^[-–—·.]+$/.test(line));
}

/**
 * 긴 줄을 화면에서 읽을 수 있는 길이로 나눕니다.
 * 말이 끊기지 않게 띄어쓰기 자리에서 자릅니다.
 */
export function splitForReading(line, maxChars = 32) {
  if (line.length <= maxChars) return [line];

  const words = line.split(' ');
  const out = [];
  let cur = '';

  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);

  // 마지막 조각이 너무 짧으면 앞줄에 붙입니다.
  if (out.length > 1 && out[out.length - 1].length < 6) {
    out[out.length - 2] += ' ' + out.pop();
  }
  return out;
}

/** 가사 전문을 자막용 줄 목록으로 바꿉니다. */
export function lyricsToLines(text, maxChars = 32) {
  const lines = [];
  for (const raw of stripDirections(text)) {
    for (const piece of splitForReading(raw, maxChars)) lines.push(piece);
  }
  return lines;
}

/**
 * 시간이 정해진 줄들을 읽기 좋게 다듬습니다.
 * 너무 짧게 스치거나 너무 오래 남지 않게 하고, 겹침을 없앱니다.
 */
export function tidyTiming(cues, duration, { minDur = 1.2, maxDur = 7 } = {}) {
  const out = cues
    .filter((c) => c.text && Number.isFinite(c.start) && c.start < duration)
    .sort((a, b) => a.start - b.start);

  return out.map((c, i) => {
    const next = out[i + 1];
    let end = Number.isFinite(c.end) && c.end > c.start ? c.end : c.start + minDur;
    end = Math.max(end, c.start + minDur);
    end = Math.min(end, c.start + maxDur, duration);
    if (next) end = Math.min(end, next.start - 0.05);
    return { text: c.text, start: c.start, duration: Math.max(0.4, end - c.start) };
  });
}

/**
 * 모델이 돌려준 가사를 사람이 읽고 Suno가 이해할 수 있게 다듬습니다.
 *
 * JSON으로 주고받다 보면 줄바꿈이 글자 그대로("\" + "n")로 남는 일이 있습니다.
 * Suno는 그걸 줄바꿈으로 읽지 않으므로 진짜 줄바꿈으로 되돌립니다.
 */
export function tidyLyrics(text) {
  if (!text) return '';

  let out = String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\\r\\n|\\n|\\r/g, '\n')   // 글자로 남은 줄바꿈 표기
    .replace(/\\t/g, ' ')
    .replace(/[ \t]+$/gm, '');          // 줄 끝 공백

  // 구간 표시 앞은 한 줄 비워서 덩어리가 눈에 들어오게 합니다.
  out = out.replace(/\n*(?=^\[)/gm, '\n\n');

  // 빈 줄이 세 줄 넘게 이어지면 하나로 줄입니다.
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  return out;
}

/** 스타일 프롬프트는 한 줄이어야 합니다. 줄바꿈이 섞이면 걷어냅니다. */
export function tidyStyle(text) {
  return String(text || '')
    .replace(/\\n|\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 부탁만으로는 잘 안 지켜져서, 받은 가사를 직접 검사합니다. */
const CLICHE_EN = [
  'velvet', 'echo', 'amber', 'lazy', 'midnight', 'fade', 'neon', 'shadow',
  'whisper', 'bloom', 'drift', 'glow', 'ember', 'twilight', 'ocean',
  'hollow', 'silk', 'dream', 'paper', 'golden',
];
const CLICHE_KO = [
  '그림자', '속삭', '메아리', '벨벳', '실루엣', '황금빛', '어스름',
  '자정', '네온', '아련', '몽롱', '스며들', '피어나', '흩어지',
];

/**
 * 소괄호 안이 부를 수 있는 말인지, 부를 수 없는 설명문인지 가려냅니다.
 *
 * Suno는 소괄호를 "부르라"는 뜻으로 읽습니다.
 * 코러스 따라 부르기나 추임새는 소괄호가 맞고, 장면 설명은 대괄호로 가야 합니다.
 *
 * 길이나 쉼표로는 구분되지 않습니다.
 * (rise up, rise up)은 쉼표가 있어도 부르는 말이고,
 * (조명이 꺼진 거리)는 짧아도 부르는 말이 아닙니다.
 * 그래서 "무엇을 설명하고 있는가"를 봅니다.
 */

/** 연주·음향을 가리키는 말. 이런 게 들어 있으면 부르는 말이 아닙니다. */
const SOUND_WORDS = [
  '피아노', '기타', '드럼', '베이스', '신스', '스트링', '현악', '색소폰', '트럼펫',
  '비트', '리듬', '멜로디', '사운드', '소리', '음악', '연주', '반주', '전주', '간주',
  '분위기', '느낌', '장면', '효과음', '페이드', '리버브',
  'piano', 'guitar', 'drum', 'bass', 'synth', 'string', 'beat', 'melody',
  'ambient', 'reverb', 'fade', 'intro', 'outro', 'instrumental', 'sfx',
];

/** 서술형 어미. 노래로 부르지 않는 문장체입니다. */
const NARRATIVE_END = /(다|된다|한다|진다|린다|온다|간다|짐|함|됨|음)[.…)]?\s*$/;

function isSingable(inner) {
  const t = inner.trim();
  if (!t) return false;

  // 아주 길면 한 호흡에 못 부릅니다.
  if (t.length > 40) return false;

  // 악기나 음향을 설명하고 있으면 부르는 말이 아닙니다.
  const lower = t.toLowerCase();
  if (SOUND_WORDS.some((w) => lower.includes(w))) return false;

  // 한국어 서술형으로 끝나면 지시문입니다.
  if (NARRATIVE_END.test(t)) return false;

  // 한 문장 안에 어절이 너무 많으면 설명에 가깝습니다.
  if (t.split(/\s+/).length > 7) return false;

  return true;
}

/**
 * 가사에서 규칙을 어긴 곳을 찾아 알려 줍니다.
 * 고치지는 않습니다. 무엇이 문제인지 보여 주고 판단은 사람이 합니다.
 */
export function checkLyrics(text) {
  const issues = [];
  const lower = (text || '').toLowerCase();

  const foundEn = CLICHE_EN.filter((w) => new RegExp(`\\b${w}`, 'i').test(lower));
  const foundKo = CLICHE_KO.filter((w) => text.includes(w));
  if (foundEn.length || foundKo.length) {
    issues.push({
      kind: 'cliche',
      label: '흔한 단어',
      detail: [...foundEn, ...foundKo].join(', '),
    });
  }

  const spoken = [];
  for (const m of (text || '').matchAll(/\(([^)]*)\)/g)) {
    if (!isSingable(m[1])) spoken.push(m[1].trim().slice(0, 24));
  }
  if (spoken.length) {
    issues.push({
      kind: 'paren',
      label: '불려 버릴 설명문',
      detail: spoken.slice(0, 3).join(' · '),
    });
  }

  const tells = ['슬퍼', '슬프', '아파', '아프', '그리워', '외로워', '행복해', '기뻐'];
  const found = tells.filter((w) => text.includes(w));
  if (found.length >= 3) {
    issues.push({ kind: 'tell', label: '감정을 직접 말한 곳', detail: found.join(', ') });
  }

  return issues;
}

/** 제목이 규칙에 맞는지 봅니다. */
export function checkTitle(title) {
  const t = (title || '').trim();
  if (t.length > 20) return `제목이 ${t.length}자입니다. 20자 안쪽을 권합니다.`;
  return null;
}

/**
 * 가사 분량으로 곡 길이를 어림합니다.
 *
 * 실제로 짧게 나온 곡에 맞춰 보수적으로 잡았습니다.
 * 넉넉하게 어림하면 가사가 모자라도 괜찮아 보여서, 결국 짧은 곡이 나옵니다.
 * 조금 짧게 어림하는 편이 가사를 더 쓰게 만들어 목표에 가까워집니다.
 */
export function estimateDuration(text) {
  const lines = stripDirections(text);
  if (!lines.length) return null;

  const words = lines.join(' ').split(/\s+/).filter(Boolean).length;
  const hangul = (text.match(/[가-힣]/g) || []).length;

  // 한국어는 글자 하나가 한 음절, 영어는 단어당 약 1.3음절입니다.
  const syllables = hangul > words ? hangul : Math.round(words * 1.3);

  const seconds = Math.round((syllables / 115) * 60) + 12; // 전주·간주 몫
  return { lines: lines.length, syllables, seconds };
}

/**
 * 스타일 프롬프트가 내가 정한 장르·보컬을 지켰는지 봅니다.
 * 가사 내용에 끌려가서 다른 장르로 새는 일이 있어서 확인이 필요합니다.
 */
export function checkStyle(style, { genres = [], vocal = '', tempo = '', needOpening = true } = {}) {
  const issues = [];
  const text = (style || '').toLowerCase();
  if (!text) return [{ label: '스타일 없음', detail: '이 곡에 스타일 프롬프트가 없습니다' }];

  // 장르는 여러 개 중 하나라도 들어 있으면 통과로 봅니다.
  const genreWords = genres
    .flatMap((g) => g.split(/[,/]/))
    .map((g) => g.trim().toLowerCase())
    .filter((g) => g.length > 2);
  if (genreWords.length && !genreWords.some((g) => text.includes(g))) {
    issues.push({ label: '장르가 빠짐', detail: genreWords.slice(0, 3).join(', ') });
  }

  // 보컬은 성별 단어가 핵심입니다.
  const gender = /female|male|instrumental/.exec(vocal.toLowerCase())?.[0];
  if (gender && !text.includes(gender)) {
    issues.push({ label: '보컬 성별이 빠짐', detail: gender });
  }

  if (!/\d{2,3}\s*bpm/i.test(style)) {
    issues.push({ label: 'BPM이 빠짐', detail: tempo || '숫자를 넣어야 합니다' });
  }

  if (style.length < 400) {
    issues.push({ label: '스타일이 짧음', detail: `${style.length}자 · 800자 안팎을 권합니다` });
  }
  // 스타일에 인트로를 넣는 방식일 때만 확인합니다.
  // 태그로만 지정하는 방식이면 스타일이 깨끗한 것이 정상입니다.
  if (needOpening && !/track (opens|begins|starts)/i.test(style)) {
    issues.push({
      label: '시작 방식이 없음',
      detail: '"The track opens with..." 문장이 없으면 인트로가 다른 곡과 비슷해집니다',
    });
  }
  if (style.length > 1000) {
    issues.push({
      label: 'Suno 한도 초과',
      detail: `${style.length}자 · 1000자를 넘으면 뒷부분이 잘립니다`,
    });
  }

  return issues;
}

/**
 * 소괄호 안의 설명문을 대괄호로 옮깁니다.
 *
 * 자동으로 하지 않고 사용자가 눌렀을 때만 실행합니다.
 * 판정이 100% 정확하지는 않아서, 부를 수 있는 말까지 옮겨 버리면
 * 코러스나 추임새가 사라집니다. 무엇이 바뀌는지 보고 고르게 합니다.
 */
export function fixParentheses(text) {
  const changed = [];
  const fixed = (text || '').replace(/\(([^)]*)\)/g, (whole, inner) => {
    if (isSingable(inner)) return whole;
    changed.push(inner.trim());
    return `[${inner.trim()}]`;
  });
  return { text: fixed, changed };
}

/**
 * 스타일 프롬프트가 1000자를 넘으면 Suno가 뒷부분을 잘라 버립니다.
 * 프롬프트로 부탁해도 넘기는 일이 잦아서, 받은 뒤 직접 줄입니다.
 *
 * 문장 단위로 뒤에서부터 덜어 내되,
 * 조성·BPM·보컬·시작 방식이 담긴 문장은 남깁니다.
 */
const MUST_KEEP = /\b(\d{2,3}\s*bpm|minor|major|key|vocal|falsetto|tenor|baritone|soprano|opens|begins)\b/i;

export function trimStyle(style, limit = 950) {
  const text = (style || '').trim();
  if (text.length <= limit) return { text, trimmed: 0 };

  // 문장으로 나눕니다.
  const parts = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const keep = [];
  const optional = [];

  parts.forEach((p, i) => (MUST_KEEP.test(p) ? keep.push([i, p]) : optional.push([i, p])));

  // 꼭 남길 문장부터 담고, 남는 자리에 나머지를 앞에서부터 채웁니다.
  const chosen = new Map(keep);
  let used = keep.reduce((n, [, p]) => n + p.length, 0);

  for (const [i, p] of optional) {
    if (used + p.length > limit) continue;
    chosen.set(i, p);
    used += p.length;
  }

  const out = [...chosen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p)
    .join('')
    .trim();

  return { text: out || text.slice(0, limit), trimmed: text.length - out.length };
}

/**
 * 레퍼런스 분석 결과에서 음악 만들기의 옵션 값을 골라냅니다.
 *
 * 분석 결과는 "여성 보컬 Lo-fi 발라드 (Lo-fi, Ballad)" 처럼
 * 한국어와 영어가 섞인 자유로운 문장입니다.
 * 그래서 알약의 표시 이름과 실제 값 양쪽을 모두 대조합니다.
 */
export function matchOptions(text, options) {
  if (!text) return [];
  const hay = text.toLowerCase();

  return options
    .filter(([label, value]) => {
      // 표시 이름이 통째로 들어 있으면 맞는 것으로 봅니다.
      if (label.length > 1 && hay.includes(label.toLowerCase())) return true;

      // 영어 값은 쉼표로 나뉜 조각 중 하나라도 맞으면 통과입니다.
      return value
        .split(/[,/]/)
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.length > 3)
        .some((v) => hay.includes(v));
    })
    .map(([, value]) => value);
}

/** "82-88 BPM, 느긋한 그루브" 같은 문장에서 숫자를 꺼냅니다. */
export function pickBpm(text) {
  const nums = (text || '').match(/\d{2,3}/g);
  if (!nums) return null;
  const valid = nums.map(Number).filter((n) => n >= 40 && n <= 220);
  if (!valid.length) return null;
  // 범위로 적혀 있으면 가운데 값을 씁니다.
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

/** 자막 목록을 SRT 문자열로 */
export function toSrt(subtitles) {
  return subtitles
    .map((s, i) => `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.start + s.duration)}\n${s.text}\n`)
    .join('\n');
}

/**
 * 가사를 구간별로 쪼갭니다. [Chorus - ...] 같은 태그를 경계로 씁니다.
 * 돌려주는 값: [{ role: 'chorus', tag: '원문 태그', lines: ['...'] }, ...]
 */
export function splitSections(text) {
  const out = [];
  let cur = null;

  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const tag = line.match(/^\[([^\]\-]+)/);
    if (tag) {
      cur = { role: tag[1].trim().toLowerCase().replace(/\s*\d+$/, ''), tag: line, lines: [] };
      out.push(cur);
      continue;
    }
    // 태그 앞에 나온 줄은 버리지 않고 담아 둡니다.
    if (!cur) {
      cur = { role: 'unknown', tag: '', lines: [] };
      out.push(cur);
    }
    cur.lines.push(line);
  }
  return out;
}

/** 비교용으로 문장을 씻습니다. 문장부호와 대소문자 차이는 무시합니다. */
function normLine(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 후렴이 훅을 제대로 반복하는지 봅니다.
 *
 * 왜 필요한가:
 * 언어 모델은 같은 문장을 두 번 쓰는 걸 게으른 출력으로 여겨 피합니다.
 * 그래서 후렴 다섯 줄을 전부 다른 문장으로 채우고, 라임은 맞는데
 * 귀에 남는 데가 없는 곡이 나옵니다. 지시만으로는 잘 안 지켜지므로
 * 여기서 실제 결과를 세어 봅니다.
 *
 * 돌려주는 값: { hook, repeats, issues[] }
 */
export function checkHook(text) {
  const chorus = splitSections(text).filter((x) => x.role === 'chorus' && x.lines.length);
  if (!chorus.length) return { hook: '', repeats: 0, issues: [] };

  const issues = [];
  const first = chorus[0].lines;
  const head = normLine(first[0]);
  const tail = normLine(first[first.length - 1]);

  if (!head) return { hook: '', repeats: 0, issues: [] };

  // 첫 줄과 마지막 줄이 같아야 훅입니다.
  if (head !== tail) {
    issues.push({
      kind: 'hook-frame',
      label: '후렴이 훅으로 닫히지 않음',
      detail: `첫 줄 "${first[0].slice(0, 24)}" / 끝 줄 "${first[first.length - 1].slice(0, 24)}"`,
    });
  }

  // 곡 전체에서 훅이 몇 번 나오는지 셉니다.
  const all = (text || '').split('\n').map(normLine);
  const repeats = all.filter((l) => l && l === head).length;

  const wanted = chorus.length * 2;
  if (repeats < wanted) {
    issues.push({
      kind: 'hook-count',
      label: '훅 반복이 모자람',
      detail: `${repeats}번 나옴 · 후렴 ${chorus.length}번이면 ${wanted}번은 되어야 합니다`,
    });
  }

  // 훅이 길면 따라 부를 수 없습니다.
  const words = first[0].trim().split(/\s+/).length;
  if (first[0].length > 40 || words > 9) {
    issues.push({
      kind: 'hook-long',
      label: '훅이 김',
      detail: `${first[0].length}자 · 한 호흡에 부를 수 있게 줄이세요`,
    });
  }

  return { hook: first[0].trim(), repeats, issues };
}
