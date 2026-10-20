import { resolveChannel, fetchChannelVideos, fetchVideosById, parseChannelInput } from '../api/youtube.js';
import { toVideo, SHORT_MAX_SEC } from '../videostats.js';
import * as R from '../render.js';

/**
 * 광고 단가는 채널 주제·시청자 국적·계절에 따라 몇 배씩 차이가 납니다.
 * 그래서 하나의 숫자가 아니라 범위로 보여 주고, 값을 직접 고칠 수 있게 했습니다.
 */
const RPM_PRESETS = {
  music: { label: '음악 · 플레이리스트', low: 300, mid: 700, high: 1500 },
  general: { label: '일반 콘텐츠', low: 800, mid: 2000, high: 4000 },
  finance: { label: '금융 · 교육 · IT', low: 2000, mid: 5000, high: 12000 },
};

/**
 * 쇼츠 단가. 쇼츠는 광고 수익을 따로 모아 나누는 구조라 일반 영상보다 한참 낮습니다.
 * 일반 영상 단가로 함께 계산하면 쇼츠가 많은 채널의 수익이 몇 배로 부풀어 보입니다.
 */
const SHORTS_RPM = { low: 20, high: 100 };

export default function renderRevenue(root) {
  root.innerHTML =
    R.header('revenue estimator', '수익', '분석', '조회수를 바탕으로 예상 광고 수익의 범위를 계산합니다.') +
    `<div class="card">
      <div class="note">
        <strong>이 숫자는 예측이 아니라 가정에 따른 계산입니다</strong>
        유튜브는 실제 수익을 채널 주인에게만 알려 줍니다. 여기서 하는 일은
        <b>공개 조회수 × 내가 정한 광고 단가</b>를 계산해 보는 것뿐입니다.
        <ul>
          <li>실제 단가는 주제·시청자 국적·계절에 따라 몇 배씩 차이 납니다</li>
          <li>남의 음원을 쓴 영상은 수익이 권리자에게 갈 수 있습니다</li>
          <li>정확한 금액은 유튜브 스튜디오에서만 볼 수 있습니다</li>
        </ul>
      </div>

      <label class="field">
        <span>영상 또는 채널 URL <small>채널을 넣으면 영상들을 합쳐서 계산합니다</small></span>
        <input type="text" data-f="url" placeholder="https://www.youtube.com/watch?v=... 또는 @채널명">
      </label>

      <div class="field">
        <p class="field-label">채널 주제 <small>광고 단가의 기준이 됩니다</small></p>
        ${R.pillGroup(
          'topic',
          Object.entries(RPM_PRESETS).map(([k, v]) => ({ label: v.label, value: k })),
          { multi: false, selected: ['music'] }
        )}
      </div>

      <details class="more">
        <summary>광고 단가 직접 정하기</summary>
        <p class="muted small" style="margin-top:10px">
          RPM은 조회수 1,000회당 받는 금액입니다. 유튜브 스튜디오에서 내 실제 RPM을 확인해
          여기에 넣으면 훨씬 정확해집니다.
        </p>
        <div class="two-col">
          <label class="field"><span>낮게 잡으면 (원/1000회)</span>
            <input type="text" data-f="low" placeholder="300"></label>
          <label class="field"><span>높게 잡으면 (원/1000회)</span>
            <input type="text" data-f="high" placeholder="1500"></label>
        </div>
      </details>

      <button class="btn is-red" data-go>수익 계산하기</button>
      <div data-out></div>
    </div>`;

  R.wireCopy(root);
  R.wirePills(root);

  const btn = root.querySelector('[data-go]');
  const out = root.querySelector('[data-out]');

  btn.addEventListener('click', () => {
    const url = root.querySelector('[data-f=url]').value.trim();
    if (!url) return alert('URL을 입력해 주세요.');
    const parsed = parseChannelInput(url);
    if (!parsed) return alert('주소를 알아볼 수 없습니다.');

    R.runTask({
      button: btn,
      output: out,
      working: '조회수 모으는 중',
      task: async () => {
        // 영상 주소를 넣었으면 그 영상 하나만 계산합니다.
        // 예전에는 영상 주소도 채널로 바꿔 채널 전체를 더했습니다.
        if (parsed.type === 'video') {
          const raw = await fetchVideosById([parsed.value]);
          if (!raw.length) throw new Error('그 영상을 찾을 수 없습니다.');
          const v = raw[0];
          return { channel: { snippet: { title: v.snippet.title }, statistics: {} }, videos: raw.map((x) => toVideo(x)), single: true };
        }
        const channel = await resolveChannel(url);
        const raw = await fetchChannelVideos(channel, 100);
        return { channel, videos: raw.map((x) => toVideo(x)) };
      },
      onDone: ({ channel, videos, single }) => show(channel, videos, single),
    });
  });

  function show(channel, videos, single = false) {
    const preset = RPM_PRESETS[R.readPills(root, 'topic')[0] || 'music'];
    let low = num(root.querySelector('[data-f=low]').value) || preset.low;
    let high = num(root.querySelector('[data-f=high]').value) || preset.high;
    // 한쪽만 고쳐서 낮은 값이 높은 값보다 커지면 바꿔 씁니다.
    if (low > high) [low, high] = [high, low];
    const mid = Math.round((low + high) / 2);
    const sMid = Math.round((SHORTS_RPM.low + SHORTS_RPM.high) / 2);

    const now = Date.now();
    const buckets = single
      ? [['이 영상', videos]]
      : [
          ['최근 30일에 올린 영상', videos.filter((v) => now - v.publishedMs < 30 * 86400000)],
          ['최근 1년에 올린 영상', videos.filter((v) => now - v.publishedMs < 365 * 86400000)],
          ['가져온 영상 전체', videos],
        ];

    const money = (views, rpm) => Math.round((views / 1000) * rpm);
    /** 일반 영상과 쇼츠를 각자의 단가로 계산해 더합니다. */
    const earn = (list, which) => {
      const rpm = { low, mid, high }[which];
      const srpm = { low: SHORTS_RPM.low, mid: sMid, high: SHORTS_RPM.high }[which];
      return list.reduce((s, v) => s + money(v.views, v.isShort ? srpm : rpm), 0);
    };
    const won = (n) => n.toLocaleString('ko-KR') + '원';

    out.innerHTML = `
      <section class="rb">
        <h3>${R.esc(channel.snippet.title)}</h3>
        <p class="muted small">영상 ${videos.length}개의 누적 조회수를 기준으로 계산했습니다.
        ${+channel.statistics.videoCount > videos.length
          ? `채널 전체 ${(+channel.statistics.videoCount).toLocaleString()}개 중 최근 ${videos.length}개만 가져왔습니다.`
          : ''}</p>
      </section>

      ${buckets
        .map(([label, list]) => {
          const views = list.reduce((s, v) => s + v.views, 0);
          const shorts = list.filter((v) => v.isShort);
          if (!list.length) {
            return `<section class="rb"><h3>${label}</h3><p class="muted">해당하는 영상이 없습니다.</p></section>`;
          }
          return `<section class="rb">
            <h3>${label}</h3>
            <p class="muted small">${list.length}개 · 누적 조회수 ${views.toLocaleString()}회${
              shorts.length ? ` · 그중 쇼츠 ${shorts.length}개 (${shorts.reduce((s, v) => s + v.views, 0).toLocaleString()}회)` : ''
            }</p>
            <div class="moneyrow">
              <div class="money"><span>낮게 잡으면</span><b>${won(earn(list, 'low'))}</b></div>
              <div class="money is-mid"><span>중간</span><b>${won(earn(list, 'mid'))}</b></div>
              <div class="money"><span>높게 잡으면</span><b>${won(earn(list, 'high'))}</b></div>
            </div>
          </section>`;
        })
        .join('')}

      <section class="rb">
        <h3>계산 방법</h3>
        <pre class="rb-pre">누적 조회수 ÷ 1,000 × RPM
RPM: ${low.toLocaleString()}원 ~ ${high.toLocaleString()}원 (${preset.label} 기준)
쇼츠 RPM: ${SHORTS_RPM.low}원 ~ ${SHORTS_RPM.high}원 (${SHORT_MAX_SEC}초 이하 영상)</pre>
        <p class="muted small" style="margin-top:10px">
          "최근 30일" 은 <b>그 기간에 올린 영상의 누적 조회수</b>입니다.
          예전에 올린 영상이 지금 벌어들이는 조회수는 포함되지 않고,
          최근에 올린 영상이 앞으로 벌 조회수도 아직 포함되지 않았습니다.
          그래서 실제 그 달의 수익과는 다릅니다. 공개 데이터로는 여기까지가 한계입니다.
        </p>
      </section>

      ${R.block(
        '조회수 상위 10개',
        `<ul class="rowlist">${[...videos]
          .sort((a, b) => b.views - a.views)
          .slice(0, 10)
          .map(
            (v, i) => `<li class="row">
              <span class="row-no">${i + 1}</span>
              <span class="row-name">${R.esc(v.title)}</span>
              <span class="row-dur">${won(money(v.views, v.isShort ? sMid : mid))}</span>
            </li>`
          )
          .join('')}</ul>
         <p class="muted small">중간 단가 기준입니다.</p>`
      )}`;
  }

  function num(v) {
    const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
}
