/**
 * 호출하는 함수가 실제로 정의되어 있는지 확인합니다.
 *
 * 왜 필요한가:
 * 코드를 옮기거나 고치다가 함수 정의만 사라지는 일이 있습니다.
 * 문법 검사는 통과하고, 화면도 그려지지만, 버튼을 누르는 순간 멈춥니다.
 *
 * 쓰는 법:
 *   npm install acorn
 *   APP_DIR=. node check-functions.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as acorn from 'acorn';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
/** 동적 import는 반드시 file:// URL로 넘겨야 합니다.
 *  상대경로를 그대로 넘기면 Node가 npm 패키지 이름으로 오해합니다. */
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/** 매개변수나 구조 분해 안에 숨은 이름을 모두 꺼냅니다. */
function collectNames(node, into) {
  if (!node) return;
  if (node.type === 'Identifier') into.add(node.name);
  else if (node.type === 'ObjectPattern') node.properties.forEach((p) => collectNames(p.value || p.argument, into));
  else if (node.type === 'ArrayPattern') node.elements.forEach((e) => collectNames(e, into));
  else if (node.type === 'AssignmentPattern') collectNames(node.left, into);
  else if (node.type === 'RestElement') collectNames(node.argument, into);
}
let problems = 0;

for (const file of fs.readdirSync(path.join(ROOT, 'js/pages')).concat(
  ['../render.js', '../lyrics.js', '../capcut.js', '../audio.js', '../visualizer.js', '../app.js']
)) {
  const full = path.join(ROOT, 'js/pages', file);
  if (!full.endsWith('.js')) continue;
  const src = fs.readFileSync(full, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2023, sourceType: 'module' });

  // 선언된 이름을 전부 모읍니다.
  const declared = new Set();
  const imported = new Set();
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id) declared.add(node.id.name);
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') declared.add(node.id.name);
    // 함수의 매개변수도 그 안에서는 쓸 수 있는 이름입니다.
    if (node.params) {
      for (const p of node.params) collectNames(p, declared);
    }
    // 구조 분해로 받은 이름도 마찬가지입니다.
    if (node.type === 'VariableDeclarator' && node.id) collectNames(node.id, declared);
    if (node.type === 'CatchClause' && node.param) collectNames(node.param, declared);
    if (node.type === 'ImportSpecifier') imported.add(node.local.name);
    if (node.type === 'ImportDefaultSpecifier') imported.add(node.local.name);
    if (node.type === 'ImportNamespaceSpecifier') imported.add(node.local.name);
    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === 'string') walk(v);
    }
  })(ast);

  // 호출되는 이름 중 어디에도 없는 것을 찾습니다.
  const called = new Set();
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
      called.add(node.callee.name);
    }
    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === 'string') walk(v);
    }
  })(ast);

  const GLOBALS = new Set(['alert','confirm','fetch','parseInt','parseFloat','setTimeout','clearTimeout',
    'setInterval','isNaN','encodeURIComponent','decodeURIComponent','Number','String','Boolean','Array',
    'Object','JSON','Math','Date','Promise','Error','require','import','Blob','URL','btoa','atob',
    'createImageBitmap','structuredClone','queueMicrotask']);

  const missing = [...called].filter(n => !declared.has(n) && !imported.has(n) && !GLOBALS.has(n));
  if (missing.length) {
    console.log(`  ✗ ${file}: 정의를 찾을 수 없는 함수 — ${missing.join(', ')}`);
    problems++;
  }
}
console.log(problems ? `\n${problems}개 파일에 문제가 있습니다.` : '\n모든 함수 호출이 정상입니다.');
process.exit(problems ? 1 : 0);
