/**
 * 유튜브 영상 목록을 숫자로 정리합니다.
 * 레퍼런스 분석 · 채널 분석기 · 수익 분석이 같은 계산을 씁니다.
 *
 * 왜 따로 두었나:
 * 세 화면이 같은 계산을 각자 들고 있어서, 하나를 고치면 나머지가 어긋났습니다.
 */
import { parseDuration } from './api/youtube.js';

const DAY = 86400000;

/**
 * 쇼츠로 볼 길이(초).
 * API가 쇼츠 여부를 알려 주지 않아 길이로 가릅니다.
 * 쇼츠는 3분까지 올라가지만 1~3분짜리 일반 영상(노래 한 곡)과 구분할 수 없어서,
 * 틀림없이 쇼츠인 1분 이하만 쇼츠로 봅니다.
 */
export const SHORT_MAX_SEC = 60;

/**
 * 막 올라온 영상은 조회수가 아직 쌓이는 중입니다.
 * 이보다 어린 영상은 '안 되는 영상'으로 치지 않습니다.
 */
export const YOUNG_DAYS = 7;

/** API 응답의 영상 하나를 쓰기 쉬운 꼴로 */
export function toVideo(v, now = Date.now()) {
  const seconds = parseDuration(v.contentDetails?.duration);
  const publishedMs = new Date(v.snippet.publishedAt).getTime();
  const ageDays = Math.max(1, (now - publishedMs) / DAY);
  const views = +v.statistics?.viewCount || 0;
  return {
    id: v.id,
    title: v.snippet.title,
    views,
    likes: +v.statistics?.likeCount || 0,
    comments: +v.statistics?.commentCount || 0,
    seconds,
    durationText: fmtDuration(seconds),
    published: v.snippet.publishedAt.slice(0, 10),
    publishedMs,
    ageDays: Math.round(ageDays),
    // 오래된 영상일수록 조회수가 많은 건 당연합니다. 하루 평균으로 나눠야 비교가 됩니다.
    perDay: Math.round(views / ageDays),
    isShort: seconds > 0 && seconds <= SHORT_MAX_SEC,
    isYoung: ageDays < YOUNG_DAYS,
  };
}

export function summarize(channel, videos) {
  const views = videos.map((v) => v.views);
  const sorted = [...views].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const dates = videos.map((v) => v.publishedMs).sort((a, b) => b - a);

  const gaps = [];
  for (let i = 0; i < dates.length - 1; i++) gaps.push((dates[i] - dates[i + 1]) / DAY);

  return {
    subscribers: +channel.statistics?.subscriberCount || 0,
    totalVideos: +channel.statistics?.videoCount || 0,
    publishedAt: (channel.snippet?.publishedAt || '').slice(0, 10),
    sampleSize: videos.length,
    shorts: videos.filter((v) => v.isShort).length,
    avgViews: views.reduce((a, b) => a + b, 0) / (views.length || 1),
    medianViews: !sorted.length ? 0 : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    avgDurationText: fmtDuration(videos.reduce((s, v) => s + v.seconds, 0) / (videos.length || 1)),
    avgGapDays: gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : '—',
  };
}

/**
 * 잘 되는 영상 / 안 되는 영상.
 * 누적 조회수로 줄 세우면 상위는 오래된 영상, 하위는 갓 올린 영상으로 채워집니다.
 * 하루 평균 조회수로 세우고, 막 올라온 영상은 하위에서 뺍니다.
 */
export function rankByPerDay(videos, n = 10) {
  const byPerDay = [...videos].sort((a, b) => b.perDay - a.perDay);
  return {
    top: byPerDay.slice(0, n),
    bottom: byPerDay.filter((v) => !v.isYoung).slice(-n).reverse(),
  };
}

/** 프롬프트에 넣을 영상 한 줄 */
export function videoLine(v, i) {
  return (
    `${i + 1}. "${v.title}" · ${v.views.toLocaleString()}회 (하루 ${v.perDay.toLocaleString()}회 · ${v.ageDays}일 전)` +
    ` · ${v.durationText}${v.isShort ? ' · 쇼츠' : ''}`
  );
}

export function fmtDuration(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}시간 ${m}분` : `${m}분 ${s % 60}초`;
}
