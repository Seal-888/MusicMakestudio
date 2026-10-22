import { toSrtTime } from './audio.js';
import { CLICHE_WORDS } from './prompts.js';

/**
 * 붙여넣은 가사를 자막으로 쓸 수 있게 다듬습니다.
 * 구간 태그와 연출 지시문을 걷어내고, 화면에서 읽기 좋은 길이로 나눕니다.
 */





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
/** 구간 태그와 괄호 안 연출 지시를 걷어내고 실제 가사 줄만 남깁니다. */
function stripDirections(text) {
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

export function estimateDuration(text) {
  const lines = stripDirections(text);
  if (!lines.length) return null;

  const joined = lines.join(' ');
  const hangul = (joined.match(/[가-힣]/g) || []).length;
  const english = (joined.match(/[A-Za-z][A-Za-z']*/g) || []).length;

  // 한국어는 글자 하나가 한 음절, 영어는 단어당 약 1.3음절입니다.
  // 예전에는 둘 중 큰 쪽만 셌기 때문에, 한국어 가사에 섞인 영어 훅·추임새가 통째로 빠졌습니다.
  const syllables = hangul + Math.round(english * 1.3);

  // 가사 없이 연주만 하는 구간은 시간을 채웁니다. 예전에는 12초로 한꺼번에 잡아서
  // 간주·댄스 브레이크가 있는 구성이 늘 '짧다'고 나왔습니다.
  const breaks = splitSections(text)
    .filter((x) => !x.lines.length)
    .reduce((sum, x) => sum + (/solo|instrumental|interlude/.test(x.role) ? 25 : /break|drop/.test(x.role) ? 15 : 0), 0);

  const seconds = Math.round((syllables / 115) * 60) + 12 + breaks; // 12초는 전주·아웃트로 끝 몫
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

    const tag = line.match(/^\[([^\]]+)\]/);
    if (tag) {
      // 태그는 [Post-Chorus - Chant] 꼴입니다.
      // 이름 자체에 하이픈이 들어가므로(Post-Chorus, Pre-Chorus)
      // 아무 하이픈이 아니라 ' - ' 로만 연출 지시를 떼어 냅니다.
      const role = tag[1]
        .split(' - ')[0]
        .trim()
        .toLowerCase()
        .replace(/\s*\d+$/, '');
      cur = { role, tag: line, lines: [] };
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

/**
 * 곡이 후렴으로 시작하는데, 그 첫 줄이 훅이 아니면 알려 줍니다.
 * 훅으로 여는 구성의 핵심은 첫 소리가 훅이라는 것인데, 모델이 다른 줄로 시작하는 일이 잦습니다.
 */
function coldOpenMiss(text, head) {
  const firstSung = splitSections(text).find((x) => x.lines.length);
  if (!firstSung || !CHORUS_ROLES.includes(firstSung.role)) return [];
  if (normLine(firstSung.lines[0]) === head) return [];
  return [
    {
      kind: 'cold-open-miss',
      label: '첫 소리가 훅이 아님',
      detail: `후렴으로 시작하는데 첫 줄이 훅("${head}")과 다릅니다. 첫 줄을 훅으로 바꾸세요.`,
    },
  ];
}

/** 비교용으로 문장을 씻습니다. 문장부호와 대소문자 차이는 무시합니다. */
function normLine(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 후렴 계열로 볼 구간들. 포스트코러스와 리프레인도 훅이 사는 자리입니다. */
const CHORUS_ROLES = ['chorus', 'post-chorus', 'postchorus', 'refrain', 'hook', 'drop'];

/** 훅으로 쳐 주지 않을 말들. 이것만 반복되는 건 훅이 아닙니다. */
const HOOK_STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'if', 'to', 'of', 'in', 'on', 'at', 'for',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'there',
  'i', 'you', 'we', 'they', 'he', 'she', 'me', 'my', 'your', 'our', 'his', 'her',
  '그', '그리고', '그런데', '나', '너', '우리', '내', '네', '것', '수', '더',
]);

/**
 * 후렴에서 훅을 찾습니다.
 *
 * 훅은 문장일 수도 있고 아닐 수도 있습니다.
 * 영어 팝에서는 한 단어를 세 번 붙이거나(Runaway, runaway, runaway),
 * 뜻 없는 소리(Na na na)가 훅인 경우가 오히려 흔합니다.
 * 그래서 두 가지를 다 봅니다.
 *
 *   line   — 같은 줄이 통째로 되풀이되는 형태
 *   phrase — 짧은 말이 줄 안팎에서 되풀이되는 형태
 *
 * 왜 세어 보는가:
 * 언어 모델은 같은 말을 두 번 쓰는 걸 게으른 출력으로 여겨 피합니다.
 * 그래서 라임은 맞는데 귀에 남는 데가 없는 후렴이 나옵니다.
 * 지시만으로는 잘 안 지켜지므로 결과를 직접 셉니다.
 *
 * 돌려주는 값: { hook, kind, repeats, issues[] }
 */
export function checkHook(text) {
  const chorus = splitSections(text).filter(
    (x) => CHORUS_ROLES.includes(x.role) && x.lines.length
  );
  if (!chorus.length) return { hook: '', kind: '', repeats: 0, issues: [] };

  const allLines = (text || '').split('\n').map(normLine).filter(Boolean);
  const chorusLines = chorus.flatMap((c) => c.lines);

  /* ── 1. 줄 훅: 후렴의 첫 줄과 끝 줄이 같은가 ──
   *
   * 첫 번째 후렴만 보면 안 됩니다. 훅으로 여는 곡은 첫 후렴을 앞 서너 줄만 잘라 쓰기 때문에
   * 첫 줄과 끝 줄이 다릅니다. 예전에는 그래서 진짜 훅을 놓치고 '훅 없음'이라고 했습니다.
   * 첫 줄과 끝 줄이 같은 후렴(전문)을 찾아 그것을 기준으로 삼습니다. */
  const isFramed = (c) =>
    c.lines.length > 1 && normLine(c.lines[0]) && normLine(c.lines[0]) === normLine(c.lines[c.lines.length - 1]);
  // 포스트코러스 구호(oh oh oh / oh oh oh)는 말 훅이지 후렴 전문이 아니므로 여기서 빼고 찾습니다.
  const full = chorus.find((c) => !/post|drop/.test(c.role) && isFramed(c));
  const first = (full || chorus[0]).lines;
  const head = normLine(first[0]);

  if (full) {
    const repeats = allLines.filter((l) => l === head).length;
    return {
      hook: first[0].trim(),
      kind: 'line',
      repeats,
      issues: [...tooLong(first[0]), ...coldOpenMiss(text, head)],
    };
  }

  /* ── 2. 말 훅: 짧은 말이 후렴 안에서 되풀이되는가 ── */
  const phrase = findPhraseHook(chorusLines);
  if (phrase && phrase.count >= 3) {
    const whole = normLine(text).length ? countPhrase(text, phrase.words) : phrase.count;
    return {
      hook: phrase.text,
      kind: 'phrase',
      repeats: whole,
      issues: [],
    };
  }

  /* ── 3. 둘 다 아니면 훅이 없는 후렴입니다 ── */
  return {
    hook: first[0]?.trim() || '',
    kind: '',
    repeats: head ? allLines.filter((l) => l === head).length : 0,
    issues: [
      {
        kind: 'hook-none',
        label: '후렴에 되풀이되는 훅이 없음',
        detail:
          '같은 줄을 다시 쓰거나(첫 줄=끝 줄), 짧은 말을 세 번 이상 되풀이하세요. ' +
          '단어 하나나 뜻 없는 소리도 훅이 됩니다.',
      },
      ...tooLong(first[0] || ''),
    ],
  };
}

/** 따라 부를 수 없이 긴 훅을 지적합니다. */
function tooLong(line) {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  if (line.length <= 40 && words <= 9) return [];
  return [
    {
      kind: 'hook-long',
      label: '훅이 김',
      detail: `${line.length}자 · 한 호흡에 부를 수 있게 줄이세요`,
    },
  ];
}

/**
 * 후렴 줄들에서 가장 많이 되풀이되는 짧은 말을 찾습니다.
 * 한 단어부터 세 단어까지 보고, 조사나 관사만 남는 건 버립니다.
 */
function findPhraseHook(lines) {
  const counts = new Map();

  for (const line of lines) {
    const words = normLine(line).split(' ').filter(Boolean);
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (gram.every((w) => HOOK_STOP.has(w))) continue;
        if (gram.join('').length < 2) continue;
        const key = gram.join(' ');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  if (!counts.size) return null;

  // 많이 나온 것 우선, 같으면 긴 쪽을 훅으로 봅니다.
  let best = null;
  for (const [text, count] of counts) {
    const words = text.split(' ');
    if (
      !best ||
      count > best.count ||
      (count === best.count && words.length > best.words.length)
    ) {
      best = { text, count, words };
    }
  }
  return best;
}

/** 곡 전체에서 그 말이 몇 번 나오는지 셉니다. */
function countPhrase(text, words) {
  const flat = normLine(text.replace(/\n/g, ' '));
  const needle = words.join(' ');
  let from = 0;
  let n = 0;
  for (;;) {
    const at = flat.indexOf(needle, from);
    if (at === -1) break;
    n++;
    from = at + needle.length;
  }
  return n;
}

/**
 * SRT 파일을 읽어 자막 덩어리로 나눕니다.
 *
 * 왜 필요한가:
 * 시각은 우리가 만들지 않습니다. 캡컷 자동 자막이 이미 잡아 둔 것을 그대로 씁니다.
 * 곡 길이만 보고 시각을 추정하면 반드시 밀립니다.
 */
/** SRT 파일을 읽어 자막 목록으로 */
export function parseSrt(text, offsetSec = 0) {
  const out = [];
  const blocks = text.replace(/\r/g, '').trim().split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [from, to] = timeLine.split('-->').map((t) => parseSrtTime(t.trim()));
    if (from === null || to === null) continue; // 시각을 못 읽은 칸은 0초로 몰지 않고 버립니다
    const body = lines.slice(lines.indexOf(timeLine) + 1).join('\n').trim();
    if (body) out.push({ text: body, start: from + offsetSec, duration: Math.max(0.1, to - from) });
  }
  return out;
}

/**
 * 00:01:02,345 · 01:02.345(시 생략) · 00:01:02,34(밀리초 두 자리) 를 모두 읽습니다.
 *
 * 예전에는 소수부를 무조건 1000으로 나눠서 ',34' 를 0.034초로 읽었고(0.34초가 맞음),
 * 시를 뺀 표기는 아예 0초로 읽어 자막이 전부 맨 앞에 몰렸습니다.
 */
function parseSrtTime(t) {
  const m = /(?:(\d+):)?(\d+):(\d+)(?:[,.](\d+))?/.exec(t);
  if (!m) return null;
  const frac = m[4] ? +`0.${m[4]}` : 0;
  return (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + frac;
}

/** 줄 끝 신호로 쓸 수 없는 것 — 구간 전체의 '상태'라 한 줄에 못 붙습니다. */
const INLINE_BAD = /\b(drops?\s+out|only|fades?\s+out|thins?\s+out|continues|maintains?)\b/i;

/**
 * 가사 줄 끝에 붙인 악기 신호가 규칙을 지키는지 봅니다.
 *
 * 왜 필요한가:
 * Suno는 줄 끝 대괄호를 '지금 이 순간 시작되는 것'으로만 읽습니다.
 * 빼거나 사라지는 지시를 줄 끝에 붙이면 그 줄이 통째로 무시되고,
 * 너무 촘촘하면 신호 전체가 씹힙니다.
 * 프롬프트로 지시하되 결과는 여기서 세어 봅니다.
 */
export function checkInlineTags(text) {
  const issues = [];
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);

  let tagged = 0;
  let lyricLines = 0;

  for (const line of lines) {
    // 구조 태그 줄([Verse 1 - ...])은 대상이 아닙니다.
    if (/^\[[^\]]*\]$/.test(line)) continue;
    lyricLines++;

    const m = line.match(/\[([^\]]+)\]\s*$/);
    if (!m) {
      // 줄 중간에 있는 대괄호는 무시됩니다.
      if (/\[[^\]]+\]/.test(line)) {
        issues.push({
          kind: 'inline-midline',
          label: '악기 신호가 줄 중간에 있음',
          detail: line.slice(0, 40),
        });
      }
      continue;
    }

    tagged++;
    if (INLINE_BAD.test(m[1])) {
      issues.push({
        kind: 'inline-state',
        label: '줄 끝에 쓸 수 없는 신호',
        detail: `[${m[1]}] — 빼거나 남기는 지시는 구조 태그로 옮기세요`,
      });
    }
  }

  // 두 줄에 하나가 상한입니다.
  if (lyricLines && tagged > Math.ceil(lyricLines / 2)) {
    issues.push({
      kind: 'inline-dense',
      label: '악기 신호가 너무 촘촘함',
      detail: `가사 ${lyricLines}줄에 ${tagged}개 — ${Math.ceil(lyricLines / 2)}개 이하로`,
    });
  }

  return { count: tagged, issues };
}

/** 아웃트로가 한 방으로 닫히는지 봅니다. fades out 만 있으면 흐지부지 끝납니다. */
export function checkOutro(text) {
  const outro = splitSections(text).find((x) => x.role === 'outro');
  if (!outro) return { issues: [] };

  const tag = outro.tag.toLowerCase();
  if (/\bfinal\b|\brings? out\b|\bhit\b|\bstrike\b/.test(tag)) return { issues: [] };

  return {
    issues: [
      {
        kind: 'outro-open',
        label: '아웃트로가 닫히지 않음',
        detail: '마지막에 Final 한 방을 넣으세요 (예: Final Piano Chord Rings Out)',
      },
    ],
  };
}

/**
 * 가사 줄 수가 목표에 못 미치는지 봅니다.
 *
 * 왜 필요한가:
 * Suno는 가사가 끝나면 곡을 닫습니다. 그래서 곡 길이는 가사 분량이 정합니다.
 * 모델이 구간을 합치거나 "반복"이라고 줄여 적으면 곡이 1분 가까이 짧아지는데,
 * 가사만 봐서는 몇 줄인지 세기 어려워 그냥 넘어가게 됩니다.
 */
export function checkLength(text, wantLines) {
  if (!wantLines) return { lines: 0, issues: [] };

  const lines = (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\[[^\]]*\]$/.test(l));

  const issues = [];

  if (lines.length < wantLines * 0.85) {
    issues.push({
      kind: 'too-short',
      label: '가사가 모자람',
      detail: `${lines.length}줄 · 목표 ${wantLines}줄 — 이대로면 곡이 짧게 끝납니다`,
    });
  }

  // 줄 수를 채워도 줄이 너무 짧으면 곡이 빨리 끝납니다.
  const short = lines.filter((l) => l.replace(/\[[^\]]*\]/g, '').trim().split(/\s+/).length <= 3);
  if (lines.length >= 8 && short.length > lines.length * 0.4) {
    issues.push({
      kind: 'too-terse',
      label: '짧은 줄이 너무 많음',
      detail: `${short.length}/${lines.length}줄이 세 단어 이하 — 줄 수를 채워도 곡이 짧아집니다`,
    });
  }

  return { lines: lines.length, issues };
}

/**
 * 훅이 아닌 말이 곡 안에서 세 번 넘게 되풀이되는지 봅니다.
 *
 * 왜 필요한가:
 * 훅은 되풀이해야 하지만, 훅이 아닌 말이 되풀이되면 성의 없어 보입니다.
 * 모델이 라임을 맞추려고 같은 줄 끝(nothing there 같은 것)을
 * 절마다 다시 쓰는 일이 잦은데, 가사만 훑어서는 잘 안 보입니다.
 * 후렴 안의 반복은 셈에서 뺍니다. 후렴은 원래 되풀이하는 자리입니다.
 */
export function checkRepeats(text) {
  const sections = splitSections(text);
  const chorusSet = new Set(['chorus', 'post-chorus', 'postchorus', 'refrain', 'hook']);
  const counts = new Map();

  for (const sec of sections) {
    if (chorusSet.has(sec.role) || sec.role === 'outro') continue;
    for (const raw of sec.lines) {
      const line = raw.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '');
      const words = normLine(line).split(' ').filter(Boolean);
      // 줄 끝 두 단어 — 라임을 맞추려고 되풀이되는 자리입니다.
      // 'to me', 'at the' 처럼 관사·대명사만 남는 건 흔한 말이라 셈에서 뺍니다.
      if (words.length >= 2) {
        const tail = words.slice(-2);
        if (tail.every((w) => HOOK_STOP.has(w))) continue;
        const key = tail.join(' ');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }

  const issues = [];
  for (const [phrase, n] of counts) {
    if (n >= 3) {
      issues.push({
        kind: 'repeat-tail',
        label: '같은 말이 되풀이됨',
        detail: `"${phrase}" ${n}번 — 후렴이 아닌 곳이라 성의 없어 보입니다`,
      });
    }
  }
  return { issues };
}

/**
 * 3막 7장 후보들이 같은 꼴로 몰렸는지 봅니다.
 *
 * 왜 필요한가:
 * 빌런 화자로 뽑으면 반전이 전부 '처음부터 계획했다'로, 결말이 전부 '상대가 쓰러져 있다'로
 * 몰리는 일이 잦습니다. 프롬프트로 막아도 새는 경우가 있어서 화면에서 바로 보이게 합니다.
 * 돌려주는 값: 경고 문장 목록
 */
/** 작사 단계의 금지어. 후보 단계에서도 미리 잡습니다. */
const CLICHE_RE = new RegExp(`\\b(${CLICHE_WORDS.join('|')})`, 'i');
const CLICHE_RE_G = new RegExp(`\\b(${CLICHE_WORDS.join('|')})\\w*`, 'gi');

export function checkSeeds(seeds = []) {
  const out = [];
  const banned = seeds.filter((x) => CLICHE_RE.test(`${x.title} ${x.hook} ${x.opening}`));
  if (banned.length) {
    const words = [...new Set(banned.flatMap((x) => `${x.title} ${x.hook} ${x.opening}`.match(CLICHE_RE_G) || []).map((w) => w.toLowerCase()))];
    out.push(`후보 ${banned.length}개에 금지어(${words.join(', ')})가 있습니다. 완성할 때 그 단어는 바뀝니다.`);
  }
  const selfTalk = seeds.filter((x) => /나 자신|세상/.test(x.to || '') && /\byou(r|'re)?\b/i.test(x.opening || ''));
  if (selfTalk.length) {
    out.push(`후보 ${selfTalk.length}개는 '${selfTalk[0].to}'에게 하는 말인데 첫 줄이 you 를 부릅니다. 누구에게 하는 말인지 어긋납니다.`);
  }
  // 아래의 '몰림' 검사는 후보가 여럿일 때만 뜻이 있습니다.
  if (seeds.length < 3) return out;
  const planned = seeds.filter((x) =>
    /처음부터|전부터|미리|이미 .{0,12}(계획|알고|준비|타고|넣어)/.test(x.twist || '')
  );
  if (planned.length >= 2) {
    out.push(`반전 ${planned.length}개가 '처음부터 계획했다' 꼴입니다. 이런 화자에게는 반전이 되지 않습니다.`);
  }
  const told = seeds.filter((x) => isNarration(x.opening));
  if (told.length >= 2) {
    out.push(`첫 줄 ${told.length}개가 지난 일을 들려주는 문장입니다 (과거형·but/so 설명). 장면 안에서 지금 하는 말이어야 합니다.`);
  }
  // 지난번 내레이션을 막자 반대로 전부 '짧은 말. 명령.' 두 토막으로 쏠렸습니다.
  const clipped = seeds.filter((x) => isClipped(x.opening));
  if (clipped.length >= 3) {
    out.push(`첫 줄 ${clipped.length}개가 '짧은 말. 명령.' 같은 꼴입니다. 노래 첫 줄보다 지시문처럼 들립니다.`);
  }
  const hurtFirst = seeds.filter((x) => /맞고|때리|손찌검|폭행|쓰러|피를|비명/.test(x.origin || ''));
  if (hurtFirst.length) {
    out.push(`처음 장면 ${hurtFirst.length}개에서 이미 폭력이 오갑니다. 처음은 아직 아무 일도 터지지 않은 평소여야 오를 데가 있습니다.`);
  }
  const down = seeds.filter((x) => /쓰러|무릎|엎드|주저앉|비명|빌고|피를|울부짖/.test(x.scene || ''));
  if (down.length >= 3) {
    out.push(`결말 ${down.length}개가 '상대가 쓰러져 있는' 장면입니다.`);
  }
  return out;
}

/**
 * 아주 짧은 토막 두세 개로 끊긴 첫 줄인지. (Sit down. Drop your bag. / Take the glass. Drink it.)
 * 하나만 있으면 괜찮지만, 후보 대부분이 이 꼴이면 같은 곡처럼 들립니다.
 */
export function isClipped(line = '') {
  const parts = line.split(/[.!?]+/).map((x) => x.trim()).filter(Boolean);
  return parts.length >= 2 && parts.every((x) => x.split(/\s+/).length <= 4);
}

/** 영어 과거형 동사. 규칙 변화(-ed)와 가사에 자주 나오는 불규칙 변화. */
const PAST_EN =
  /\b(\w{2,}ed|was|were|had|did|saw|took|gave|made|left|told|knew|felt|went|came|said|put|kept|held|threw|drank|poured|brought|bought|caught|thought|heard|found|lost|stood|sat|ran|fell|broke|wrote|spoke|drove|hid|shut|let|set)\b/i;
/** 사정을 덧붙이는 접속 */
const CLAUSE_EN = /\b(but|so|because|before|after|while|though|although|making sure|so that)\b/i;
/** 한국어 과거형 어미 */
const PAST_KO = /[었았였했](다|어|지|고|는데|던)?(?=[\s,.!?]|$)/;

/**
 * 한 줄이 '지난 일을 들려주는' 문장인지.
 * 과거형이면서 사정을 덧붙이거나, 과거형 문장이 길게 이어지는 경우를 잡습니다.
 * (I buckled you in, making sure the click was loud enough. / You handed me the coffee, but ...)
 */
export function isNarration(line = '') {
  const t = line.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
  if (!t) return false;
  const words = t.split(/\s+/).length;
  if (PAST_EN.test(t)) return CLAUSE_EN.test(t) || words >= 10;
  if (PAST_KO.test(t)) return /(지만|는데|해서|려고|도록|면서)/.test(t) || t.length >= 16;
  return false;
}

/**
 * 절(verse)이 과거형 보고로 흘러가는지 봅니다.
 * 한두 줄은 괜찮습니다. 절 줄의 절반 넘게 그러면 노래가 아니라 이야기 낭독이 됩니다.
 */
export function checkNarration(text) {
  const verse = splitSections(text)
    .filter((x) => /verse|pre-chorus|bridge/.test(x.role))
    .flatMap((x) => x.lines);
  if (verse.length < 4) return { issues: [] };
  const told = verse.filter(isNarration);
  if (told.length / verse.length <= 0.5) return { issues: [] };
  return {
    issues: [
      {
        kind: 'narration',
        label: '이야기를 들려주듯 씀',
        detail: `절 ${verse.length}줄 중 ${told.length}줄이 과거형 보고·설명입니다. 장면 안에서 상대에게 지금 하는 말로 바꾸세요.`,
      },
    ],
  };
}
