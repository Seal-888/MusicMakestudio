/**
 * 후렴 훅이 제대로 박히는지 확인합니다.
 *
 * 왜 필요한가:
 * 영어 가사는 정독하지 않으면 훅이 반복되는지 눈에 안 들어옵니다.
 * 게다가 언어 모델은 같은 문장을 두 번 쓰는 걸 피하는 성질이 있어서,
 * 지시만으로는 잘 안 지켜집니다. 그래서 세어 보는 쪽을 검사에 둡니다.
 *
 * 쓰는 법:
 *   node check-hook.mjs
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

let failed = 0;
const ok = (cond, label) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failed++;
};

const { checkHook, splitSections, checkInlineTags, checkOutro, checkLength, checkRepeats } = await import(appUrl('js/lyrics.js'));
const { songWriting, songSeeds, targetLines, songStructure, SCENES, SCENES_HOOK, ACTS } = await import(appUrl('js/prompts.js'));

/* ── 프롬프트가 훅을 제대로 요구하는지 ────────── */
console.log('\n프롬프트 지시:');
{
  const full = songWriting({
    genres: 'dark pop', language: 'English', vocal: 'v', tempo: 't',
    moods: 'm', era: 'e', instruments: 'i', concept: 'c', songCount: 1,
  });

  ok(full.prompt.includes('후렴은 훅이 전부입니다'), '후렴 전용 섹션이 있음');
  ok(full.prompt.includes('첫 줄은 훅입니다'), '첫 줄 훅 지시');
  ok(full.prompt.includes('마지막 줄도 훅입니다'), '마지막 줄 훅 지시');
  ok(full.prompt.includes('글자 하나 바꾸지 않고'), '변형 금지를 명시');
  ok(full.prompt.includes('1행과 5행은 훅 원문 그대로'), '구조표에도 훅 위치를 박음');
  ok(full.prompt.includes('아웃트로 태그는 세 단으로'), '아웃트로를 세 단으로 끝내게 함');
  ok(full.prompt.includes('Final 로 시작하는 한 방'), '마지막 한 방을 반드시 넣게 함');
  ok(full.prompt.includes('가사 줄 끝에 악기 신호'), '줄 끝 악기 신호를 설명함');
  ok(full.prompt.includes('두 줄에 하나 이하'), '신호 밀도를 제한함');
  ok(full.prompt.includes('악기 목록에 이미 있어야'), '없는 악기를 부르지 않게 함');

  // 열쇠말과 훅이 섞이지 않아야 합니다.
  ok(
    full.prompt.includes('훅 밖에서 곡을 묶어'),
    '열쇠말이 훅과 분리됨 (예전에는 훅을 흩뿌리라고 말했음)'
  );

  const seeds = songSeeds({ genres: 'dark pop', language: 'English', moods: 'm', concept: 'c' });
  ok(seeds.prompt.includes('글자 그대로 되풀이될'), '후보 단계에서도 훅을 되풀이될 말로 정의');
  ok(seeds.prompt.includes('3~7음절'), '훅 길이를 제한 (3음절 훅도 흔해서 3부터)');
  ok(full.prompt.includes('문장일 필요는 없습니다'), '훅이 문장이 아니어도 된다고 알림');
  ok(full.prompt.includes('Na na na'), '뜻 없는 소리도 훅으로 예시');
  ok(seeds.prompt.includes('Runaway'), '후보 단계에도 단어 반복형 예시');
  ok(seeds.prompt.includes('구경하지 마세요'), '관찰자 시점을 금지함');
  ok(!seeds.prompt.includes('무관심'), '특정 태도를 예시로 주지 않음');
  ok(seeds.prompt.includes('누구에게 하는 말인가'), '말 거는 상대를 요구함');
  ok(seeds.prompt.includes('현재진행으로'), '지금 벌어지는 일을 요구함');
}

/* ── 구간 쪼개기 ───────────────────────────────── */
console.log('\n빌런 화자:');
{
  const { PERSONAS } = await import(appUrl('js/prompts.js'));
  const g = PERSONAS.villain.guide;
  ok(g.includes('당한 사람이 있어야 합니다'), '피해자를 요구함');
  ok(g.includes('구체적인 장면으로'), '한 짓을 장면으로 쓰게 함');
  ok(g.includes('당한 사람의 반응도'), '상대의 반응까지 요구함');
  ok(g.includes('정리'), '끝에서 교훈으로 닫는 것을 막음');
  ok(g.includes('터지는 곡이면 터뜨립니다'), '터지는 곡에서 소리칠 수 있음');
  ok(!g.includes('**말투는 조용합니다.**'), '조용함을 화자의 조건으로 못 박지 않음');
  ok(g.includes('주제에 분노나 폭발이 있으면 그쪽을 따릅니다'), '주제가 말투를 이김');

  const full = songWriting({
    genres: 'dark pop', language: 'English', vocal: 'v', tempo: 't',
    moods: 'm', era: 'e', instruments: 'i', concept: 'c', songCount: 1, persona: 'villain',
  });
  ok(full.prompt.includes('당한 사람이 있어야'), '작사 프롬프트에 실림');
  ok(full.prompt.includes('교훈으로 정리해 버리지 않았는가'), '자기검토에도 들어감');

  const seeds = songSeeds({ genres: 'dark pop', language: 'English', moods: 'm', concept: 'c', persona: 'villain' });
  ok(seeds.prompt.includes('당한 사람이 있어야'), '후보 단계에도 실림');
}

console.log('\n구간 쪼개기:');
{
  const text = `[Intro - Soft Piano]
[Verse 1 - Low Bass]
first line
second line
[Chorus - Big Brass]
hook line
middle one
hook line
[Verse 2 - Low Bass]
third line`;
  const sec = splitSections(text);
  ok(sec.length === 4, `구간 ${sec.length}개로 나뉨`);
  ok(sec[0].lines.length === 0, '가사 없는 인트로도 구간으로 잡힘');
  ok(sec[2].role === 'chorus', '후렴 태그를 알아봄');
  ok(sec[1].role === 'verse', 'Verse 1 → verse (번호 제거)');
}

/* ── 훅 검사 ───────────────────────────────────── */
console.log('\n훅 검사 — 잘 된 가사:');
{
  const good = `[Verse 1 - Soft]
the hallway kept your name
i left it where it fell
[Chorus - Big]
I closed the door
you never heard it
nothing left to burn
so let it go
I closed the door
[Verse 2 - Soft]
the winter did the rest
[Chorus - Big]
I closed the door
you never heard it
nothing left to burn
so let it go
I closed the door`;
  const r = checkHook(good);
  ok(r.hook === 'I closed the door', `훅을 찾아냄: "${r.hook}"`);
  ok(r.kind === 'line', '줄 훅으로 판정');
  ok(r.repeats === 4, `반복 ${r.repeats}번으로 셈`);
  ok(r.issues.length === 0, '문제 없음');
}

console.log('\n훅 검사 — 라임만 맞고 훅이 없는 가사:');
{
  const weak = `[Verse 1 - Soft]
the hallway kept your name
[Chorus - Big]
I walked into the light
you faded out of sight
the morning came too bright
and nothing felt alright
i never said goodnight`;
  const r = checkHook(weak);
  ok(r.issues.some((x) => x.kind === 'hook-none'), '훅 없는 후렴을 잡아냄');
  ok(r.kind === '', '훅 형태가 없음으로 나옴');
  console.log(`     → ${r.issues.map((x) => x.label).join(' / ')}`);
}

console.log('\n훅 검사 — 세부 규칙:');
{
  // 문장부호와 대소문자 차이는 같은 훅으로 봅니다.
  const punct = `[Chorus - Big]
I closed the door.
middle
i closed the door`;
  ok(checkHook(punct).kind === 'line', '문장부호·대소문자 차이는 같은 훅으로 봄');

  // 너무 긴 훅
  const long = `[Chorus - Big]
i think i finally understood what you were trying to tell me back then
middle
i think i finally understood what you were trying to tell me back then`;
  ok(
    checkHook(long).issues.some((x) => x.kind === 'hook-long'),
    '따라 부를 수 없이 긴 훅을 잡아냄'
  );

  // 후렴이 없으면 조용히 넘어갑니다.
  ok(checkHook('[Verse 1 - Soft]\njust a line').issues.length === 0, '후렴이 없으면 트집 잡지 않음');
  ok(checkHook('').hook === '', '빈 가사에서 터지지 않음');
}

console.log('\n훅 검사 — 문장이 아닌 훅:');
{
  const shapes = {
    '단어를 붙여 되풀이': ['[Chorus - Big]\nRunaway, runaway, runaway\ni never learned to stay\nRunaway, runaway, runaway', 'line'],
    '뜻 없는 소리': ['[Chorus - Big]\nNa na na, na na na\nyou said it once\nNa na na, na na na', 'line'],
    '줄 안에서만 되풀이': ['[Chorus - Big]\nGravity, gravity, pulling me down\nno hands to hold\nfalling into gravity again', 'phrase'],
    '포스트코러스에 있는 훅': ['[Chorus - Big]\nline one\nline two\n[Post-Chorus - Chant]\noh oh oh\noh oh oh', 'phrase'],
    '한국어 단어 반복': ['[Chorus - Big]\n돌아와 돌아와\n아무말 없이\n돌아와 돌아와', 'line'],
  };
  for (const [label, [text, want]] of Object.entries(shapes)) {
    const r = checkHook(text);
    ok(r.kind === want && !r.issues.some((x) => x.kind === 'hook-none'),
       `${label} → ${r.kind} 훅 "${r.hook}" ${r.repeats}번`);
  }

  // 관사나 조사만 되풀이되는 건 훅이 아닙니다.
  const stop = '[Chorus - Big]\nthe night and the fall\nthe way you turn\nand the silence after';
  ok(checkHook(stop).issues.some((x) => x.kind === 'hook-none'), '관사·조사 반복은 훅으로 안 쳐 줌');
}

console.log('\n구간 인식:');
{
  const roles = splitSections('[Post-Chorus - Chant]\na\n[Pre-Chorus - Build]\nb\n[Verse 2 - Low]\nc').map((x) => x.role);
  ok(roles[0] === 'post-chorus', 'Post-Chorus를 온전히 읽음 (이름 속 하이픈에 안 잘림)');
  ok(roles[1] === 'pre-chorus', 'Pre-Chorus도 마찬가지');
  ok(roles[2] === 'verse', '연출 지시는 떼어 냄');
}

console.log('\n줄 끝 악기 신호:');
{
  const ok1 = `[Verse 1 - Soft Piano]
the hallway kept your name [strings enter]
i left it where it fell
the winter did the rest [bass slide]
and nothing came of it`;
  ok(checkInlineTags(ok1).count === 2, '줄 끝 신호를 세어 냄');
  ok(checkInlineTags(ok1).issues.length === 0, '규칙을 지킨 가사는 통과');

  const midline = '[Verse 1 - Soft]\nthe hallway [brass stabs] kept your name';
  ok(
    checkInlineTags(midline).issues.some((x) => x.kind === 'inline-midline'),
    '줄 중간에 넣은 신호를 잡아냄'
  );

  const state = '[Verse 1 - Soft]\nthe hallway kept your name [drums drop out]';
  ok(
    checkInlineTags(state).issues.some((x) => x.kind === 'inline-state'),
    '빼는 지시를 줄 끝에 쓴 것을 잡아냄'
  );
  const only = '[Verse 1 - Soft]\nthe hallway kept your name [bass and drums only]';
  ok(checkInlineTags(only).issues.some((x) => x.kind === 'inline-state'), '남기는 지시도 잡아냄');

  const dense = `[Verse 1 - Soft]
one [brass stabs]
two [bass slide]
three [drum fill]`;
  ok(
    checkInlineTags(dense).issues.some((x) => x.kind === 'inline-dense'),
    '두 줄에 하나를 넘으면 잡아냄'
  );

  ok(checkInlineTags('[Verse 1 - Soft]\njust a line').issues.length === 0, '신호가 없어도 트집 잡지 않음');
}

console.log('\n아웃트로 마무리:');
{
  const open = '[Outro - Instrumentation Thins Out, Fades Out]\nlast line';
  ok(checkOutro(open).issues.some((x) => x.kind === 'outro-open'), 'fades out 만 있으면 잡아냄');

  const closed = '[Outro - Drums Drop Out, Then Bass Fades, Final Piano Chord Rings Out]\nlast line';
  ok(checkOutro(closed).issues.length === 0, 'Final 한 방이 있으면 통과');

  const hit = '[Outro - Everything Drops, Final Kick Drum Hit]\nlast line';
  ok(checkOutro(hit).issues.length === 0, 'Final Kick Drum Hit 도 인정');

  ok(checkOutro('[Verse 1 - Soft]\nline').issues.length === 0, '아웃트로가 없으면 트집 잡지 않음');
}

console.log('\n곡 길이 — 선언한 줄 수와 구성표가 맞는가:');
{
  // 예전에는 totalLines 를 손으로 적어 두어 구성표와 어긋났습니다.
  // 3:30 은 구간 합이 47줄인데 36줄이라고 적혀 있어 곡이 짧게 나왔습니다.
  for (const d of ['2:00', '2:30', '3:00', '3:30', '4:00']) {
    for (const [form, actOpen] of [['standard'], ['chorusFirst'], ['threeActs', 'hook'], ['threeActs', 'build']]) {
      const want = targetLines({ duration: d, form, actOpen });
      const p = songWriting({
        genres: 'x', language: 'English', vocal: 'v', tempo: 't', moods: 'm',
        era: 'e', instruments: 'i', concept: 'c', songCount: 1, duration: d, form, actOpen,
      }).prompt;
      const said = Number(p.match(/모두 합쳐 (\d+)줄/)?.[1]);
      const label = { standard: '기본', chorusFirst: '도입부코러스', threeActs: `3막7장(${actOpen})` }[form];
      ok(said === want, `${d} ${label} — 선언 ${said} = 계산 ${want}`);
    }
  }

  const long = songWriting({
    genres: 'x', language: 'English', vocal: 'v', tempo: 't', moods: 'm',
    era: 'e', instruments: 'i', concept: 'c', songCount: 1, duration: '3:30',
  }).prompt;
  ok(long.includes('목표 길이는 3:30'), '목표 시간을 직접 알려 줌');
  ok(long.includes('줄여 적는 순간'), '줄여 적으면 짧아진다고 경고함');
}

console.log('\n가사 분량 검사:');
{
  const line = 'a normal lyric line with enough words';
  const full = '[Verse 1 - x]\n' + Array.from({ length: 47 }, (_, i) => line + ' ' + i).join('\n');
  ok(checkLength(full, 47).issues.length === 0, '목표를 채우면 통과');
  ok(checkLength(full, 47).lines === 47, '태그 줄은 빼고 셈');

  const half = '[Verse 1 - x]\n' + Array.from({ length: 20 }, (_, i) => line + ' ' + i).join('\n');
  ok(checkLength(half, 47).issues.some((x) => x.kind === 'too-short'), '모자라면 잡아냄');

  const terse = '[Verse 1 - x]\n' + Array.from({ length: 45 }, () => 'burn it down').join('\n');
  ok(
    checkLength(terse, 47).issues.some((x) => x.kind === 'too-terse'),
    '줄 수를 채워도 줄이 너무 짧으면 잡아냄'
  );
  ok(checkLength(full, 0).issues.length === 0, '목표가 없으면 트집 잡지 않음');
}

console.log('\n마지막 후렴 흔들기:');
{
  const on = songWriting({
    genres: 'x', language: 'English', vocal: 'v', tempo: 't', moods: 'm',
    era: 'e', instruments: 'i', concept: 'c', songCount: 1, crack: true,
  }).prompt;
  const off = songWriting({
    genres: 'x', language: 'English', vocal: 'v', tempo: 't', moods: 'm',
    era: 'e', instruments: 'i', concept: 'c', songCount: 1,
  }).prompt;
  ok(on.includes('Vocal Cracks Once, Then Flat Again'), '태그 문구를 그대로 알려 줌');
  ok(on.includes('한 번뿐입니다'), '한 번만 흔들게 제한함');
  ok(on.includes('훅은 끝까지 흔들리지 않아야'), '훅은 지키게 함');
  ok(!off.includes('마지막 후렴에서 딱 한 번'), '끄면 안 실림');
}

console.log('\n처음 켜 두는 값이 한 장르로 굳지 않았는가:');
{
  const fs2 = await import('fs');
  const src = fs2.readFileSync(path.join(ROOT, 'js/pages/music.js'), 'utf8');
  const block = src.match(/const DEFAULTS = \{[\s\S]*?\n\};/)[0];
  const count = (key) => (block.match(new RegExp(key + ": \\[([^\\]]*)\\]"))?.[1].match(/'/g)?.length || 0) / 2;

  ok(count('genre') <= 2, `장르 기본값이 ${count('genre')}개 — 넓힐 여지를 남김`);
  ok(count('mood') <= 3, `분위기 기본값이 ${count('mood')}개 — 곡마다 채우게 둠`);
  ok(count('instrument') <= 3, `악기 기본값이 ${count('instrument')}개`);
  // 채널 성격은 남아 있어야 합니다.
  ok(/dark/.test(block), '어두운 바탕은 남아 있음');
  ok(/menacing/.test(block), '위협적인 태도는 남아 있음');
}

console.log('\n프롬프트에서도 충돌을 막는가:');
{
  const b = { genres: 'x', language: 'English', vocal: 'v', tempo: 't', moods: 'm',
              era: 'e', instruments: 'i', concept: 'c', songCount: 1 };
  const both = songWriting({ ...b, rhyme: true, minimal: true }).prompt;
  ok(!both.includes('라임과 리듬'), '둘 다 켜져 오면 라임 지시는 안 실림');
  ok(both.includes('════════ 여백'), '여백 지시만 실림');

  const r = songWriting({ ...b, rhyme: true }).prompt;
  ok(r.includes('라임과 리듬') && !r.includes('════════ 여백'), '라임만 켜면 라임만');
  const mi = songWriting({ ...b, minimal: true }).prompt;
  ok(!mi.includes('라임과 리듬') && mi.includes('════════ 여백'), '여백만 켜면 여백만');
}

console.log('\nA. 도입부 코러스가 곡 속도를 따르는가:');
{
  const b = { genres: 'x', language: 'English', instruments: 'i', concept: 'c', era: 'e',
              songCount: 1, form: 'chorusFirst', introInStyle: true };
  const slow = songWriting({ ...b, vocal: 'languid male vocal', tempo: 'slow 70-90 BPM', moods: 'sensual, sultry' }).prompt;
  const fast = songWriting({ ...b, vocal: 'male tenor', tempo: 'fast 130-150 BPM', moods: 'explosive energy' }).prompt;
  const calmButLoud = songWriting({ ...b, vocal: 'v', tempo: 'mid tempo', moods: 'dark and intense, explosive energy' }).prompt;
  ok(slow.includes('Low and Close'), '느리고 관능적인 곡 → 낮고 가깝게');
  ok(!slow.includes('Full Energy From The First Bar'), '느린 곡엔 full energy 를 안 붙임');
  ok(slow.includes('low and close rather than loud'), '스타일 문장도 따라 바뀜');
  ok(fast.includes('Full Energy From The First Bar'), '빠르고 터지는 곡 → 그대로 최대 에너지');
  ok(calmButLoud.includes('Full Energy From The First Bar'), '에너지 단어가 있으면 터뜨리는 쪽 우선');
}

console.log('\nD. 빌런 도망 목록에 영어 예시:');
{
  const { PERSONAS } = await import(appUrl('js/prompts.js'));
  const g = PERSONAS.villain.guide;
  ok(g.includes('you do the same to me'), '변명의 영어 예시가 있음');
  ok(g.includes("it's the only way we feel free"), '합리화의 영어 예시가 있음');
  ok(g.includes('특히 브릿지에서 자주 나옵니다'), '브릿지를 특히 경계하게 함');
}

console.log('\nE. 반대 성별 보컬 자동 제외:');
{
  const b = { genres: 'x', language: 'English', tempo: 't', moods: 'm', era: 'e', instruments: 'i', concept: 'c', songCount: 1 };
  ok(songWriting({ ...b, vocal: 'languid male vocal' }).prompt.includes('female vocals 를 반드시'), '남성 → female vocals 제외');
  ok(songWriting({ ...b, vocal: 'detached female vocal' }).prompt.includes('male vocals 를 반드시'), '여성 → male vocals 제외');
  const duet = songWriting({ ...b, vocal: 'male and female duet' }).prompt;
  ok(!duet.includes('female vocals 를 반드시') && !duet.includes('male vocals 를 반드시'), '듀엣이면 아무것도 안 뺌');
}

console.log('\nF. 훅이 아닌 말의 반복:');
{
  const lust = `[Verse 1 - x]
I search the dresser but there's nothing there
[Verse 2 - x]
I look in the mirror, see there's nothing there
[Bridge - x]
We build a fire but find nothing there`;
  ok(checkRepeats(lust).issues.some((x) => x.detail.includes('nothing there')), '절·브릿지에 세 번 나오면 잡음');
  const twice = '[Verse 1 - x]\nthere is nothing there\n[Verse 2 - x]\nyou see nothing there';
  ok(checkRepeats(twice).issues.length === 0, '두 번까지는 봐 줌');
  const chorus = '[Chorus - x]\nnothing there\nnothing there\nnothing there';
  ok(checkRepeats(chorus).issues.length === 0, '후렴 안의 반복은 셈에서 뺌');
  const common = '[Verse 1 - x]\nsaid it to me\ngave it to me\nthrew it to me';
  ok(checkRepeats(common).issues.length === 0, "'to me' 같은 흔한 꼬리는 무시");
}

console.log('\n3막 7장:');
{
  ok(ACTS.length === 3 && SCENES.length === 7 && SCENES_HOOK.length === 7, '세 막, 일곱 장 (두 방식 모두)');
  for (const sc of [SCENES, SCENES_HOOK]) {
    ok(sc.every((x, i) => i === 0 || x.act >= sc[i - 1].act), '장이 막 순서대로 놓임');
  }

  const base = {
    genres: 'x', language: 'English', vocal: 'v', tempo: 't', moods: 'm',
    era: 'e', instruments: 'i', concept: 'c', songCount: 1, form: 'threeActs',
  };
  for (const actOpen of ['hook', 'build']) {
    for (const d of ['2:00', '2:30', '3:00', '3:30', '4:00']) {
      const tag = `${actOpen} ${d}`;
      const sec = songStructure({ duration: d, form: 'threeActs', actOpen });
      const nos = sec.map((x) => x[2]);
      ok(
        [1, 2, 3, 4, 5, 6, 7].every((n) => nos.includes(n)) && nos.every((n, i) => i === 0 || n >= nos[i - 1]),
        `${tag} — 1~7장이 모두 있고 순서대로 흐름`
      );
      ok(sec[sec.length - 1][0] === 'Outro', `${tag} — 아웃트로로 닫힘`);
      ok(sec.some(([r]) => r === 'Bridge'), `${tag} — 6장 위기를 맡을 브리지가 있음`);
      ok(sec.filter(([r]) => r === 'Chorus').length >= 2, `${tag} — 전문 후렴이 두 번 이상 (훅의 뜻이 바뀌려면)`);
      if (actOpen === 'hook') {
        ok(/Chorus/.test(sec[0][0]) && /앞 \d줄만/.test(sec[0][1]), `${tag} — 첫 구간이 짧게 자른 후렴(훅)`);
        ok(!sec.some(([r]) => r === 'Intro'), `${tag} — 따로 [Intro] 를 두지 않음`);
      }
      // 마지막 후렴은 [Final Chorus] 로 적으면 검사가 후렴으로 세지 못합니다.
      ok(!sec.some(([r]) => /Final/.test(r)), `${tag} — 'Final Chorus' 같은 검사가 모르는 이름이 없음`);

      const a = targetLines({ duration: d, form: 'threeActs', actOpen });
      const b = targetLines({ duration: d, form: 'standard' });
      ok(Math.abs(a - b) <= 2, `${tag} — 줄 수가 기본 구성과 비슷함 (${a} / ${b})`);

      const p = songWriting({ ...base, duration: d, actOpen }).prompt;
      const last = actOpen === 'hook' ? '7장 귀환' : '7장 절정과 결말';
      ok(p.includes(last) && p.includes('■ 2막 · 대립'), `${tag} — 프롬프트에 막·장 설계도가 들어감`);
    }
  }

  const hook = songWriting({ ...base, duration: '3:30', actOpen: 'hook' }).prompt;
  const build = songWriting({ ...base, duration: '3:30', actOpen: 'build' }).prompt;
  ok(hook.includes('후렴으로 시작하는 곡입니다') && !hook.includes('인트로는 짧게, 길이를 맞춥니다'),
    '훅 먼저 — 콜드 오픈 규칙을 쓰고, 인트로 길이 규칙은 빠짐');
  ok(!build.includes('후렴으로 시작하는 곡입니다') && build.includes('인트로는 짧게'),
    '쌓아 올리기 — 인트로 규칙을 쓰고 콜드 오픈 규칙은 없음');
  ok(hook.includes('막과 장은 설계도입니다'), '막·장 이름을 태그에 쓰지 말라고 함');
  ok(!hook.includes('구간마다 하는 일이 다릅니다'), '기본 구성의 구간 설명과 겹치지 않음');
  ok(!songWriting({ ...base, form: 'standard' }).prompt.includes('3막 7장'), '기본 구성에는 3막 7장 안내가 없음');

  const seed = { title: 'T', scene: 'S', to: 'you', hook: 'H', opening: 'O', soundNote: 'N' };
  const ps = songWriting({ ...base, seed, actOpen: 'build' }).prompt;
  ok(ps.includes('1장 발단') && !ps.includes('이 장면 밖으로 나가지 않습니다'),
    '씨앗의 장면은 1장이 되고, 이야기가 그 밖으로 나아갈 수 있음');
  ok(songWriting({ ...base, seed, actOpen: 'hook' }).prompt.includes('[Verse 1]의 첫 줄'),
    '훅으로 여는 곡 — 씨앗의 첫 줄은 1절 첫 줄로 (곡의 첫 소리는 훅)');
  ok(songWriting({ ...base, form: 'standard', seed }).prompt.includes('이 장면 밖으로 나가지 않습니다'),
    '기본 구성의 씨앗 규칙은 그대로');
}

console.log('\n3막 7장 — 후보(씨앗)와 작사가 같은 이야기를 보는가:');
{
  const sb = { genres: 'dark pop', language: 'English', moods: 'm', concept: 'c' };
  const props = (x) => x.schema.properties.seeds.items.properties;
  ok(!('origin' in props(songSeeds(sb))) && !('twist' in props(songSeeds(sb))), '기본 구성 후보에는 처음·반전 칸이 없음');
  ok('origin' in props(songSeeds({ ...sb, form: 'threeActs', actOpen: 'hook' })), '훅 먼저 후보에는 처음 장면 칸이 있음');
  ok('twist' in props(songSeeds({ ...sb, form: 'threeActs', actOpen: 'build' })), '쌓아 올리기 후보에도 반전 칸이 있음');
  ok(!('origin' in props(songSeeds({ ...sb, form: 'threeActs', actOpen: 'build' }))), '쌓아 올리기는 처음 장면을 따로 받지 않음');
  ok(songSeeds({ ...sb, form: 'threeActs' }).prompt.includes('세 번 다른 뜻으로'), '3막 후보의 훅은 장마다 다르게 읽히는 말로');

  const base = {
    genres: 'x', language: 'English', vocal: 'v', tempo: 't', moods: 'm',
    era: 'e', instruments: 'i', concept: 'c', songCount: 1, form: 'threeActs',
  };
  const seed = {
    title: 'T', scene: '불을 붙이고 물러선다', origin: '같이 장작을 쌓는다', twist: '기름은 상대가 먼저 부어 두었다',
    to: '상대', hook: 'Burn it slow', opening: 'We stacked the wood in rows', soundNote: 'N',
  };
  const hp = songWriting({ ...base, actOpen: 'hook', seed }).prompt;
  ok(hp.includes('결말 장면 (1장 프롤로그 · 7장 귀환): 불을 붙이고'), '훅 먼저 — 후보의 장면은 프롤로그·귀환 자리로');
  ok(hp.includes('처음 장면 (2장): 같이 장작을'), '처음 장면이 2장으로 전달됨');
  ok(hp.includes('6장에서 드러날 사실: 기름은'), '반전이 6장으로 전달됨');
  ok(!hp.includes('이 장면이 **1장 발단**'), '절정 장면을 발단에 놓지 않음');

  // 예전 방식으로 뽑아 둔 후보(처음 장면 없음)도 시간이 꼬이지 않게
  const old = { ...seed, origin: undefined, twist: undefined, opening: 'I dropped the lighter right beside your feet' };
  ok(songWriting({ ...base, actOpen: 'hook', seed: old }).prompt.includes('결말 장면의 말이라면 [Verse 1] 에 쓰지 말고'),
    '처음 장면이 없는 예전 후보 — 절정의 첫 줄을 되돌아간 1절에 넣지 않게 함');

  const bp = songWriting({ ...base, actOpen: 'build', seed: { ...seed, origin: undefined } }).prompt;
  ok(bp.includes('출발 장면 (1장 발단)') && bp.includes('이 장면이 **1장 발단**'), '쌓아 올리기 — 후보의 장면은 1장 발단으로');
}

console.log('\n가사 규칙끼리 부딪히지 않는가:');
{
  const base = {
    genres: 'x', language: 'English', vocal: 'v', tempo: 't', moods: 'm',
    era: 'e', instruments: 'i', concept: 'c', songCount: 1,
  };
  const p = songWriting({ ...base, negativeTags: true, variety: true }).prompt;
  ok(!p.includes('제목이 그대로 들어가는'), '훅에 제목을 넣으라는 규칙이 없음 (제목은 가사 문장을 쓰지 말라는 규칙과 충돌)');
  ok(!p.includes('최소치'), '줄 수를 "최소치"라고 하지 않음 (구성표의 "정확히"와 충돌)');
  ok(!p.includes('[no repeated chorus]'), '[no repeated chorus] 를 넣지 않음 (후렴 전문 반복 규칙과 충돌)');
  ok(!/페이드아웃\)/.test(p), '변화 주기에 페이드아웃이 없음 (Final 한 방으로 닫는 규칙과 충돌)');
  ok(p.includes('스타일에 인트로 이야기를 넣지 않았는가'), '인트로를 스타일에 안 넣는 설정이면 점검표도 그렇게');
  ok(songWriting({ ...base, introInStyle: true }).prompt.includes('곡이 어떻게 시작하는지가 적혀 있고'), '넣는 설정이면 점검표가 확인');
  const acts = songWriting({ ...base, form: 'threeActs', actOpen: 'hook' }).prompt;
  ok(!/5장에서는 깨달음/.test(acts) && acts.includes('결말은 교훈이 아니라 장면'),
    '3막 7장이 깨달음·교훈으로 닫으라고 하지 않음 (화자 설정의 "정리하지 말 것"과 충돌)');
  const both = songWriting({ ...base, minimal: true, density: 'rich' }).prompt;
  ok(both.includes('말을 아껴 여백이') && !both.includes('이미지가 촘촘하게'), '여백 + 촘촘하게를 같이 고르면 여백 쪽으로 맞춤');
  const slow = songWriting({ ...base, form: 'threeActs', actOpen: 'hook', tempo: 'slow 70-90 BPM', moods: 'calm' }).prompt;
  ok(slow.includes('같은 자리에 [Instrumental Break] 를 씁니다'), '느린 곡은 댄스 브레이크 대신 간주');
  for (const density of ['light', 'normal', 'rich']) {
    ok(songWriting({ ...base, density }).prompt.includes('════════ 가사의 밀도'), `가사 밀도(${density})가 프롬프트에 실림`);
  }
}

console.log('\n훅 검사 — 훅으로 여는 곡:');
{
  const H = 'Lights out on me';
  const full = [H, 'you said the city never sleeps', 'I counted every car that passed', 'the meter running on the street', H].join('\n');
  const cold = [H, 'you said the city never sleeps', 'I counted every car that passed'].join('\n');
  const v = 'walked to the gate with my shoes untied\nthe guard just nodded and looked away';
  const song = `[Chorus - Cold Open]\n${cold}\n[Verse 1 - x]\n${v}\n[Chorus - x]\n${full}\n[Outro - Final Hit]\nend`;
  const r = checkHook(song);
  ok(r.kind === 'line' && r.hook === H, '짧게 자른 첫 후렴 뒤의 전문 후렴에서 훅을 찾음', ` ("${r.hook}")`);
  ok(!r.issues.length, '훅으로 잘 열었으면 지적하지 않음');
  const miss = song.replace(`[Chorus - Cold Open]\n${H}`, '[Chorus - Cold Open]\nsomething else first');
  ok(checkHook(miss).issues.some((x) => x.kind === 'cold-open-miss'), '첫 소리가 훅이 아니면 알려 줌');
}

console.log('\n예상 길이:');
{
  const { estimateDuration } = await import(appUrl('js/lyrics.js'));
  const lines = Array(10).fill('I walk the line tonight under rain').join('\n');
  const plain = estimateDuration(`[Verse 1 - x]\n${lines}`).seconds;
  const withBreak = estimateDuration(`[Verse 1 - x]\n${lines}\n[Dance Break - Heavy Bass]\n[Instrumental Solo - Guitar]`).seconds;
  ok(withBreak - plain === 40, '댄스 브레이크(15초)·간주(25초)를 길이에 더함', ` (+${withBreak - plain}초)`);
  const ko = estimateDuration('[Verse 1]\n너를 기다렸어 baby baby baby').syllables;
  ok(ko === 6 + 4, '한국어 가사에 섞인 영어도 음절로 셈', ` (${ko})`);
}

console.log('\n줄 수 계산 — 포스트코러스:');
{
  const t = targetLines({ duration: '3:30', form: 'threeActs', actOpen: 'hook' });
  // 콜드4 + V5 + P3 + C5 + Post4 + V4 + P3 + C5(반복) + B4 + C5+1(반복) + O4 = 47
  ok(t === 47, '포스트코러스 줄 수가 후렴 반복 계산을 덮어쓰지 않음', ` (${t})`);
}

console.log(failed ? `\n${failed}개 항목이 실패했습니다.` : '\n모두 통과.');
process.exit(failed ? 1 : 0);
