import { T } from './capcut-template.js';
import { toMicros, toSrtTime } from './audio.js';

/* 캡컷은 대문자 UUID를 씁니다. */
function uid() {
  return crypto.randomUUID().toUpperCase();
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/** 정지 이미지의 고정 길이 — 캡컷이 쓰는 값(3시간) */
const PHOTO_DURATION = 10800000000;

/** 자막 세로 위치. 캡컷이 실제로 기록한 값을 그대로 씁니다. */
export const SUBTITLE_Y = {
  bottom: -0.7069767441860466,
  middle: 0,
  top: 0.72,
};

/** 글자 크기 — font_size와 content의 size는 같은 값이어야 합니다. */
export const FONT_SIZES = {
  small: 4,
  normal: 5,
  large: 7,
  xlarge: 9,
};

/** #RRGGBB → [r,g,b] 0~1 실수 */
function hexToUnit(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/**
 * 자막 재료 하나. 스타일이 content 문자열과 최상위 필드 두 군데에 들어갑니다.
 * 둘이 어긋나면 캡컷이 이상하게 엽니다.
 */
/** 캡컷은 자모 분리 기준 길이로 글자 범위를 셉니다. */
const nfdLen = (s) => s.normalize('NFD').length;

function styleRange(from, to, color, borderColor, size, fontPath) {
  const obj = {
    fill: { content: { solid: { color: hexToUnit(color) }, render_type: 'solid' } },
    range: [from, to],
    strokes: [
      {
        width: 0.1281082183122635,
        mode: 0,
        content: { solid: { color: hexToUnit(borderColor) }, render_type: 'solid' },
      },
    ],
    size,
  };
  if (fontPath) obj.font = { path: fontPath, id: '' };
  return obj;
}

/**
 * 자막 재료 하나.
 * sub를 주면 둘째 줄로 번역을 넣고, 그 줄만 작게·다른 색으로 칠합니다.
 * 스타일이 content 문자열과 최상위 필드 두 군데에 들어가야 캡컷이 제대로 엽니다.
 */
function makeText(main, style, sub = '') {
  const t = clone(T.textMaterial);
  const size = FONT_SIZES[style.size] ?? 5;
  const subSize = Math.max(3, Math.round(size * (style.subScale ?? 0.75)));
  const content = sub ? `${main}\n${sub}` : main;

  const styles = [
    styleRange(0, nfdLen(main), style.textColor, style.borderColor, size, style.fontPath),
  ];
  if (sub) {
    styles.push(
      styleRange(
        nfdLen(main + '\n'),
        nfdLen(content),
        style.subColor || style.textColor,
        style.borderColor,
        subSize,
        style.fontPath
      )
    );
  }

  t.id = uid();
  t.content = JSON.stringify({ styles, text: content });
  t.text_color = style.textColor.toUpperCase();
  t.border_color = style.borderColor.toUpperCase();
  t.font_size = size;
  t.font_path = style.fontPath || '';
  return t;
}

/** 세그먼트에 딸려 붙는 부속 재료들을 만들어 materials에 넣고 id 목록을 돌려줍니다. */
function attachRefs(materials, kinds) {
  const map = {
    speeds: T.speed,
    placeholder_infos: T.placeholderInfo,
    canvases: T.canvas,
    material_animations: T.materialAnimation,
    sound_channel_mappings: T.soundChannelMapping,
    material_colors: T.materialColor,
    vocal_separations: T.vocalSeparation,
    beats: T.beat,
  };
  return kinds.map((k) => {
    const item = clone(map[k]);
    item.id = uid();
    materials[k].push(item);
    return item.id;
  });
}

function makeSegment(base, { materialId, start, duration, refs, sourceStart = 0 }) {
  const s = clone(base);
  s.id = uid();
  s.material_id = materialId;
  s.extra_material_refs = refs;
  s.target_timerange = { start: Math.round(start), duration: Math.round(duration) };
  if (s.source_timerange) {
    s.source_timerange = { start: sourceStart, duration: Math.round(duration) };
  }
  return s;
}

/**
 * 캡컷 프로젝트 JSON 4개를 만듭니다.
 *
 * @param tracks   [{ name, title, duration(초) }]  — 순서대로 이어 붙일 곡
 * @param images   [{ name, width, height }]        — 전체 길이를 균등 분할
 * @param subtitles [{ text, start(초), duration(초) }] | null
 */
export function buildProject({
  projectName,
  folderPath,
  tracks,
  images,
  subtitles,
  style,
  canvas = { width: 1920, height: 1080 },
  srtFileName = null,
}) {
  const totalSec = tracks.reduce((sum, t) => sum + t.duration, 0);
  const totalUs = toMicros(totalSec);
  const now = Date.now();
  const abs = (name) => `${folderPath}/${name}`;

  // 캡컷은 materials에 54개 키가 다 있기를 기대합니다. 비는 것도 빈 배열로 넘깁니다.
  const materials = clone(T.emptyMaterials);

  /* ── 오디오: 앞 곡이 끝나는 지점부터 이어 붙임 ── */
  const audioSegs = [];
  let cursor = 0;
  for (const t of tracks) {
    const mat = clone(T.audioMaterial);
    mat.id = uid();
    mat.name = t.name;
    mat.path = abs(t.name);
    mat.duration = toMicros(t.duration);
    mat.music_id = crypto.randomUUID();
    mat.local_material_id = crypto.randomUUID();
    materials.audios.push(mat);

    const refs = attachRefs(materials, [
      'speeds', 'placeholder_infos', 'beats', 'sound_channel_mappings', 'vocal_separations',
    ]);
    audioSegs.push(
      makeSegment(T.audioSegment, {
        materialId: mat.id,
        start: toMicros(cursor),
        duration: toMicros(t.duration),
        refs,
      })
    );
    cursor += t.duration;
  }

  /* ── 이미지: 전체 길이를 균등 분할 ── */
  const videoSegs = [];
  if (images.length) {
    const each = Math.floor(totalUs / images.length);
    images.forEach((img, i) => {
      const mat = clone(T.videoMaterial);
      mat.id = uid();
      mat.path = abs(img.name);
      mat.material_name = img.name;
      mat.width = img.width;
      mat.height = img.height;
      mat.duration = PHOTO_DURATION;
      materials.videos.push(mat);

      const refs = attachRefs(materials, [
        'speeds', 'placeholder_infos', 'canvases', 'material_animations',
        'sound_channel_mappings', 'material_colors', 'vocal_separations',
      ]);
      // 마지막 장이 반올림 오차를 흡수해 전체 길이가 정확히 맞습니다.
      const duration = i === images.length - 1 ? totalUs - each * (images.length - 1) : each;
      videoSegs.push(
        makeSegment(T.videoSegment, { materialId: mat.id, start: each * i, duration, refs })
      );
    });
  }

  /* ── 자막 ── */
  const textSegs = [];
  for (const sub of subtitles || []) {
    const mat = makeText(sub.text, style, sub.sub || '');
    materials.texts.push(mat);

    const refs = attachRefs(materials, ['material_animations']);
    const seg = makeSegment(T.textSegment, {
      materialId: mat.id,
      start: toMicros(sub.start),
      duration: toMicros(sub.duration),
      refs,
    });
    seg.clip.transform.y = SUBTITLE_Y[style.position] ?? SUBTITLE_Y.bottom;
    textSegs.push(seg);
  }

  /* ── 트랙 ── */
  const tracksOut = [];
  const addTrack = (type, segments, flag, renderIndex) => {
    if (!segments.length) return;
    const tr = clone(T.track);
    tr.id = uid();
    tr.type = type;
    tr.flag = flag;
    tr.segments = segments;
    segments.forEach((s) => (s.track_render_index = renderIndex));
    tracksOut.push(tr);
  };
  addTrack('video', videoSegs, 0, 0);
  addTrack('text', textSegs, 1, 1);
  addTrack('audio', audioSegs, 0, 3);

  /* ── draft_info.json ── */
  const draftId = uid();
  const draftInfo = {
    id: draftId,
    version: 360000,
    new_version: T.newVersion,
    name: '',
    duration: totalUs,
    create_time: Math.floor(now / 1000),
    update_time: Math.floor(now / 1000),
    fps: 30,
    is_drop_frame_timecode: false,
    color_space: 0,
    config: clone(T.config),
    canvas_config: { ratio: 'original', width: canvas.width, height: canvas.height, background: null },
    tracks: tracksOut,
    group_container: null,
    materials,
    keyframes: clone(T.keyframes),
    keyframe_graph_list: [],
    platform: clone(T.platform),
    last_modified_platform: clone(T.last_modified_platform),
    mutable_config: null,
    cover: null,
    retouch_cover: null,
    extra_info: null,
    relationships: [],
    render_index_track_mode_on: true,
    free_render_index_mode_on: false,
    static_cover_image_path: '',
    source: T.source,
    time_marks: null,
    path: '',
    lyrics_effects: [],
    uneven_animation_template_info: clone(T.uneven_animation_template_info),
    draft_type: T.draftType,
    smart_ads_info: clone(T.smart_ads_info),
    function_assistant_info: clone(T.function_assistant_info),
  };

  /* ── draft_meta_info.json ── */
  const metaInfo = clone(T.metaInfo);
  metaInfo.draft_id = draftId;
  metaInfo.draft_name = projectName;
  metaInfo.draft_fold_path = folderPath;
  metaInfo.draft_root_path = folderPath.replace(/\/[^/]+$/, '');
  metaInfo.tm_draft_create = now * 1000;
  metaInfo.tm_draft_modified = now * 1000;
  metaInfo.tm_duration = totalUs;

  const mediaEntries = [
    ...tracks.map((t) => ({
      metetype: 'music', file_Path: abs(t.name), extra_info: t.name,
      duration: toMicros(t.duration), width: 0, height: 0,
    })),
    ...images.map((img) => ({
      metetype: 'photo', file_Path: abs(img.name), extra_info: img.name,
      duration: PHOTO_DURATION, width: img.width, height: img.height,
    })),
  ];

  const sample = T.metaInfo.draft_materials.find((g) => g.type === 0)?.value?.[0] || {};
  const fill = (e) => ({ ...clone(sample), ...e, id: crypto.randomUUID() });

  for (const group of metaInfo.draft_materials) {
    if (group.type === 0) group.value = mediaEntries.map(fill);
    else if (group.type === 2) {
      group.value = srtFileName
        ? [fill({ metetype: 'none', file_Path: abs(srtFileName), extra_info: srtFileName, duration: 0, width: 0, height: 0 })]
        : [];
    } else group.value = [];
  }

  return {
    draft_info: draftInfo,
    draft_meta_info: metaInfo,
    draft_virtual_store: clone(T.virtualStore),
    timeline_layout: clone(T.timelineLayout),
  };
}

/** 자막 목록을 SRT 문자열로 */
export function toSrt(subtitles) {
  return subtitles
    .map((s, i) => `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.start + s.duration)}\n${s.text}\n`)
    .join('\n');
}

/** SRT 파일을 읽어 자막 목록으로 */
export function parseSrt(text, offsetSec = 0) {
  const out = [];
  const blocks = text.replace(/\r/g, '').trim().split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [from, to] = timeLine.split('-->').map((t) => parseSrtTime(t.trim()));
    const body = lines.slice(lines.indexOf(timeLine) + 1).join('\n').trim();
    if (body) out.push({ text: body, start: from + offsetSec, duration: Math.max(0.1, to - from) });
  }
  return out;
}

function parseSrtTime(t) {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(t);
  if (!m) return 0;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
}

/** 이미지 크기 읽기 */
export async function readImageSize(file) {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}


/**
 * 원문 자막에 번역 자막을 붙입니다.
 * 줄 수가 다를 수 있으므로 시간이 가장 많이 겹치는 것끼리 짝지어 줍니다.
 */
export function mergeTranslation(main, translated) {
  if (!translated?.length) return main;

  return main.map((cue) => {
    const from = cue.start;
    const to = cue.start + cue.duration;

    let best = null;
    let bestOverlap = 0;
    for (const t of translated) {
      const overlap = Math.min(to, t.start + t.duration) - Math.max(from, t.start);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = t;
      }
    }
    // 절반 이상 겹칠 때만 같은 줄로 봅니다.
    const enough = bestOverlap > Math.min(cue.duration, best?.duration ?? 0) * 0.4;
    return enough && best ? { ...cue, sub: best.text } : cue;
  });
}
