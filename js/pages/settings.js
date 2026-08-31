import { settings, health, exportAll, importAll } from '../store.js';
import { testGemini, listModels } from '../api/gemini.js';
import { testKie } from '../api/kie.js';
import { testYouTube } from '../api/youtube.js';
import { testPexels } from '../api/pexels.js';
import { toast } from '../ui.js';

const SERVICES = [
  {
    id: 'gemini',
    field: 'geminiKey',
    name: 'Gemini',
    required: true,
    sub: '가사·기획·팔레트·SEO·분석 — 이 앱의 엔진입니다',
    facts: [
      ['무료 한도', 'Flash 기준 분당 10회 / 하루 250회'],
      ['발급', '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">AI Studio →</a>'],
      ['형식', 'AIza… 로 시작'],
      ['비용', '무료 한도 안에서는 0원'],
    ],
    test: testGemini,
  },
  {
    id: 'kie',
    field: 'kieKey',
    name: 'kie.ai (Suno)',
    required: false,
    sub: '가사를 실제 노래로 만듭니다 · 안 넣어도 나머지는 다 됩니다',
    facts: [
      ['비용', '1곡당 약 $0.05~0.10'],
      ['발급', '<a href="https://kie.ai" target="_blank" rel="noopener">kie.ai →</a>'],
      ['크레딧', '가입 시 무료 지급 · $5 = 약 50~100곡'],
      ['걸리는 시간', '1곡당 3~4분'],
    ],
    test: testKie,
  },
  {
    id: 'youtube',
    field: 'youtubeKey',
    name: 'YouTube Data API v3',
    required: false,
    sub: '레퍼런스 채널과 내 채널의 공개 데이터를 읽습니다',
    facts: [
      ['무료 한도', '하루 10,000 단위 (자정 초기화)'],
      ['발급', '<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Cloud Console →</a>'],
      ['채널 1개 분석', '약 5~7 단위'],
      ['비용', '완전 무료'],
    ],
    test: testYouTube,
  },
  {
    id: 'pexels',
    field: 'pexelsKey',
    name: 'Pexels',
    required: false,
    sub: '영상 만들기에서 무료 사진을 찾습니다',
    facts: [
      ['무료 한도', '시간당 200회 / 월 20,000회'],
      ['발급', '<a href="https://www.pexels.com/api/" target="_blank" rel="noopener">Pexels API →</a>'],
      ['상업적 사용', '가능 (저작자 표기 권장)'],
      ['비용', '평생 무료'],
    ],
    test: testPexels,
  },
];

function serviceBlock(svc) {
  const saved = settings.get(svc.field);
  return `
    <section class="svc" data-svc="${svc.id}">
      <div class="svc-head">
        <h2>${svc.name}</h2>
        <span class="req ${svc.required ? '' : 'opt'}">${svc.required ? '필수' : '선택'}</span>
      </div>
      <p class="svc-sub">${svc.sub}</p>

      <dl class="facts">
        ${svc.facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
      </dl>

      <div class="key-row">
        <input type="password" data-key-input placeholder="키를 붙여넣으세요"
               value="${saved ? escapeAttr(saved) : ''}" autocomplete="off" spellcheck="false">
        <button class="btn sm is-gold" data-act="reveal">보기</button>
        <button class="btn sm is-blue" data-act="save">저장</button>
        <button class="btn sm is-green" data-act="test">테스트</button>
        <button class="btn sm is-red" data-act="clear">삭제</button>
      </div>

      ${svc.id === 'gemini' ? modelPicker() : ''}

      <div class="result" data-result></div>
    </section>`;
}

function modelPicker() {
  const current = settings.get('geminiModel');
  return `
    <label class="field" style="margin-top:16px">
      <span>사용할 모델
        <small>구글이 예고 없이 모델을 내리는 일이 있습니다. 404가 뜨면 목록을 새로 불러와 다른 모델을 고르세요.</small>
      </span>
      <div class="key-row">
        <select data-model-select>
          <option value="${escapeAttr(current)}">${escapeHtml(current)}</option>
        </select>
        <button class="btn sm is-ghost" data-act="load-models">목록 불러오기</button>
      </div>
    </label>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

export default function renderSettings(root) {
  root.innerHTML = `
    <p class="eyebrow">api settings</p>
    <h1>API <em>설정</em></h1>
    <p class="lede">키를 넣고 연결을 확인하세요. 키는 이 브라우저에만 저장되고 어디로도 전송되지 않습니다.</p>

    <div class="note">
      <strong>Gemini 모델이 2026년 7월에 한 번 정리됐습니다</strong>
      gemini-2.5-flash 계열은 신규 사용자에게 404를 돌려줍니다.
      기본값은 <code>gemini-3.5-flash</code>로 잡아 뒀고, 이것도 막히면
      아래 "목록 불러오기"로 지금 쓸 수 있는 모델을 확인해 바꾸면 됩니다.
    </div>

    ${SERVICES.map(serviceBlock).join('')}

    <section class="card">
      <span class="card-tag">백업</span>
      <p style="margin-top:0">키와 보관함은 이 브라우저에만 있습니다. 브라우저 데이터를 지우면 같이 사라지니,
      가끔 파일로 내려받아 두세요.</p>
      <div class="key-row">
        <button class="btn sm is-gold" data-act="export">파일로 내보내기</button>
        <button class="btn sm is-ghost" data-act="import">파일에서 가져오기</button>
        <input type="file" accept="application/json" hidden data-import-file>
      </div>
    </section>`;

  SERVICES.forEach((svc) => wireService(root, svc));
  wireBackup(root);
}

function wireService(root, svc) {
  const block = root.querySelector(`.svc[data-svc="${svc.id}"]`);
  const input = block.querySelector('[data-key-input]');
  const result = block.querySelector('[data-result]');

  const show = (msg, ok) => {
    result.textContent = msg;
    result.className = `result ${ok ? 'ok' : 'fail'}`;
  };

  block.addEventListener('click', async (e) => {
    const act = e.target.dataset.act;
    if (!act) return;

    if (act === 'reveal') {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      e.target.textContent = hidden ? '가리기' : '보기';
    }

    if (act === 'save') {
      settings.set(svc.field, input.value.trim());
      health.set(svc.id, input.value.trim() ? 'saved' : 'unset');
      show('저장했습니다. 이제 테스트를 눌러 연결을 확인하세요.', true);
      toast(`${svc.name} 키를 저장했습니다`);
    }

    if (act === 'clear') {
      input.value = '';
      settings.clear(svc.field);
      health.set(svc.id, 'unset');
      show('삭제했습니다.', true);
    }

    if (act === 'test') {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = '확인 중';
      health.set(svc.id, 'testing');
      result.textContent = '';
      try {
        settings.set(svc.field, input.value.trim());
        const msg = await svc.test();
        health.set(svc.id, 'ok');
        show(msg, true);
      } catch (err) {
        health.set(svc.id, 'fail');
        show(err.message, false);
      } finally {
        btn.disabled = false;
        btn.textContent = '테스트';
      }
    }

    if (act === 'load-models') {
      const btn = e.target;
      const select = block.querySelector('[data-model-select]');
      btn.disabled = true;
      btn.textContent = '불러오는 중';
      try {
        settings.set(svc.field, input.value.trim());
        const models = await listModels();
        const current = settings.get('geminiModel');
        select.innerHTML = models
          .map((m) => `<option value="${escapeAttr(m)}"${m === current ? ' selected' : ''}>${escapeHtml(m)}</option>`)
          .join('');
        show(`${models.length}개 모델을 불러왔습니다. 목록에 있어도 막힌 모델이 있으니 고른 뒤 테스트해 보세요.`, true);
      } catch (err) {
        show(err.message, false);
      } finally {
        btn.disabled = false;
        btn.textContent = '목록 불러오기';
      }
    }
  });

  const select = block.querySelector('[data-model-select]');
  select?.addEventListener('change', () => {
    settings.set('geminiModel', select.value);
    toast(`모델을 ${select.value}로 바꿨습니다`);
  });
}

function wireBackup(root) {
  const file = root.querySelector('[data-import-file]');

  root.addEventListener('click', (e) => {
    if (e.target.dataset.act === 'export') {
      const blob = new Blob([exportAll()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `anhmusic-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('백업 파일을 내려받았습니다');
    }
    if (e.target.dataset.act === 'import') file.click();
  });

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      importAll(await f.text());
      toast('가져왔습니다. 화면을 새로고침합니다');
      setTimeout(() => location.reload(), 700);
    } catch {
      toast('파일을 읽을 수 없습니다');
    }
  });
}
