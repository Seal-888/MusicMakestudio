/**
 * 화면에 보일 버전을 git에서 읽어 js/version.js 에 씁니다.
 *
 * 왜 필요한가:
 * index.html 에 v42 가 손으로 박혀 있었는데, 고칠 때마다 올리는 걸 잊어서
 * 화면만 봐서는 최신인지 알 수 없었습니다. 새 파일을 받았는데 반영이 안 된
 * 건지, 원래 그런 건지 구분이 안 되면 엉뚱한 데서 원인을 찾게 됩니다.
 *
 * 커밋 수를 그대로 버전으로 씁니다. 손댈 일이 없고 항상 올라갑니다.
 *
 * 쓰는 법:
 *   node bump.mjs          (npm test 가 알아서 먼저 돌립니다)
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(process.env.APP_DIR || path.dirname(fileURLToPath(import.meta.url)));

/** git 이 없거나 저장소가 아니어도 앱은 떠야 합니다. */
function git(cmd, fallback) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

const count = git('rev-list --count HEAD', '0');
const hash = git('rev-parse --short HEAD', 'unknown');
const date = git("log -1 --format=%ad --date=format:%Y-%m-%d", new Date().toISOString().slice(0, 10));
const dirty = git('status --porcelain', '') ? true : false;

const version = count === '0' ? 'dev' : `v${count}`;

const body = `// 이 파일은 bump.mjs 가 만듭니다. 직접 고치지 마세요.
export const VERSION = ${JSON.stringify(version)};
export const BUILT = ${JSON.stringify(date)};
export const COMMIT = ${JSON.stringify(hash)};
export const DIRTY = ${dirty};
`;

const out = path.join(ROOT, 'js/version.js');
const before = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
if (before !== body) {
  fs.writeFileSync(out, body);
  console.log(`버전 갱신: ${version} · ${hash} · ${date}${dirty ? ' (저장 안 한 변경 있음)' : ''}`);
} else {
  console.log(`버전 그대로: ${version} · ${hash}`);
}
