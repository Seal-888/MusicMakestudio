import { callGemini } from '../api/gemini.js';
import { songWriting, songSeeds, DEFAULT_EXCLUDE, PERSONAS, INTRO_MODES, SONG_FORMS, toMumbling, suggestTitles } from '../prompts.js';
import { toSrt, tidyLyrics, tidyStyle, checkLyrics, checkTitle, estimateDuration, checkStyle, checkHook, fixParentheses, trimStyle, matchOptions, pickBpm } from '../lyrics.js';
import { generateSong, waitForSong, downloadTrack, getTimestampedLyrics, wordsToSubtitles } from '../api/kie.js';
import { settings } from '../store.js';
import { styles, songs, refs, jobs, draft } from '../store.js';
import { toast, setLeaveGuard } from '../ui.js';
import * as R from '../render.js';

const GENRES = [
  ['팝 / 대중음악', [
    ['시티팝', 'city pop'], ['K-pop', 'k-pop'], ['팝', 'pop'], ['인디팝', 'indie pop'],
    ['드림 팝', 'dream pop'], ['신스팝', 'synth pop'], ['발라드', 'ballad'], ['댄스 팝', 'dance pop'],
    ['다크 팝', 'dark pop'], ['얼터너티브 R&B', 'alternative r&b'],
  ]],
  ['힙합 / R&B', [
    ['힙합', 'hip-hop'], ['R&B', 'r&b'], ['소울', 'soul'], ['네오소울', 'neo-soul'],
    ['트랩', 'trap'], ['로파이 힙합', 'lo-fi hip hop'],
  ]],
  ['록 / 밴드', [
    ['록', 'rock'], ['K-록', 'korean rock'], ['인디 록', 'indie rock'],
    ['얼터너티브 록', 'alternative rock'], ['펑크 록', 'punk rock'], ['포크 록', 'folk rock'],
  ]],
  ['일렉트로닉 / 칠', [
    ['로파이', 'lo-fi'], ['칠웨이브', 'chillwave'], ['칠합', 'chillhop'], ['앰비언트', 'ambient'],
    ['신스웨이브', 'synthwave'], ['하우스', 'house'], ['EDM', 'edm'], ['퓨처베이스', 'future bass'],
  ]],
  ['어쿠스틱 / 포크 / 컨트리', [
    ['포크', 'folk'], ['어쿠스틱', 'acoustic'], ['컨트리', 'country'], ['블루스', 'blues'],
  ]],
  ['재즈 / 클래식 / 영화음악', [
    ['재즈', 'jazz'], ['스윙', 'swing'], ['보사노바', 'bossa nova'], ['뉴에이지', 'new age'],
    ['클래식 크로스오버', 'classical crossover'], ['영화음악', 'cinematic orchestral'],
  ]],
  ['신앙 / 명상 / 힐링', [
    ['CCM / 찬양', 'ccm, worship'], ['가스펠', 'gospel'], ['명상 / 치유', 'meditation, healing'],
    ['싱잉볼 명상', 'singing bowl meditation'],
  ]],
  ['합창 / 전통 / 기타', [
    ['합창 / 중창', 'choir, vocal ensemble'], ['트로트', 'korean trot'],
    ['국악 크로스오버', 'gugak fusion, korean traditional crossover'], ['디스코', 'disco'],
    ['레게', 'reggae'], ['라틴', 'latin'], ['이지리스닝', 'easy listening'],
  ]],
  ['어린이 / 특수', [
    ['자장가', 'lullaby'], ['동요', "children's song"], ['캐롤', 'christmas carol'],
  ]],
];

const LANGUAGES = [
  ['한국어', 'Korean'], ['English', 'English'], ['日本語', 'Japanese'], ['中文', 'Chinese'],
  ['Español', 'Spanish'], ['Français', 'French'], ['한+영 혼합', 'Korean+English'],
  ['가사 없음', 'instrumental'],
];

const VOCALS = [
  ['여성 보컬', [
    ['맑고 깨끗한 여성', 'clear pristine female vocal, smooth airy delivery'],
    ['에테리얼 여성', 'ethereal female vocal, floating reverb-drenched'],
    ['감성적인 여성', 'intimate emotive female vocal, breathy delivery'],
    ['파워풀한 여성', 'powerful belting female vocal, wide dynamic range'],
    ['허스키한 여성', 'husky raspy female vocal'],
    ['청량한 소녀', 'bright youthful girl vocal, crisp tone'],
    ['속삭이는 여성', 'whispered female vocal, close-miked'],
    ['재지한 여성', 'jazzy female vocal, smoky phrasing'],
    ['오페라틱 여성', 'operatic soprano vocal'],
  ]],
  ['남성 보컬', [
    ['부드러운 남성', 'warm smooth male vocal, gentle delivery'],
    ['감미로운 미성 남성', 'sweet tender male vocal, high clear tone'],
    ['허스키한 남성', 'husky raspy male vocal, gritty texture'],
    ['파워풀한 남성', 'powerful belting male vocal'],
    ['열정적인 남성', 'passionate soaring male vocal'],
    ['깊고 낮은 남성', 'deep baritone male vocal, controlled and unhurried'],
    ['젊고 날 선 남성', 'young sharp male tenor, cold precise diction, effortless control'],
    ['서늘한 미성 남성', 'smooth cool male vocal, silky upper register, restrained menace'],
    ['나른한 남성', 'languid male vocal, half-spoken delivery, unbothered'],
    ['소년', 'boy soprano vocal'],
    ['재지한 남성', 'jazzy male crooner vocal'],
    ['오페라틱 남성', 'operatic tenor vocal'],
  ]],
  ['랩', [
    ['랩 (남성)', 'male rap vocal'],
    ['랩 (여성)', 'female rap vocal'],
    ['멜로딕 랩', 'melodic rap, sung-rap flow'],
  ]],
  ['합창 / 그룹', [
    ['어린이 합창단', "children's choir"],
    ['어른 혼성 합창단', 'mixed adult choir'],
    ['남녀 듀엣', 'male and female duet vocals'],
    ['남녀 코러스', 'male and female backing chorus'],
    ['가스펠 합창단', 'gospel choir'],
  ]],
  ['특수 / 효과', [
    ['보코더 / 오토튠', 'vocoder, heavy autotune'],
    ['반속삭임', 'half-whispered vocal'],
    ['허밍 / 스캣', 'humming, scat singing'],
    ['가사 없는 연주곡', 'instrumental, no vocals'],
  ]],
];

const TEMPOS = [
  ['아주 느린 (50-70)', 'very slow 50-70 BPM'],
  ['느린 (70-90)', 'slow 70-90 BPM'],
  ['중간 (90-110)', 'mid tempo 90-110 BPM'],
  ['업비트 (110-130)', 'upbeat 110-130 BPM'],
  ['빠른 (130-150)', 'fast 130-150 BPM'],
  ['매우 빠른 (150+)', 'very fast 150+ BPM'],
];

const MOODS = [
  ['잔잔한', 'calm, serene'], ['깊은 슬픔', 'deep sorrow, mournful'],
  ['따스한 위로', 'warm and comforting'], ['에너지 폭발', 'explosive energy, high octane'],
  ['로맨틱한', 'romantic, tender'], ['웅장한 대서사시', 'epic, grand, cinematic'],
  ['몽환적인', 'dreamy, ethereal'], ['향수를 자극하는', 'nostalgic, wistful'],
  ['설레는', 'fluttering, giddy anticipation'], ['쓸쓸한', 'lonely, melancholic'],
  ['희망찬', 'hopeful, uplifting'], ['신비로운', 'mysterious, enigmatic'],
  ['그루비한', 'groovy, funky'], ['긴장감 있는', 'tense, suspenseful'],
  ['자유로운', 'free-spirited, breezy'], ['애절한', 'aching, plaintive'],
  ['명상적인', 'meditative, contemplative'], ['축제 분위기', 'festive, carnival'],
  ['우울한 새벽', 'bleak pre-dawn, somber'], ['경건하고 은혜로운', 'reverent, graceful'],
  ['순수한 평화', 'pure, peaceful'], ['포근한 구름', 'soft, cloud-like'],
  ['일몰같은', 'sunset-hued, golden hour'], ['우주 같은', 'cosmic, spacey'],
  ['다크하고 강렬', 'dark and intense'], ['관능적', 'sensual, sultry'],
  ['여유로운 위협', 'menacing but composed, unhurried'], ['시원한 바람', 'cool breeze, refreshing'],
  ['강력한 드라이브', 'driving, propulsive'], ['도전적인', 'defiant, bold'],
  ['귀여운', 'cute, playful'], ['엉뚱한', 'quirky, whimsical'],
];

const ERAS = [
  ['현대 (2020s)', 'modern 2020s'], ['2010s', '2010s'], ['2000s', '2000s'],
  ['90s 레트로', '90s retro'], ['80s 레트로', '80s retro synth'], ['70s 빈티지', 'vintage 70s'],
  ['시대 무관', 'timeless'], ['미래적', 'futuristic'],
];

const SITUATIONS = [
  ['유튜브 브이로그 BGM', 'youtube vlog background'], ['게임 방송 배경음', 'gaming stream background'],
  ['공부·집중력 향상', 'study and focus'], ['운동·피트니스', 'workout, fitness'],
  ['숙면·명상', 'sleep, meditation'], ['카페 분위기', 'cafe ambience'],
  ['감성 쇼츠·틱톡', 'short-form video, tiktok'], ['교회 예배·묵상', 'worship, devotional'],
  ['광고 / 홍보 영상', 'commercial, promo video'], ['웨딩 / 기념일', 'wedding, anniversary'],
  ['여행 영상', 'travel video'], ['팟캐스트 인트로', 'podcast intro'],
  ['매장 BGM', 'retail store background'], ['늦은 밤 드라이브', 'late night drive'],
  ['아침 루틴', 'morning routine'], ['파티', 'party'],
  ['비 오는 날', 'rainy day'], ['데이트', 'date night'],
];

const INSTRUMENTS = [
  ['그랜드 피아노', 'grand piano'], ['어쿠스틱 기타', 'acoustic guitar'],
  ['일렉 기타', 'electric guitar'], ['오르골', 'music box'],
  ['색소폰', 'saxophone'], ['바이올린', 'violin'], ['첼로', 'cello'],
  ['싱잉볼', 'singing bowl'], ['신디사이저', 'analog synthesizer'],
  ['베이스 기타', 'bass guitar'], ['어쿠스틱 드럼', 'acoustic drums'],
  ['808 베이스 / 트랩 드럼', '808 bass, trap drums'], ['우쿨렐레', 'ukulele'],
  ['하프', 'harp'], ['플루트', 'flute'], ['트럼펫', 'trumpet'],
  ['오케스트라 스트링', 'orchestral strings'], ['로즈 일렉 피아노', 'rhodes electric piano'],
  ['신스 패드', 'synth pad'], ['카혼 / 퍼커션', 'cajon, percussion'],
];

/** 곡 길이별 구성 미리보기 — 무엇이 만들어질지 눌러보기 전에 보여 줍니다. */
const DURATIONS = [
  ['2:00', '짧게', 'intro → verse → chorus → outro'],
  ['2:30', '컴팩트', 'intro → verse → chorus → verse → chorus → outro'],
  ['3:00', '표준', 'intro → verse → pre → chorus → verse → chorus → outro'],
  ['3:30', '추천', 'intro → verse → pre → chorus → verse → pre → chorus → bridge → chorus → outro'],
  ['4:00', '길게', '3:30 구성 + 간주(Instrumental Solo) 구간 추가'],
];

const opts = (arr) => arr.map(([label, value]) => ({ label, value }));

/**
 * 빌런 플레이리스트를 자주 만들기 때문에 처음부터 그 조합으로 켜 둡니다.
 * 알약을 눌러 언제든 바꿀 수 있고, "기본값으로 되돌리기"로 다시 불러옵니다.
 */
const DEFAULTS = {
  genre: ['dark pop', 'cinematic orchestral', 'trap'],
  // 빌런은 소리를 지를 때보다 여유로울 때 위협적입니다.
  // 다만 저음만 쓰면 나이 든 인상이 되므로, 젊고 날 선 음색을 기본으로 둡니다.
  vocal: 'young sharp male tenor, cold precise diction, effortless control',
  language: 'English',
  tempo: 'mid tempo 90-110 BPM',
  mood: [
    'dark and intense',
    'menacing but composed, unhurried', // 소리 지르지 않는 위협감
    'sensual, sultry',
    'epic, grand, cinematic',
    'mysterious, enigmatic',
  ],
  era: 'modern 2020s',
  instrument: ['orchestral strings', 'analog synthesizer', '808 bass, trap drums', 'grand piano'],
  // 곡마다 주제가 다르므로 비워 둡니다. 화자 설정이 빌런 색을 잡아 줍니다.
  concept: '',
  craft: ['rhyme', 'minimal', 'anchor', 'variety'],
  persona: 'villain',
  intro: 'short',
  introWhere: 'tag',
  form: 'standard',
};

export default function renderMusic(root) {
  const group = (items, name, extra = {}) =>
    items
      .map(
        ([label, list]) =>
          `<div class="pill-group"><p class="pill-group-name">${label}</p>${R.pillGroup(name, opts(list), extra)}</div>`
      )
      .join('');

  const savedRefs = refs.all();

  root.innerHTML =
    R.header('ai music lab', '음악', '만들기', '옵션을 골라 가사와 Suno 스타일 프롬프트를 만듭니다.') +
    `<div class="card refbox">
      <span class="card-tag is-gold">레퍼런스 스타일로 만들기</span>
      ${
        savedRefs.length
          ? `<p style="margin-top:0">분석해 둔 레퍼런스의 사운드에 맞춰 가사와 연주 지시를 씁니다.</p>
             <label class="reffirst">
               <input type="checkbox" data-f="refFirst" checked>
               <span><b>레퍼런스를 우선 적용</b>
                 <span class="muted small">아래 장르·보컬·템포 설정과 다르면 레퍼런스 쪽을 씁니다.
                 끄면 아래 설정이 우선이고 레퍼런스는 참고로만 쓰입니다.</span></span>
             </label>
             <div class="reflist">
               ${savedRefs
                 .map(
                   (r) => `<label class="refitem">
                     <input type="radio" name="ref" value="${r.id}">
                     <span>
                       <b>${R.esc(r.name)}</b>
                       <span class="muted small">${R.esc(r.source)} · ${R.esc(r.summary || '')}</span>
                     </span>
                     <button type="button" class="row-x" data-del-ref="${r.id}" title="빼기">✕</button>
                   </label>`
                 )
                 .join('')}
               <label class="refitem">
                 <input type="radio" name="ref" value="" checked>
                 <span><b>쓰지 않기</b><span class="muted small">아래 옵션만으로 만듭니다</span></span>
               </label>
             </div>`
          : `<p style="margin-top:0">아직 저장된 레퍼런스가 없습니다.<br>
             <b>플리채널 기획 → 플리 스타일 분석</b>에서 좋아하는 영상을 분석하고
             <b>"이 스타일로 음악 만들기"</b>를 누르면 여기에 쌓입니다.</p>
             <a class="btn sm is-ghost" href="#/planning">플리 스타일 분석하러 가기</a>`
      }
    </div>

    <div class="card">
      <span class="card-tag is-red">1 · 음악 옵션</span>

      <div class="field">
        <p class="field-label">장르 <small>여러 개 고를 수 있습니다</small></p>
        ${group(GENRES, 'genre', { selected: DEFAULTS.genre })}
        ${R.pillGroup('genre-custom-holder', [], { custom: '직접 입력 (예: 시티팝, 트로트) — 쉼표로 여러 개' })
          .replace('data-pills="genre-custom-holder"', 'data-pills="genre"')}
      </div>

      <div class="field">
        <p class="field-label">가사 언어</p>
        ${R.pillGroup('language', opts(LANGUAGES), {
          multi: false,
          selected: [DEFAULTS.language],
          custom: '직접 입력 (예: Italiano, Português)',
        })}
      </div>

      <div class="field">
        <p class="field-label">화자 <small>누구의 목소리로 부를지 정합니다</small></p>
        ${R.pillGroup('persona', Object.entries(PERSONAS).map(([k, v]) => ({ label: v.label, value: k })), {
          multi: false,
          selected: [DEFAULTS.persona],
        })}
      </div>

      <p class="muted small" data-ref-badge style="margin:0 0 4px"></p>
      <p class="muted small" data-ref-applied style="margin:0 0 14px"></p>

      <div class="field">
        <p class="field-label">곡 구성</p>
        ${R.pillGroup('form', Object.entries(SONG_FORMS).map(([k, v]) => ({ label: v.label, value: k })), {
          multi: false,
          selected: [DEFAULTS.form],
        })}
        <p class="muted small" data-form-note></p>
      </div>

      <div class="field">
        <p class="field-label">인트로 <small>플레이리스트로 이어 들으려면 짧은 쪽이 좋습니다</small></p>
        ${R.pillGroup('intro', Object.entries(INTRO_MODES).map(([k, v]) => ({ label: v.label, value: k })), {
          multi: false,
          selected: [DEFAULTS.intro],
        })}
        <p class="field-label" style="margin:12px 0 8px">인트로를 어디에 적을까요</p>
        ${R.pillGroup('introWhere', [
          { label: '가사 태그에만', value: 'tag' },
          { label: '스타일에도 넣기', value: 'style' },
        ], { multi: false, selected: [DEFAULTS.introWhere] })}
        <p class="muted small">
          <b>가사 태그에만</b> 스타일이 깨끗해서 다른 곡에 다시 써도 인트로가 따라오지 않습니다 ·
          <b>스타일에도 넣기</b> 인트로 지시가 더 확실히 먹히지만, 그 스타일을 재사용하면 같은 인트로가 나옵니다
        </p>
        <p class="muted small">
          짧게 두면 곡마다 길이가 같아 이어 듣기 좋고, 무엇이 먼저 들리는지만 조금씩 달라집니다.
          낱곡으로 들려줄 거면 "곡마다 다르게"가 낫습니다.
        </p>
      </div>

      <div class="field">
        <p class="field-label">작사 방식 <small>여러 개 고를 수 있습니다</small></p>
        ${R.pillGroup('craft', [
          { label: '라임 살리기', value: 'rhyme' },
          { label: '여백 있게 (미니멀)', value: 'minimal' },
          { label: '흘려 부르는 발음', value: 'mumbling' },
          { label: '열쇠말 반복', value: 'anchor' },
          { label: '곡마다 다르게', value: 'variety' },
        ], { selected: DEFAULTS.craft })}
        <p class="muted small">
          <b>라임 살리기</b> 후렴에 각운을 몰아 중독성을 높입니다 ·
          <b>여백 있게</b> 단문 위주로 설명을 걷어냅니다 ·
          <b>흘려 부르는 발음</b> gonna, feelin 처럼 실제 부르는 소리로 적습니다 (영어 가사용) ·
          <b>열쇠말 반복</b> 곡을 관통하는 한마디를 서너 번 되풀이해 기억에 남게 합니다 ·
          <b>곡마다 다르게</b> BPM·후렴 진입·마무리를 곡마다 바꿔 플레이리스트가 지루해지지 않게 합니다
        </p>
      </div>

      <div class="field">
        <p class="field-label">보컬 / 창법</p>
        ${group(VOCALS, 'vocal', { multi: false, selected: [DEFAULTS.vocal] })}
      </div>

      <div class="field">
        <p class="field-label">템포 / BPM</p>
        ${R.pillGroup('tempo', opts(TEMPOS), {
          multi: false,
          selected: [DEFAULTS.tempo],
          custom: '직접 입력 (예: 125 BPM, 점진적 가속)',
        })}
      </div>

      <div class="field">
        <p class="field-label">분위기 / 무드 <small>여러 개 OK</small></p>
        ${R.pillGroup('mood', opts(MOODS), { selected: DEFAULTS.mood, custom: '직접 입력 (예: 비 오는 새벽 감성) — 쉼표로 여러 개' })}
      </div>

      <div class="field">
        <p class="field-label">시대감 / 스타일</p>
        ${R.pillGroup('era', opts(ERAS), {
          multi: false,
          selected: [DEFAULTS.era],
          custom: '직접 입력 (예: 시티팝 감성, 90s K-pop)',
        })}
      </div>

      <div class="field">
        <p class="field-label">사용 용도 / 시청 상황 <small>여러 개 OK · 선택</small></p>
        ${R.pillGroup('situation', opts(SITUATIONS), { custom: '직접 입력' })}
      </div>

      <div class="field">
        <p class="field-label">곡 길이 <small>구조가 자동으로 맞춰집니다</small></p>
        <div class="durations" data-durations>
          ${DURATIONS.map(
            ([d, note, structure]) =>
              `<button type="button" class="dur${d === '3:30' ? ' on' : ''}" data-dur="${d}" data-structure="${R.esc(structure)}">
                <b>${d}</b><span>${note}</span>
              </button>`
          ).join('')}
        </div>
        <p class="dur-note" data-dur-note></p>
      </div>

      <div class="field">
        <p class="field-label">주요 악기 <small>여러 개 OK · 선택</small></p>
        ${R.pillGroup('instrument', opts(INSTRUMENTS), { selected: DEFAULTS.instrument, custom: '추가 요청 (예: 피아노 메인 + 스트링)' })}
      </div>

      <label class="field">
        <span>주제 / 컨셉 <small>필수 · 무엇에 대한 노래인지</small></span>
        <textarea rows="3" data-f="concept" placeholder="예) 오래된 연인과 헤어진 뒤 처음 맞는 봄">${R.esc(DEFAULTS.concept)}</textarea>
      </label>

      <div class="two-col">
        <label class="field">
          <span>가사 밀도</span>
          <select data-f="density">
            <option value="light">간결하게</option>
            <option value="normal" selected>보통</option>
            <option value="rich">풍성하게</option>
          </select>
        </label>
        <label class="field">
          <span>추임새 · 구호</span>
          <select data-f="adlibs">
            <option value="yes" selected>넣기 (Hey! / Let's Go!)</option>
            <option value="no">넣지 않기</option>
          </select>
        </label>
      </div>

      <details class="more">
        <summary>참고 가사 넣기 · 고급 설정</summary>
        <label class="field" style="margin-top:14px">
          <span>참고 가사 <small>마음에 드는 가사를 붙여넣으면 그 형식과 밀도를 따라갑니다. 내용은 안 베낍니다.</small></span>
          <textarea rows="6" data-f="reference" placeholder="[Intro - ...]&#10;(연출 지시)&#10;[Verse 1 - ...]&#10;가사..."></textarea>
        </label>
        <label class="field">
          <span>Suno 억제 태그</span>
          <select data-f="negativeTags">
            <option value="no" selected>넣지 않기 (권장)</option>
            <option value="yes">넣기 ([no humming] 등)</option>
          </select>
          <small class="muted">인트로를 "짧게"나 "전주 없이"로 두면 전주 억제는 자동으로 들어갑니다.
          이 옵션은 허밍·후렴 반복까지 함께 막습니다. 켜면 표현이 다소 밋밋해질 수 있습니다.</small>
        </label>
      </details>

      <label class="field">
        <span>만들 곡 수 <small>곡마다 전용 스타일 프롬프트가 함께 나옵니다</small></span>
        <select data-f="songCount">${[1, 2, 3, 5].map((n) => `<option${n === 5 ? ' selected' : ''}>${n}곡</option>`).join('')}</select>
      </label>

      <div class="style-head">
        <button class="btn is-red" data-seed>후보 먼저 보기</button>
        <button class="btn is-ghost" data-go>바로 전부 만들기</button>
        <button class="btn is-ghost" data-reset>기본값으로 되돌리기</button>
      </div>
      <p class="muted small">후보를 먼저 보면 마음에 드는 것만 완성합니다. 토큰도 덜 씁니다.</p>
      <div data-seed-out></div>
      <div data-out></div>
    </div>`;

  root.querySelectorAll('[data-del-ref]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      refs.remove(b.dataset.delRef);
      b.closest('.refitem').remove();
    })
  );

  /**
   * 도입부 코러스는 후렴부터 시작하므로 인트로 설정이 필요 없습니다.
   * 고른 구성에 맞춰 설명을 바꾸고, 안 쓰는 항목은 흐리게 둡니다.
   */
  /** 알약을 원하는 값들로 켭니다. 없는 값은 무시합니다. */
  function setPills(name, values) {
    if (!values?.length) return false;
    let hit = false;
    root.querySelectorAll(`[data-pills="${name}"] .pill`).forEach((p) => {
      const on = values.includes(p.dataset.value);
      p.classList.toggle('on', on);
      if (on) hit = true;
    });
    return hit;
  }

  /** 기본값으로 되돌립니다. */
  function applyDefaults() {
    for (const [name, want] of Object.entries(DEFAULTS)) {
      if (name === 'concept') {
        root.querySelector('[data-f=concept]').value = DEFAULTS.concept;
        continue;
      }
      setPills(name, Array.isArray(want) ? want : [want]);
    }
  }

  /**
   * 고른 레퍼런스의 분석 값에 맞춰 아래 옵션을 켭니다.
   * 무엇이 바뀌었는지 알려 줘서, 맞지 않으면 직접 고칠 수 있게 합니다.
   */
  function applyReference(ref) {
    const f = ref?.fields;
    if (!f) return [];
    const done = [];

    const genres = matchOptions(f.genre, GENRES.flatMap(([, list]) => list));
    if (setPills('genre', genres)) done.push('장르');

    // 정확히 맞는 음색이 없어도 성별은 맞춰 줍니다. 이게 가장 크게 어긋나는 부분입니다.
    const vocals = matchOptions(f.vocal, VOCALS.flatMap(([, list]) => list));
    let vocalPick = vocals[0];
    if (!vocalPick) {
      const isFemale = /여성|여자|female|소녀/.test(f.vocal);
      const isMale = /남성|남자|male|소년/.test(f.vocal);
      const group = isFemale ? VOCALS[0][1] : isMale ? VOCALS[1][1] : null;
      // 묘사에 가장 가까운 것을 그 성별 안에서 고릅니다.
      if (group) {
        const near = group.find(([label]) =>
          [...label].some((ch) => f.vocal.includes(ch) && ch.length === 1 && /[가-힣]/.test(ch))
        );
        vocalPick = (near || group[0])[1];
      }
    }
    if (vocalPick && setPills('vocal', [vocalPick])) done.push('보컬');

    const bpm = pickBpm(f.bpm);
    if (bpm) {
      // 숫자에 맞는 템포 구간을 고릅니다.
      const band =
        bpm < 70 ? 0 : bpm < 90 ? 1 : bpm < 110 ? 2 : bpm < 130 ? 3 : bpm < 150 ? 4 : 5;
      if (setPills('tempo', [TEMPOS[band][1]])) done.push(`템포 (${bpm} BPM)`);
    }

    const inst = matchOptions(f.instruments, INSTRUMENTS);
    if (setPills('instrument', inst)) done.push('악기');

    const moods = matchOptions(f.mood, MOODS);
    if (setPills('mood', moods)) done.push('분위기');

    return done;
  }

  /** 레퍼런스 우선일 때는 아래 옵션이 참고용이 되므로 흐리게 보여 줍니다. */
  function refreshRefMode() {
    const on = !!pickedRef() && root.querySelector('[data-f=refFirst]')?.checked !== false;
    ['genre', 'vocal', 'tempo', 'era', 'instrument'].forEach((name) => {
      const field = root.querySelector(`[data-pills="${name}"]`)?.closest('.field');
      field?.classList.toggle('is-dimmed', on);
    });
    const badge = root.querySelector('[data-ref-badge]');
    if (badge) {
      badge.textContent = on
        ? '지금은 레퍼런스가 기준입니다. 아래 장르·보컬·템포는 참고로만 쓰입니다.'
        : '';
    }
  }

  root.addEventListener('change', (e) => {
    if (!e.target.matches('input[name=ref], [data-f=refFirst]')) return;

    if (e.target.name === 'ref') {
      const ref = pickedRef();
      const note = root.querySelector('[data-ref-applied]');
      if (ref) {
        const done = applyReference(ref);
        if (note) {
          note.textContent = done.length
            ? `레퍼런스에 맞춰 ${done.join(' · ')}을(를) 바꿨습니다. 직접 고쳐도 됩니다.`
            : '레퍼런스에서 맞출 만한 값을 찾지 못했습니다. 아래에서 직접 골라 주세요.';
        }
      } else {
        // "쓰지 않기" — 기본 설정으로 되돌립니다.
        applyDefaults();
        if (note) note.textContent = '기본 설정으로 되돌렸습니다.';
      }
    }
    refreshRefMode();
  });

  function refreshForm() {
    const key = R.readPills(root, 'form')[0] || 'standard';
    const note = root.querySelector('[data-form-note]');
    if (note) note.textContent = SONG_FORMS[key]?.note || '';

    const introField = root.querySelector('[data-pills="intro"]')?.closest('.field');
    if (introField) {
      const off = key === 'chorusFirst';
      introField.classList.toggle('is-off', off);
      const label = introField.querySelector('.field-label small');
      if (label) {
        label.textContent = off
          ? '도입부 코러스는 후렴부터 시작하므로 이 설정을 쓰지 않습니다'
          : '플레이리스트로 이어 들으려면 짧은 쪽이 좋습니다';
      }
    }
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-pills="form"]')) setTimeout(refreshForm, 0);
  });
  refreshForm();
  refreshRefMode();

  root.querySelector('[data-reset]').addEventListener('click', () => {
    applyDefaults();
    root.querySelectorAll('input[name=ref]').forEach((r) => (r.checked = r.value === ''));
    refreshRefMode();
    toast('기본값으로 되돌렸습니다');
  });


  /* 곡 길이 — 고른 구성을 바로 아래에 보여 줍니다 */
  const durBox = root.querySelector('[data-durations]');
  const durNote = root.querySelector('[data-dur-note]');
  const showStructure = () => {
    const on = durBox.querySelector('.dur.on');
    durNote.textContent = on ? on.dataset.structure : '';
  };
  durBox.addEventListener('click', (e) => {
    const btn = e.target.closest('.dur');
    if (!btn) return;
    durBox.querySelectorAll('.dur').forEach((b) => b.classList.toggle('on', b === btn));
    showStructure();
  });
  showStructure();

  R.wireCopy(root);
  R.wirePills(root);

  const btn = root.querySelector('[data-go]');
  const seedBtn = root.querySelector('[data-seed]');
  const seedOut = root.querySelector('[data-seed-out]');
  const out = root.querySelector('[data-out]');
  const val = (f) => root.querySelector(`[data-f=${f}]`).value;

  // 저장 버튼은 한 번만 연결하고, 최신 결과를 여기에 담아 둡니다.
  let latest = null;

  /**
   * 만든 내용을 자동으로 담아 둡니다.
   * 실수로 페이지를 벗어나도 돌아오면 그대로 이어서 할 수 있습니다.
   * 글자를 칠 때마다 저장하면 느려지므로 잠깐 멈췄을 때 한 번만 씁니다.
   */
  let saveTimer = null;
  function keepDraft() {
    if (!latest) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => draft.set('music', latest), 600);
    // 나가려 하면 한 번 물어봅니다. 자동 저장이 있어도 되돌아오는 수고를 덜어 줍니다.
    setLeaveGuard(`만든 가사 ${latest.data.songs.length}곡이 화면에 있습니다.`);
  }

  // 지난번에 하던 것이 남아 있으면 이어서 할지 물어봅니다.
  const saved = draft.get('music');
  if (saved?.value?.data?.songs?.length) {
    const when = new Date(saved.savedAt);
    const ago = Math.round((Date.now() - saved.savedAt) / 60000);
    const banner = document.createElement('div');
    banner.className = 'note resume';
    banner.innerHTML = `
      <strong>이어서 하던 작업이 있습니다</strong>
      ${saved.value.data.songs.length}곡 · ${
        ago < 1 ? '방금' : ago < 60 ? `${ago}분 전` : when.toLocaleString('ko-KR')
      }
      <div class="style-head" style="margin-top:9px">
        <button class="btn sm is-gold" data-resume>이어서 하기</button>
        <button class="btn sm is-ghost" data-drop-draft>지우기</button>
      </div>`;
    root.insertBefore(banner, root.querySelector('.refbox'));

    banner.querySelector('[data-resume]').addEventListener('click', () => {
      latest = saved.value;
      banner.remove();
      paintResult(latest.data);
      out.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
    banner.querySelector('[data-drop-draft]').addEventListener('click', () => {
      draft.clear('music');
      banner.remove();
    });
  }
  out.addEventListener('click', (e) => {
    if (!latest) return;

    const si = e.target.dataset.saveStyle;
    if (si !== undefined) {
      const song = latest.data.songs[+si];
      styles.add({
        label: song.title,
        prompt: song.style,
        genres: latest.genres,
        exclude: song.exclude,
      });
      toast('스타일 보관함에 저장했습니다');
    }

    const gi = e.target.dataset.saveSong;
    if (gi !== undefined) {
      const song = latest.data.songs[+gi];
      songs.add({
        title: song.title,
        titleAlt: song.titleAlt,
        lyrics: song.lyrics,
        style: song.style,
        exclude: song.exclude,
        genres: latest.genres,
        duration: latest.duration,
      });
      toast('메타데이터에 저장했습니다');
    }
  });

  /** 만들기 전에 빠진 값이 없는지 봅니다. 문제가 있으면 문구를 돌려줍니다. */
  function missing() {
    if (!R.readPills(root, 'genre').length && !pickedRef()) {
      return '장르를 하나 이상 고르거나, 맨 위에서 레퍼런스를 골라 주세요.';
    }
    if (!root.querySelector('[data-f=concept]').value.trim()) return '주제를 입력해 주세요.';
    return null;
  }

  btn.addEventListener('click', () => {
    const bad = missing();
    if (bad) return alert(bad);
    generate(false);
  });

  seedBtn.addEventListener('click', () => {
    const bad = missing();
    if (bad) return alert(bad);
    showSeeds();
  });

  /**
   * 1단계 — 후보만 짧게 뽑습니다.
   * 가사를 다 쓴 뒤 버리는 대신, 고른 것만 2단계에서 완성합니다.
   */
  function showSeeds() {
    const want = parseInt(val('songCount'), 10) || 5;

    R.runTask({
      button: seedBtn,
      output: seedOut,
      working: `후보 ${want}개 뽑는 중`,
      task: () =>
        callGemini(
          songSeeds({
            genres: R.readPills(root, 'genre').join(', ') || pickedRef()?.summary || '레퍼런스에 맞춰 알아서',
            language: R.readPills(root, 'language')[0] || 'Korean',
            moods: R.readPills(root, 'mood').join(', ') || 'natural',
            concept: root.querySelector('[data-f=concept]').value.trim(),
            persona: R.readPills(root, 'persona')[0] || 'villain',
            seedCount: want,
            avoidTitles: (latest?.data.songs || []).map((x) => x.title),
            referenceStyle: pickedRef()?.detail || null,
          })
        ),
      onDone: (d) => paintSeeds(d.seeds || []),
    });
  }

  function paintSeeds(seeds) {
    if (!seeds.length) {
      seedOut.innerHTML = '<p class="muted">후보를 만들지 못했습니다.</p>';
      return;
    }

    seedOut.innerHTML = `<div class="card">
      <span class="card-tag is-gold">후보 ${seeds.length}개</span>
      <p class="muted small">완성할 후보를 고르세요. 고른 것만 가사와 스타일을 만듭니다.</p>
      ${seeds
        .map(
          (x, i) => `<label class="seed-item">
            <input type="checkbox" data-seed-pick="${i}">
            <div>
              <strong>${R.esc(x.title)}</strong>
              <p class="muted small">${R.esc(x.scene)}${x.to ? ` <b>→ ${R.esc(x.to)}</b>` : ''}</p>
              <p class="seed-line">훅 · ${R.esc(x.hook)}</p>
              <p class="seed-line">첫 줄 · ${R.esc(x.opening)}</p>
              <p class="muted small">${R.esc(x.soundNote)}</p>
            </div>
          </label>`
        )
        .join('')}
      <div class="style-head" style="margin-top:12px">
        <button class="btn is-red" data-seed-go>고른 후보 완성하기</button>
        <button class="btn is-ghost" data-seed-again>후보 다시 뽑기</button>
      </div>
    </div>`;

    seedOut.querySelector('[data-seed-again]').addEventListener('click', showSeeds);
    seedOut.querySelector('[data-seed-go]').addEventListener('click', () => {
      const picked = [...seedOut.querySelectorAll('[data-seed-pick]:checked')].map(
        (el) => seeds[+el.dataset.seedPick]
      );
      if (!picked.length) return alert('완성할 후보를 하나 이상 고르세요.');
      generate(false, picked);
    });
  }

  function pickedRef() {
    const id = root.querySelector('input[name=ref]:checked')?.value;
    return id ? savedRefs.find((r) => r.id === id) : null;
  }

  function generate(append, seedList = null) {
    const genres = R.readPills(root, 'genre');
    const concept = root.querySelector('[data-f=concept]').value.trim();
    const duration = root.querySelector('.dur.on')?.dataset.dur || '3:30';
    const language = R.readPills(root, 'language')[0] || 'Korean';
    // 씨앗을 골랐으면 그 개수만 만듭니다.
    const want = seedList ? seedList.length : append ? 5 : parseInt(val('songCount'), 10) || 5;
    const craft = R.readPills(root, 'craft');
    const button = append ? out.querySelector('[data-more]') : btn;
    const target = append ? out.querySelector('[data-more-out]') : out;

    // 한 번에 여러 곡을 만들면 응답이 길어져 중간에 잘립니다.
    // 두 곡씩 나눠 만들고, 이미 만든 제목을 알려 줘서 겹치지 않게 합니다.
    //
    // 씨앗을 고른 경우에는 한 곡씩 만듭니다.
    // 방향이 이미 정해져 있어 묶어 만들 이유가 없고,
    // 한 번에 한 곡만 쓰면 그 곡에 들어가는 주의가 그만큼 두꺼워집니다.
    const BATCH = seedList ? 1 : 2;
    const rounds = [];
    for (let left = want; left > 0; left -= BATCH) rounds.push(Math.min(BATCH, left));

    const baseOptions = {
      genres: genres.join(', ') || pickedRef()?.summary || '레퍼런스에 맞춰 알아서',
      language,
      vocal: R.readPills(root, 'vocal')[0] || VOCALS[0][1][0][1],
      tempo: R.readPills(root, 'tempo')[0] || TEMPOS[2][1],
      moods: R.readPills(root, 'mood').join(', ') || 'natural',
      era: R.readPills(root, 'era')[0] || ERAS[0][1],
      situations: R.readPills(root, 'situation').join(', '),
      instruments: R.readPills(root, 'instrument').join(', '),
      concept,
      duration,
      density: val('density'),
      adlibs: val('adlibs') === 'yes',
      negativeTags: val('negativeTags') === 'yes',
      reference: root.querySelector('[data-f=reference]').value.trim(),
      referenceStyle: pickedRef()?.detail || null,
      // 레퍼런스를 골랐고 우선 적용이 켜져 있을 때만 레퍼런스가 기준이 됩니다.
      referenceFirst: !!pickedRef() && root.querySelector('[data-f=refFirst]')?.checked !== false,
      rhyme: craft.includes('rhyme'),
      minimal: craft.includes('minimal'),
      mumbling: craft.includes('mumbling'),
      anchor: craft.includes('anchor'),
      persona: R.readPills(root, 'persona')[0] || 'villain',
      variety: craft.includes('variety'),
      introMode: R.readPills(root, 'intro')[0] || 'short',
      introInStyle: R.readPills(root, 'introWhere')[0] === 'style',
      form: R.readPills(root, 'form')[0] || 'standard',
    };

    R.runTask({
      button,
      output: target,
      working: `${want}곡 작사 중`,
      task: async () => {
        const madeSongs = [];
        const already = append ? (latest?.data.songs || []).map((x) => x.title) : [];
        const failures = [];
        const errors = [];

        for (let i = 0; i < rounds.length; i++) {
          target.innerHTML = `<div class="spinner"></div>
            <p>${madeSongs.length} / ${want}곡 완성 · ${
              seedList ? `「${R.esc(seedList[i].title)}」 쓰는 중…` : `다음 ${rounds[i]}곡 만드는 중…`
            }</p>
            <div class="bar"><i style="width:${Math.round((madeSongs.length / want) * 100)}%"></i></div>
            <p class="muted small">나눠서 만들기 때문에 중간에 잘리지 않습니다.</p>`;

          try {
            const d = await callGemini(
              songWriting({
                ...baseOptions,
                songCount: rounds[i],
                seed: seedList ? seedList[i] : null,
                // 이미 만든 곡 수만큼 밀어서, 배치가 달라도 인트로가 겹치지 않게 합니다.
                batchSeed: (append ? (latest?.data.songs.length || 0) : 0) + madeSongs.length,
                avoidTitles: [...already, ...madeSongs.map((x) => x.title)],
              })
            );
            (d.songs || []).forEach((x) => {
              x.lyrics = tidyLyrics(x.lyrics);
              // Suno의 Style 칸은 1000자까지입니다. 넘으면 뒷부분이 잘리므로 미리 줄입니다.
              const cut = trimStyle(tidyStyle(x.style));
              x.style = cut.text;
              if (cut.trimmed) x.styleTrimmed = cut.trimmed;
              madeSongs.push(x);
            });
          } catch (err) {
            failures.push(err.message);
            errors.push(err);
            // 한 묶음이 실패해도 나머지는 계속 만듭니다.
          }
        }

        if (!madeSongs.length) {
          const first = errors[0];
          if (first) throw first; // 원래 오류를 그대로 올려 코드가 유지되게 합니다
          throw new Error('가사를 만들지 못했습니다.');
        }
        return { songs: madeSongs, failures };
      },
      onDone: ({ songs: made, failures }) => {
        if (append && latest) {
          latest.data.songs.push(...made);
        } else {
          latest = {
            data: { songs: made },
            genres: genres.join(', ') || pickedRef()?.name || '',
            duration,
          };
        }
        if (seedList) seedOut.innerHTML = '';
        keepDraft();
        paintResult(latest.data, failures);
      },
    });
  }

  /** 만들어진 곡을 화면에 그립니다. 곡마다 전용 스타일이 함께 붙습니다. */
  function paintResult(d, failures = []) {
    const songs = d.songs || [];

    out.className = '';
    out.innerHTML =
      (failures.length
        ? `<div class="note" style="margin-bottom:16px">
             <strong>일부는 만들지 못했습니다</strong>
             ${failures.length}번 실패했습니다. 아래 "5곡 더 만들기"로 채울 수 있습니다.
             <p class="muted small" style="margin:6px 0 0">${R.esc(failures[0])}</p>
           </div>`
        : '') +
      songs
        .map(
          (song, i) => `<section class="rb songcard">
            <h3>${R.esc(song.title)}</h3>
            <p class="muted small">다른 제목 후보: ${R.esc(song.titleAlt || '')}</p>
            ${lengthBadge(song.lyrics)}
            ${hookBadge(song.lyrics)}

            <div class="style-head">
              ${R.copyBtn(song.lyrics, '가사 복사')}
              ${R.copyBtn(song.title, '제목 복사')}
              <button class="btn sm is-gold" data-save-song="${i}">메타데이터에 저장</button>
              <button class="btn sm is-blue" data-make-song="${i}">🎧 노래 만들기</button>
            </div>
            <div class="style-head" style="margin-top:2px">
              <button class="btn sm is-ghost" data-retitle="${i}">제목 다시 뽑기</button>
              <button class="btn sm is-ghost" data-mumble="${i}">흘려 부르는 발음으로</button>
            </div>
            <div data-tool-out="${i}"></div>

            ${lintBox(song)}
            <div class="lyrics-wrap">
              <textarea class="rb-pre lyrics" data-lyrics="${i}" spellcheck="false">${R.esc(song.lyrics)}</textarea>
              <button class="lyrics-toggle" data-expand="${i}">전체 보기</button>
            </div>
            <p class="muted small">가사를 직접 고칠 수 있습니다. 고친 내용이 저장·복사·노래 만들기에 그대로 쓰입니다.</p>

            <div class="songstyle">
              <div class="style-head">
                <b>이 곡의 Suno 스타일</b>
                ${styleLenBadge(song.style)}
                ${R.copyBtn(song.style || '', '스타일 복사')}
                <button class="btn sm is-gold" data-save-style="${i}">보관함에 저장</button>
              </div>
              ${song.styleNote ? `<p class="muted small">${R.esc(song.styleNote)}</p>` : ''}
              ${song.styleTrimmed
                ? `<p class="muted small">1000자를 넘어서 ${song.styleTrimmed}자를 덜어 냈습니다.
                   조성·템포·보컬·시작 방식은 그대로 두었습니다.</p>`
                : ''}
              ${styleLint(song.style)}
              <pre class="rb-pre">${R.esc(song.style || '')}</pre>

              <div class="style-head" style="margin-top:8px">
                <span class="muted small">Exclude Styles 칸에 넣으세요</span>
                ${R.copyBtn(song.exclude || DEFAULT_EXCLUDE, '피할 요소 복사')}
              </div>
              <pre class="rb-pre">${R.esc(song.exclude || DEFAULT_EXCLUDE)}</pre>
            </div>

            <div class="song-studio" data-studio="${i}"></div>
          </section>`
        )
        .join('') +
      `<div class="more-wrap">
        <button class="btn is-gold" data-more>5곡 더 만들기</button>
        <p class="muted small">이미 만든 제목은 피해서 새로 씁니다.</p>
        <div data-more-out></div>
      </div>`;

    // 가사를 고치면 그 즉시 원본에 반영합니다.
    out.querySelectorAll('[data-lyrics]').forEach((box) => {
      box.addEventListener('input', () => {
        const i = +box.dataset.lyrics;
        if (latest?.data.songs[i]) latest.data.songs[i].lyrics = box.value;
        const copyBtn = box.closest('.rb')?.querySelector('.copy[data-copy]');
        if (copyBtn) copyBtn.dataset.copy = box.value;
        keepDraft();
      });
    });

    out.querySelectorAll('[data-fixparen]').forEach((b) =>
      b.addEventListener('click', () => {
        const card = b.closest('section.rb');
        const area = card.querySelector('[data-lyrics]');
        const i = +area.dataset.lyrics;
        const { text, changed } = fixParentheses(area.value);
        if (!changed.length) return toast('바꿀 것이 없습니다');
        area.value = text;
        latest.data.songs[i].lyrics = text;
        keepDraft();
        toast(`${changed.length}곳을 대괄호로 바꿨습니다`);
        b.closest('li').innerHTML = `바꿈: <span class="muted">${R.esc(changed.slice(0, 3).join(' · '))}</span>`;
      })
    );

    out.querySelectorAll('[data-expand]').forEach((b) =>
      b.addEventListener('click', () => {
        const wrap = b.closest('.lyrics-wrap');
        const open = wrap.classList.toggle('is-open');
        b.textContent = open ? '접기' : '전체 보기';
      })
    );

    out.querySelectorAll('[data-retitle]').forEach((b) =>
      b.addEventListener('click', () => retitle(+b.dataset.retitle))
    );
    out.querySelectorAll('[data-mumble]').forEach((b) =>
      b.addEventListener('click', () => mumbleize(+b.dataset.mumble))
    );
    out.querySelectorAll('[data-make-song]').forEach((b) =>
      b.addEventListener('click', () => openStudio(+b.dataset.makeSong, d))
    );

    out.querySelector('[data-more]').addEventListener('click', () => generate(true));
  }

  /** 스타일이 내가 정한 장르·보컬을 지켰는지 확인해 알려 줍니다. */
  function styleLint(style) {
    const issues = checkStyle(style, {
      genres: R.readPills(root, 'genre'),
      vocal: R.readPills(root, 'vocal')[0] || '',
      tempo: R.readPills(root, 'tempo')[0] || '',
      needOpening: R.readPills(root, 'introWhere')[0] === 'style',
    });
    if (!issues.length) return '';
    return `<div class="lint">
      <b>스타일 손볼 곳</b>
      <ul>${issues.map((x) => `<li>${R.esc(x.label)}: <span class="muted">${R.esc(x.detail)}</span></li>`).join('')}</ul>
    </div>`;
  }

  /**
   * 스타일 프롬프트가 충분히 자세한지 글자 수로 보여 줍니다.
   * Suno는 묘사가 자세할수록 그대로 따라가기 때문에 분량이 곧 품질입니다.
   */
  function styleLenBadge(prompt) {
    const n = (prompt || '').length;
    // Suno의 Style 칸은 1000자까지입니다. 넘으면 뒷부분이 잘립니다.
    const state = n < 400 ? 'short' : n > 1000 ? 'long' : 'ok';
    const note =
      state === 'short' ? ' · 짧습니다' : state === 'long' ? ' · 1000자 초과, 잘립니다' : ' / 1000';
    return `<span class="lenbadge is-${state}">${n}자${note}</span>`;
  }

  /** 가사 분량으로 예상 길이를 보여 줍니다. 목표보다 짧으면 알려 줍니다. */
  function lengthBadge(lyrics) {
    const est = estimateDuration(lyrics);
    if (!est) return '';

    const target = root.querySelector('.dur.on')?.dataset.dur || '3:30';
    const [tm, ts] = target.split(':').map(Number);
    const targetSec = tm * 60 + ts;
    const ratio = est.seconds / targetSec;

    const mm = Math.floor(est.seconds / 60);
    const ss = String(est.seconds % 60).padStart(2, '0');
    const state = ratio < 0.8 ? 'short' : ratio > 1.25 ? 'long' : 'ok';
    const note =
      state === 'short'
        ? ` · 목표 ${target}보다 짧습니다. 가사를 더 채우면 길어집니다`
        : state === 'long'
          ? ` · 목표 ${target}보다 깁니다`
          : '';

    return `<p class="lenbadge is-${state}">
      ${est.lines}줄 · 예상 ${mm}:${ss}${note}
    </p>`;
  }

  /** 지금 화면에 있는 가사를 가져옵니다. 고친 내용을 반영하기 위해서입니다. */
  function currentLyrics(i) {
    return out.querySelector(`[data-lyrics="${i}"]`)?.value || latest?.data.songs[i]?.lyrics || '';
  }

  /** 가사를 보고 제목 후보를 다시 뽑습니다. */
  function retitle(i) {
    const box = out.querySelector(`[data-tool-out="${i}"]`);
    R.runTask({
      button: out.querySelector(`[data-retitle="${i}"]`),
      output: box,
      working: '제목 뽑는 중',
      task: () =>
        callGemini(
          suggestTitles({
            lyrics: currentLyrics(i),
            language: R.readPills(root, 'language')[0] || 'English',
          })
        ),
      onDone: ({ titles }) => {
        box.innerHTML = `<div class="titlelist">
          ${(titles || [])
            .map(
              (t, n) => `<button class="titlepick" data-pick-title="${i}" data-n="${n}">
                <b>${R.esc(t.title)}</b>
                <span class="muted small">${R.esc(t.why)}</span>
              </button>`
            )
            .join('')}
        </div><p class="muted small">누르면 이 곡의 제목이 바뀝니다.</p>`;

        box.querySelectorAll('[data-pick-title]').forEach((b) =>
          b.addEventListener('click', () => {
            const picked = titles[+b.dataset.n];
            latest.data.songs[i].title = picked.title;
            box.closest('section.rb').querySelector('h3').textContent = picked.title;
            keepDraft();
            toast('제목을 바꿨습니다');
          })
        );
      },
    });
  }

  /** 영어 가사를 실제 부르는 발음으로 바꿔 줍니다. */
  function mumbleize(i) {
    const box = out.querySelector(`[data-tool-out="${i}"]`);
    R.runTask({
      button: out.querySelector(`[data-mumble="${i}"]`),
      output: box,
      working: '발음 바꾸는 중',
      task: () => callGemini(toMumbling({ lyrics: currentLyrics(i) })),
      onDone: ({ lyrics }) => {
        const clean = tidyLyrics(lyrics);
        const area = out.querySelector(`[data-lyrics="${i}"]`);
        area.value = clean;
        latest.data.songs[i].lyrics = clean;
        keepDraft();
        box.innerHTML = '';
        toast('발음 표기로 바꿨습니다');
      },
    });
  }

  /**
   * 훅이 제대로 박혔는지 한눈에 보여 줍니다.
   * 영어 가사는 정독하지 않으면 반복 여부가 안 보이므로 세어서 알려 줍니다.
   */
  function hookBadge(lyrics) {
    const { hook, kind, repeats, issues } = checkHook(lyrics);
    if (!hook) return '';

    const weak = issues.some((x) => x.kind === 'hook-none');
    // 같은 줄이 통째로 되풀이되는지, 짧은 말이 되풀이되는지 구분해 보여 줍니다.
    const shape = kind === 'line' ? '줄' : kind === 'phrase' ? '말' : '';

    return `<p class="hook-badge ${weak ? 'is-weak' : 'is-ok'}">
      ${weak ? '훅 없음' : `훅${shape ? `<i>${shape}</i>` : ''}`}
      <b>${R.esc(hook)}</b>${weak ? '' : `<span>· ${repeats}번</span>`}
    </p>`;
  }

  /** 규칙을 어긴 곳이 있으면 가사 위에 짧게 알려 줍니다. */
  function lintBox(song) {
    const issues = [...checkLyrics(song.lyrics), ...checkHook(song.lyrics).issues];
    const titleIssue = checkTitle(song.title);
    if (!issues.length && !titleIssue) return '';

    return `<div class="lint">
      <b>손볼 곳</b>
      <ul>
        ${titleIssue ? `<li>${R.esc(titleIssue)}</li>` : ''}
        ${issues
          .map(
            (x) => `<li>${R.esc(x.label)}: <span class="muted">${R.esc(x.detail)}</span>${
              x.kind === 'paren'
                ? ' — 소괄호 안은 Suno가 부릅니다. <button class="linkbtn" data-fixparen>대괄호로 바꾸기</button>'
                : ''
            }</li>`
          )
          .join('')}
      </ul>
    </div>`;
  }

  /* ── kie.ai로 실제 노래 만들기 ── */
  function openStudio(index, d) {
    const box = out.querySelector(`[data-studio="${index}"]`);
    if (box.dataset.open === '1') {
      box.dataset.open = '0';
      box.innerHTML = '';
      return;
    }
    box.dataset.open = '1';

    if (!settings.get('kieKey')) {
      box.innerHTML = `<div class="note" style="margin:12px 0 0">
        <strong>kie.ai 키가 없습니다</strong>
        API 설정에서 kie.ai 키를 넣으면 여기서 바로 노래를 만들 수 있습니다.
        지금은 가사와 스타일을 복사해 Suno 웹에 붙여넣어 주세요.
        <p style="margin:9px 0 0"><a class="btn sm is-ghost" href="#/settings">API 설정 열기</a></p>
      </div>`;
      return;
    }

    const song = d.songs[index];
    box.innerHTML = `<div class="studio">
      <p class="muted small" style="margin:0 0 12px">
        이 곡 전용으로 만들어진 스타일을 그대로 씁니다.
      </p>
      <div class="two-col">
        <label class="field"><span>모델</span>
          <select data-s="model">
            <option value="V5">V5 (최신)</option>
            <option value="V4_5PLUS">V4.5+</option>
            <option value="V4_5">V4.5</option>
            <option value="V4">V4</option>
          </select></label>
      </div>
      <div class="two-col">
        <label class="field"><span>보컬 성별 <small>비워 두면 스타일에 맡깁니다</small></span>
          <select data-s="gender">
            <option value="">지정 안 함</option>
            <option value="f">여성</option>
            <option value="m">남성</option>
          </select></label>
        <label class="field"><span>연주곡</span>
          <select data-s="inst">
            <option value="no">가사 있는 노래</option>
            <option value="yes">가사 없이 연주만</option>
          </select></label>
      </div>
      <label class="field"><span>피할 요소 <small>선택 · Suno의 Exclude에 해당</small></span>
        <input type="text" data-s="neg" value="${R.esc(song.exclude || pickedRef()?.negative || DEFAULT_EXCLUDE)}"
          placeholder="예) heavy distortion, rap vocals"></label>

      <p class="muted small">한 번에 2버전이 만들어집니다. 3~4분 걸리고 크레딧 10~20이 듭니다.</p>
      <button class="btn is-blue" data-s="go">이 가사로 노래 만들기</button>
      <div data-s="out"></div>
    </div>`;

    const pick = (n) => box.querySelector(`[data-s=${n}]`);
    const result = pick('out');

    pick('go').addEventListener('click', async () => {
      const btnGo = pick('go');
      const style = song.style || '';
      if (!style) return alert('이 곡의 스타일 프롬프트가 없습니다.');

      btnGo.disabled = true;
      btnGo.textContent = '요청 중…';
      result.className = 'task-state';
      result.innerHTML = `<div class="spinner"></div><p>kie.ai에 요청하는 중…</p>`;

      try {
        const taskId = await generateSong({
          lyrics: song.lyrics,
          style,
          title: song.title.slice(0, 80),
          model: pick('model').value,
          instrumental: pick('inst').value === 'yes',
          negativeTags: pick('neg').value.trim(),
          vocalGender: pick('gender').value,
        });

        btnGo.textContent = '만드는 중…';
        const tracks = await waitForSong(taskId, {
          onTick: (sec, text, partial) => {
            result.innerHTML = `<div class="spinner"></div>
              <p>${R.esc(text)} · ${Math.floor(sec / 60)}분 ${sec % 60}초 지남</p>
              <p class="muted small">보통 3~4분 걸립니다. 이 화면을 닫지 마세요.</p>
              ${(partial || []).length ? `<p class="muted small">${partial.length}개 먼저 완성됨</p>` : ''}`;
          },
        });

        // 나중에 자막을 다시 받을 수 있게 작업 번호를 남겨 둡니다.
        jobs.add({
          taskId,
          title: song.title,
          tracks: tracks.map((t) => ({ id: t.id, title: t.title, duration: t.duration })),
        });

        result.className = '';
        result.innerHTML = tracks
          .map(
            (t, i) => `<div class="track">
              ${t.imageUrl ? `<img class="track-art" src="${t.imageUrl}" alt="">` : ''}
              <div class="track-body">
                <b>${R.esc(t.title)}</b>
                <span class="muted small">버전 ${i + 1} · ${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, '0')}</span>
                <audio controls preload="none" src="${t.audioUrl}"></audio>
              </div>
              <div class="track-btns">
                <button class="btn sm is-gold" data-dl="${i}">MP3 받기</button>
                <button class="btn sm is-ghost" data-srt="${i}">가사 자막 받기</button>
              </div>
            </div>`
          )
          .join('');

        result.querySelectorAll('[data-srt]').forEach((b) =>
          b.addEventListener('click', async () => {
            const t = tracks[+b.dataset.srt];
            b.disabled = true;
            b.textContent = '받는 중…';
            try {
              const words = await getTimestampedLyrics(t.taskId || taskId, t.id);
              const lines = wordsToSubtitles(words);
              if (!lines.length) throw new Error('자막으로 만들 가사가 없습니다.');

              const blob = new Blob(['\uFEFF' + toSrt(lines)], { type: 'text/plain;charset=utf-8' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${(t.title || song.title).replace(/[/\\:*?"<>|]/g, '')}.srt`;
              a.click();
              URL.revokeObjectURL(a.href);
              b.textContent = `자막 ${lines.length}줄 받음`;
              setTimeout(() => (b.textContent = '가사 자막 받기'), 2500);
            } catch (err) {
              alert(err.message);
              b.textContent = '가사 자막 받기';
            }
            b.disabled = false;
          })
        );

        result.querySelectorAll('[data-dl]').forEach((b) =>
          b.addEventListener('click', async () => {
            const t = tracks[+b.dataset.dl];
            b.disabled = true;
            b.textContent = '받는 중…';
            try {
              await downloadTrack(t.audioUrl, `${t.title || song.title}_${+b.dataset.dl + 1}.mp3`);
            } catch {
              window.open(t.audioUrl, '_blank');
            }
            b.disabled = false;
            b.textContent = 'MP3 받기';
          })
        );
      } catch (err) {
        result.className = 'task-state fail';
        result.innerHTML = `<p><strong>실패했습니다.</strong></p><p>${R.esc(err.message)}</p>`;
      } finally {
        btnGo.disabled = false;
        btnGo.textContent = '이 가사로 노래 만들기';
      }
    });
  }
}
