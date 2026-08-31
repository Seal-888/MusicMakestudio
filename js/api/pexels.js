import { settings } from '../store.js';

const BASE = 'https://api.pexels.com/v1';

async function pexels(path, params) {
  const key = settings.get('pexelsKey');
  if (!key) throw new Error('Pexels 키를 먼저 저장해 주세요. (API 설정)');

  const res = await fetch(`${BASE}/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: key }, // Pexels는 Bearer 없이 키만 넣습니다.
  });

  if (res.status === 401) throw new Error('키가 올바르지 않습니다. 다시 확인해 주세요.');
  if (res.status === 429) throw new Error('시간당 200회 한도를 넘었습니다. 잠시 뒤 다시 시도해 주세요.');
  if (!res.ok) throw new Error(`요청이 실패했습니다 (${res.status})`);

  return res.json();
}

/** 검색어로 가로/세로 사진을 찾습니다. ratio는 '16:9' 또는 '9:16'. */
export async function searchPhotos(query, { perPage = 6, ratio = '16:9' } = {}) {
  const data = await pexels('search', {
    query,
    per_page: perPage,
    orientation: ratio === '9:16' ? 'portrait' : 'landscape',
  });
  return (data.photos || []).map((p) => ({
    id: p.id,
    thumb: p.src.medium,
    full: p.src.original,
    large: p.src.large2x,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    pageUrl: p.url,
  }));
}

export async function testPexels() {
  const data = await pexels('search', { query: 'music', per_page: 1 });
  if (!data.photos) throw new Error('응답 형식이 예상과 다릅니다.');
  return '연결 성공 · 시간당 200회 · 월 20,000회 무료';
}
