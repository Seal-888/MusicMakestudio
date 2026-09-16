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

const { checkHook, splitSections, checkInlineTags, checkOutro, checkLength } = await import(appUrl('js/lyrics.js'));
const { songWriting, songSeeds, targetLines } = await import(appUrl('js/prompts.js'));

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
  ok(seeds.prompt.includes('4~7음절'), '훅 길이를 제한');
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
  ok(!/미워하지 않습니다\.$/m.test(g) || g.includes('해쳤다는 게 더 서늘'), '미워하지 않음을 가해와 함께 씀');

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
    for (const form of ['standard', 'chorusFirst']) {
      const want = targetLines({ duration: d, form });
      const p = songWriting({
        genres: 'x', language: 'English', vocal: 'v', tempo: 't', moods: 'm',
        era: 'e', instruments: 'i', concept: 'c', songCount: 1, duration: d, form,
      }).prompt;
      const said = Number(p.match(/모두 합쳐 (\d+)줄/)?.[1]);
      ok(said === want, `${d} ${form === 'chorusFirst' ? '도입부코러스' : '기본'} — 선언 ${said} = 계산 ${want}`);
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

console.log(failed ? `\n${failed}개 항목이 실패했습니다.` : '\n모두 통과.');
process.exit(failed ? 1 : 0);
