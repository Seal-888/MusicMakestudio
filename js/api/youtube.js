import { settings } from '../store.js';

const BASE = 'https://www.googleapis.com/youtube/v3';

async function yt(path, params) {
  const key = settings.get('youtubeKey');
  if (!key) throw new Error('YouTube 키를 먼저 저장해 주세요. (API 설정)');

  const qs = new URLSearchParams({ ...params, key });
  const res = await fetch(`${BASE}/${path}?${qs}`);
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded') throw new Error('오늘 할당량(10,000)을 다 썼습니다. 자정에 초기화됩니다.');
    if (reason === 'keyInvalid') throw new Error('키가 올바르지 않습니다. 다시 확인해 주세요.');
    throw new Error(body?.error?.message || `요청이 실패했습니다 (${res.status})`);
  }
  return body;
}

/** 입력에서 핸들 / 채널ID / 영상ID를 뽑아냅니다. */
export function parseChannelInput(raw) {
  const input = (raw || '').trim();
  if (!input) return null;

  const handle = input.match(/@([\w가-힣.\-_]+)/);
  const channelId = input.match(/(UC[\w-]{22})/);
  const videoId = input.match(/(?:v=|youtu\.be\/|\/shorts\/)([\w-]{11})/);

  if (channelId) return { type: 'id', value: channelId[1] };
  if (videoId) return { type: 'video', value: videoId[1] };
  if (handle) return { type: 'handle', value: handle[1] };
  if (/^[\w가-힣.\-_]+$/.test(input)) return { type: 'handle', value: input };
  return null;
}

/** 핸들·URL·ID 무엇을 넣어도 채널 하나로 정리해 줍니다. */
export async function resolveChannel(raw) {
  const parsed = parseChannelInput(raw);
  if (!parsed) throw new Error('채널 주소를 알아볼 수 없습니다. @핸들 또는 채널 URL을 넣어 주세요.');

  const part = 'snippet,statistics,contentDetails,brandingSettings';

  // 영상 링크면 그 영상의 채널로 넘어갑니다.
  if (parsed.type === 'video') {
    const v = await yt('videos', { part: 'snippet', id: parsed.value });
    const cid = v.items?.[0]?.snippet?.channelId;
    if (!cid) throw new Error('그 영상을 찾을 수 없습니다.');
    parsed.type = 'id';
    parsed.value = cid;
  }

  const params = parsed.type === 'id' ? { id: parsed.value } : { forHandle: '@' + parsed.value };
  let data = await yt('channels', { part, ...params });

  // 핸들로 못 찾으면 검색으로 한 번 더
  if (!data.items?.length && parsed.type === 'handle') {
    const found = await yt('search', { part: 'snippet', type: 'channel', q: parsed.value, maxResults: 1 });
    const cid = found.items?.[0]?.snippet?.channelId;
    if (cid) data = await yt('channels', { part, id: cid });
  }

  const ch = data.items?.[0];
  if (!ch) throw new Error('채널을 찾을 수 없습니다. 주소를 다시 확인해 주세요.');
  return ch;
}

/** 채널의 최근 영상 상세 정보. count는 최대 50 단위로 나눠 부릅니다. */
export async function fetchChannelVideos(channel, count = 50) {
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('업로드 목록을 읽을 수 없는 채널입니다.');

  const ids = [];
  let pageToken;
  while (ids.length < count) {
    const page = await yt('playlistItems', {
      part: 'contentDetails',
      playlistId: uploads,
      maxResults: Math.min(50, count - ids.length),
      ...(pageToken ? { pageToken } : {}),
    });
    ids.push(...(page.items || []).map((i) => i.contentDetails.videoId));
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }

  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = await yt('videos', {
      part: 'snippet,statistics,contentDetails',
      id: ids.slice(i, i + 50).join(','),
    });
    videos.push(...(chunk.items || []));
  }
  return videos;
}

/** ISO 8601 (PT1H2M3S) → 초 */
export function parseDuration(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

export async function testYouTube() {
  const data = await yt('videos', { part: 'id', chart: 'mostPopular', maxResults: 1 });
  if (!data.items?.length) throw new Error('응답이 비어 있습니다.');
  return '연결 성공 · 오늘 남은 할당량으로 채널 약 1,500번 분석 가능';
}
