/**
 * import 하는 이름이 실제로 export 되어 있는지 확인합니다.
 *
 * 코드를 고치다 보면 참조만 들어가고 정의가 빠지는 일이 있습니다.
 * 문법 검사는 통과하지만 그 화면 전체가 열리지 않습니다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
/** 동적 import는 반드시 file:// URL로 넘겨야 합니다.
 *  상대경로를 그대로 넘기면 Node가 npm 패키지 이름으로 오해합니다. */
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// 브라우저에만 있는 것들을 최소한으로 흉내 냅니다.
// 여기서는 실행 결과가 아니라 "불러와지는지"만 봅니다.
globalThis.location = { origin: 'http://localhost:8383', hash: '' };
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { toggle(){}, add(){}, remove(){} }, addEventListener(){}, appendChild(){} }),
  addEventListener: () => {},
  body: { appendChild(){} },
};
globalThis.window = {
  addEventListener: () => {},
  dispatchEvent: () => {},
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  location: globalThis.location,
  matchMedia: () => ({ matches: false }),
};
globalThis.localStorage = globalThis.window.localStorage;

let bad = 0;
const files = [];
(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    // app.js는 불러오는 즉시 화면을 그리므로 여기서는 빼고,
    // 화면 검사(smoke-test)에서 확인합니다.
    if (e.name === 'node_modules' || e.name === 'vendor' || e.name === 'app.js') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) scan(full);
    else if (e.name.endsWith('.js')) files.push(full);
  }
})(path.join(ROOT, 'js'));

for (const file of files) {
  let mod;
  try {
    mod = await import(pathToFileURL(file).href + `?v=${Date.now()}`);
  } catch (err) {
    console.log(`  ✗ ${path.relative(ROOT, file)}: ${err.message.split('\n')[0]}`);
    bad++;
  }
}

/* ── 라우터와 메뉴가 어긋나지 않는지 ──────────────
 * 화면을 만들어 라우터에 등록해 놓고 메뉴에 넣는 걸 빠뜨리면,
 * 주소로는 열리는데 아무도 찾지 못하는 화면이 됩니다.
 * 실제로 '가사 자막'이 그렇게 한 번 사라졌습니다.
 */
let mismatched = 0;
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

  const table = appjs.slice(appjs.indexOf('const routes = {'), appjs.indexOf('};', appjs.indexOf('const routes = {')));
  const routes = [...table.matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]);
  const menu = [...html.matchAll(/data-page="([a-z]+)"/g)].map((m) => m[1]);

  const noMenu = routes.filter((r) => !menu.includes(r));
  const noRoute = menu.filter((m) => !routes.includes(m));

  if (noMenu.length || noRoute.length) {
    if (noMenu.length) console.error(`✗ 라우터에는 있는데 메뉴에 없는 화면: ${noMenu.join(', ')}`);
    if (noRoute.length) console.error(`✗ 메뉴에는 있는데 라우터에 없는 화면: ${noRoute.join(', ')}`);
    mismatched = noMenu.length + noRoute.length;
  } else {
    console.log(`메뉴와 라우터가 일치합니다 (${routes.length}개 화면).`);
  }
}

console.log(bad ? `\n${bad}개 파일을 불러오지 못했습니다.` : '\n모든 파일이 정상적으로 불러와집니다.');
if (mismatched) console.log(`${mismatched}개 화면이 메뉴와 라우터에서 어긋납니다.`);
process.exit(bad || mismatched ? 1 : 0);
