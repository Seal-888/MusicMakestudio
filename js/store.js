// 브라우저 localStorage에만 저장됩니다. 어디로도 전송되지 않습니다.
const NS = 'plimusic:';
const OLD_NS = 'anhmusic:'; // 이름을 바꾸기 전에 쓰던 접두사

/**
 * 예전 이름으로 저장해 둔 것을 새 이름으로 한 번만 옮깁니다.
 *
 * localStorage는 키 이름이 다르면 아예 다른 칸입니다.
 * 접두사만 바꾸고 끝냈다면 그동안 만든 곡과 API 키가 전부 사라진 것처럼 보였을 겁니다.
 *
 * 옛 키는 일부러 지우지 않습니다.
 * 옮기다 문제가 생겨도 원래 자리에 그대로 남아 있어야 되돌릴 수 있습니다.
 * 한동안 문제가 없으면 그때 지우면 됩니다.
 */
function migrateFromOldName() {
  try {
    if (localStorage.getItem(NS + 'migrated')) return;

    let moved = 0;
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(OLD_NS)) continue;
      const next = NS + key.slice(OLD_NS.length);
      if (localStorage.getItem(next) !== null) continue; // 새 것이 있으면 덮지 않습니다
      localStorage.setItem(next, localStorage.getItem(key));
      moved++;
    }

    localStorage.setItem(NS + 'migrated', String(Date.now()));
    if (moved) console.info(`[plimusic] 예전 이름으로 저장된 항목 ${moved}개를 옮겼습니다.`);
  } catch (err) {
    // 옮기지 못해도 앱은 떠야 합니다. 빈 상태로 시작할 뿐입니다.
    console.error('[plimusic] 예전 데이터를 옮기지 못했습니다', err);
  }
}

migrateFromOldName();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('저장 실패', err);
    return false;
  }
}

const DEFAULT_SETTINGS = {
  geminiKey: '',
  geminiModel: 'gemini-3.5-flash',
  kieKey: '',
  kieModel: 'V5',
  youtubeKey: '',
  pexelsKey: '',
  capcutUser: '',
};

export const settings = {
  all() {
    return { ...DEFAULT_SETTINGS, ...read('settings', {}) };
  },
  get(field) {
    return this.all()[field];
  },
  set(field, value) {
    const next = this.all();
    next[field] = value;
    return write('settings', next);
  },
  clear(field) {
    return this.set(field, DEFAULT_SETTINGS[field]);
  },
};

// 연결 상태: 'unset' | 'saved' | 'testing' | 'ok' | 'fail'
export const health = {
  all() {
    return read('health', {});
  },
  set(service, state) {
    const next = this.all();
    next[service] = state;
    write('health', next);
    window.dispatchEvent(new CustomEvent('health:change'));
  },
};

export const styles = {
  all() {
    return read('styles', []);
  },
  add(item) {
    const list = this.all();
    list.unshift({ id: crypto.randomUUID(), savedAt: Date.now(), ...item });
    write('styles', list);
    window.dispatchEvent(new CustomEvent('store:change'));
  },
  remove(id) {
    write('styles', this.all().filter((s) => s.id !== id));
    window.dispatchEvent(new CustomEvent('store:change'));
  },
};

/**
 * 작업 중인 내용을 자동으로 담아 두는 자리입니다.
 * 실수로 페이지를 벗어나도 돌아오면 그대로 이어서 할 수 있습니다.
 * 저장 버튼과는 별개로, 마지막 것 하나만 덮어쓰며 보관합니다.
 */
export const draft = {
  get(key) {
    return read('draft:' + key, null);
  },
  set(key, value) {
    write('draft:' + key, { savedAt: Date.now(), value });
  },
  clear(key) {
    try {
      localStorage.removeItem(NS + 'draft:' + key);
    } catch {
      /* 지우지 못해도 넘어갑니다 */
    }
  },
};

/** kie.ai로 만든 노래의 작업 기록. 나중에 자막을 다시 받을 때 씁니다. */
export const jobs = {
  all() {
    return read('jobs', []);
  },
  add(item) {
    const list = this.all().filter((j) => j.taskId !== item.taskId);
    list.unshift({ savedAt: Date.now(), ...item });
    write('jobs', list.slice(0, 50));
    window.dispatchEvent(new CustomEvent('store:change'));
  },
  remove(taskId) {
    write('jobs', this.all().filter((j) => j.taskId !== taskId));
    window.dispatchEvent(new CustomEvent('store:change'));
  },
};

/** 분석해 둔 레퍼런스. 음악 만들기에서 불러다 씁니다. */
export const refs = {
  all() {
    return read('refs', []);
  },
  add(item) {
    const list = this.all();
    list.unshift({ id: crypto.randomUUID(), savedAt: Date.now(), ...item });
    write('refs', list.slice(0, 30));
    window.dispatchEvent(new CustomEvent('store:change'));
  },
  remove(id) {
    write('refs', this.all().filter((r) => r.id !== id));
    window.dispatchEvent(new CustomEvent('store:change'));
  },
};

export const songs = {
  all() {
    return read('songs', []);
  },
  add(item) {
    const list = this.all();
    list.unshift({ id: crypto.randomUUID(), savedAt: Date.now(), ...item });
    write('songs', list);
    window.dispatchEvent(new CustomEvent('store:change'));
  },
  remove(id) {
    write('songs', this.all().filter((s) => s.id !== id));
    window.dispatchEvent(new CustomEvent('store:change'));
  },
};

// 통째로 백업 / 복원 — 브라우저 데이터를 지워도 살아남게
export function exportAll() {
  return JSON.stringify(
    { settings: settings.all(), styles: styles.all(), songs: songs.all(), refs: refs.all(), jobs: jobs.all(), version: 3 },
    null,
    2
  );
}

export function importAll(json) {
  const data = JSON.parse(json);
  if (data.settings) write('settings', data.settings);
  if (data.styles) write('styles', data.styles);
  if (data.songs) write('songs', data.songs);
  if (data.refs) write('refs', data.refs);
  if (data.jobs) write('jobs', data.jobs);
  window.dispatchEvent(new CustomEvent('store:change'));
}
