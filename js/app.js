import { health, styles, songs, usage } from './store.js';
import { getLeaveGuard, clearLeaveGuard, toast } from './ui.js';
import renderSettings from './pages/settings.js';
import renderPlanning from './pages/planning.js';
import renderMusic from './pages/music.js';
import renderVideo from './pages/video.js';
import renderMetadata from './pages/metadata.js';
import renderStyles from './pages/styles.js';
import renderTimestamp from './pages/timestamp.js';
import renderCapcut from './pages/capcut.js';
import renderSrt from './pages/srt.js';
import renderVisualizer from './pages/visualizer.js';
import renderAnalyzer from './pages/analyzer.js';
import renderRevenue from './pages/revenue.js';

const routes = {
  settings: renderSettings,
  planning: renderPlanning,
  music: renderMusic,
  video: renderVideo,
  metadata: renderMetadata,
  styles: renderStyles,
  analyzer: renderAnalyzer,
  revenue: renderRevenue,
  srt: renderSrt,
  visualizer: renderVisualizer,
  timestamp: renderTimestamp,
  capcut: renderCapcut,
};

const view = document.getElementById('view');

// 브라우저를 닫거나 새로고침할 때도 한 번 물어봅니다.
window.addEventListener('beforeunload', (e) => {
  if (!getLeaveGuard()) return;
  e.preventDefault();
  e.returnValue = '';
});

function currentPage() {
  const page = location.hash.replace(/^#\/?/, '') || 'settings';
  return routes[page] ? page : 'settings';
}

let lastHash = location.hash;

function render() {
  const page = currentPage();

  // 뒤로가기나 메뉴 클릭으로 나가려 할 때 한 번 물어봅니다.
  const guard = getLeaveGuard();
  if (guard && lastHash !== location.hash) {
    if (!confirm(`${guard}\n\n이 화면을 벗어나시겠습니까?`)) {
      // 원래 있던 화면으로 되돌립니다.
      history.replaceState(null, '', lastHash || '#/settings');
      return;
    }
  }
  clearLeaveGuard();
  lastHash = location.hash;

  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  // 페이지마다 새 컨테이너를 만들어 넘깁니다.
  // 같은 요소를 재사용하면 페이지를 오갈 때마다 리스너가 쌓여서
  // 다중 선택 같은 toggle 동작이 두 번 실행돼 무효가 됩니다.
  view.replaceChildren();
  const container = document.createElement('div');
  view.appendChild(container);
  routes[page](container);
  window.scrollTo(0, 0);
}

function paintStatus() {
  const states = health.all();
  document.querySelectorAll('#status-list li').forEach((li) => {
    li.dataset.state = states[li.dataset.svc] || 'unset';
  });
}

function paintCounts() {
  const map = { styles: styles.all().length, songs: songs.all().length };
  document.querySelectorAll('[data-count]').forEach((el) => {
    el.textContent = map[el.dataset.count] ?? 0;
  });
}

/**
 * 저장이 실패하면 반드시 눈에 보이게 합니다.
 * 예전에는 조용히 넘어가서, 저장한 줄 알았던 곡이 없어져 있었습니다.
 */
window.addEventListener('store:error', (e) => {
  toast(e.detail?.message || '저장하지 못했습니다.');
});

/** 저장 공간이 차오르면 미리 알려 줍니다. 꽉 찬 뒤에 알면 늦습니다. */
function checkUsage() {
  const { ratio } = usage();
  if (ratio < 0.8) return;
  toast(`저장 공간을 ${Math.round(ratio * 100)}% 썼습니다. API 설정에서 백업을 내보내 두세요.`);
}

window.addEventListener('hashchange', render);
window.addEventListener('health:change', paintStatus);
window.addEventListener('store:change', paintCounts);

render();
paintStatus();
paintCounts();
checkUsage();
