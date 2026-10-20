import { callGemini } from '../api/gemini.js';
import { resolveChannel, fetchChannelVideos } from '../api/youtube.js';
import { toVideo, summarize, rankByPerDay, YOUNG_DAYS, SHORT_MAX_SEC } from '../videostats.js';
import { channelAnalyzer } from '../prompts.js';
import * as R from '../render.js';

export default function renderAnalyzer(root) {
  root.innerHTML =
    R.header('channel analyzer', '내 채널', '분석기', '공개 데이터로 무엇이 되고 무엇이 안 되는지 짚어 봅니다.') +
    `<div class="card">
      <div class="note">
        <strong>공개 데이터만 봅니다</strong>
        조회수·좋아요·댓글·업로드 패턴은 모두 분석할 수 있지만,
        시청 지속 시간과 구독자 유입 경로는 유튜브가 채널 주인에게만 주는 정보라
        여기서는 볼 수 없습니다. 그건 유튜브 스튜디오에서 확인해 주세요.
      </div>

      <label class="field">
        <span>내 채널 <small>@핸들 · 채널 URL · 영상 URL 다 됩니다</small></span>
        <input type="text" data-f="url" placeholder="예) @내채널이름">
      </label>
      <label class="field">
        <span>분석할 영상 개수 <small><b data-count>50</b>개 · 많을수록 정확하지만 오래 걸립니다</small></span>
        <input type="range" min="10" max="100" step="10" value="50" data-f="count">
      </label>
      <button class="btn is-blue" data-go>내 채널 분석하기</button>
      <div data-out></div>
    </div>`;

  R.wireCopy(root);

  const btn = root.querySelector('[data-go]');
  const out = root.querySelector('[data-out]');
  const range = root.querySelector('[data-f=count]');
  range.addEventListener('input', () => (root.querySelector('[data-count]').textContent = range.value));

  btn.addEventListener('click', () => {
    const url = root.querySelector('[data-f=url]').value.trim();
    if (!url) return alert('채널 주소를 입력해 주세요.');

    R.runTask({
      button: btn,
      output: out,
      working: '채널 데이터 모으는 중',
      task: async () => {
        const channel = await resolveChannel(url);
        const raw = await fetchChannelVideos(channel, +range.value);
        if (!raw.length) throw new Error('공개된 영상이 없습니다.');

        const videos = raw.map((v) => toVideo(v));

        const stats = summarize(channel, videos);
        const analysis = await callGemini(
          channelAnalyzer({
            channel: { name: channel.snippet.title },
            stats,
            videos: videos.slice(0, 40),
          })
        );
        return { channel, videos, stats, analysis };
      },
      onDone: ({ channel, videos, stats, analysis: d }) => {
        const { top, bottom } = rankByPerDay(videos);
        out.innerHTML = `
          <section class="rb">
            <h3>${R.esc(channel.snippet.title)}</h3>
            <dl class="facts">
              <div class="fact"><dt>구독자</dt><dd>${stats.subscribers.toLocaleString()}</dd></div>
              <div class="fact"><dt>총 영상</dt><dd>${stats.totalVideos.toLocaleString()}</dd></div>
              <div class="fact"><dt>평균 조회수</dt><dd>${Math.round(stats.avgViews).toLocaleString()}</dd></div>
              <div class="fact"><dt>중앙값</dt><dd>${Math.round(stats.medianViews).toLocaleString()}</dd></div>
              <div class="fact"><dt>평균 길이</dt><dd>${stats.avgDurationText}</dd></div>
              <div class="fact"><dt>업로드 간격</dt><dd>${stats.avgGapDays}일</dd></div>
            </dl>
            <p class="muted small" style="margin-top:10px">
              평균이 중앙값보다 ${(stats.avgViews / Math.max(1, stats.medianViews)).toFixed(1)}배 큽니다.
              ${stats.avgViews / Math.max(1, stats.medianViews) > 2
                ? '몇 개의 영상이 전체를 끌어올리고 있다는 뜻입니다.'
                : '영상별 성과가 비교적 고른 편입니다.'}
            </p>
          </section>

          ${R.block('지금 상태', R.para(d.summary))}
          ${R.block('잘 되는 것', R.bullets(d.strengths))}
          ${R.block('발목 잡는 것', R.bullets(d.weaknesses))}
          ${R.block('제목', R.para(d.titleInsight))}
          ${R.block('영상 길이', R.para(d.lengthInsight))}
          ${R.block('업로드 주기', R.para(d.uploadInsight))}
          ${R.block('다음에 만들 영상', R.pairs(d.nextVideoIdeas, 'title', 'why'))}
          ${R.block('한 달 실행 계획', R.bullets(d.actionPlan))}

          ${R.block(
            '잘 되는 영상 10개',
            `<p class="muted small">하루 평균 조회수 순입니다. 누적으로 세우면 오래된 영상만 위에 옵니다.</p>
            <ul class="rowlist">${top
              .map(
                (v, i) => `<li class="row"><span class="row-no">${i + 1}</span>
                  <span class="row-name">${R.esc(v.title)}${v.isShort ? ' <small class="muted">쇼츠</small>' : ''}</span>
                  <span class="row-dur">하루 ${v.perDay.toLocaleString()}회 · 누적 ${v.views.toLocaleString()}</span></li>`
              )
              .join('')}</ul>`
          )}
          ${R.block(
            '안 되는 영상 10개',
            `<p class="muted small">올린 지 ${YOUNG_DAYS}일이 안 된 영상은 아직 조회수가 쌓이는 중이라 뺐습니다.</p>
            <ul class="rowlist">${bottom
              .map(
                (v) => `<li class="row"><span class="row-name">${R.esc(v.title)}${v.isShort ? ' <small class="muted">쇼츠</small>' : ''}</span>
                  <span class="row-dur">하루 ${v.perDay.toLocaleString()}회 · 누적 ${v.views.toLocaleString()}</span></li>`
              )
              .join('')}</ul>`
          )}
          ${stats.shorts
            ? `<p class="muted small">${SHORT_MAX_SEC}초 이하 영상 ${stats.shorts}개를 쇼츠로 표시했습니다. 쇼츠는 조회수와 수익 구조가 달라 일반 영상과 따로 보세요.</p>`
            : ''}`;
      },
    });
  });
}
