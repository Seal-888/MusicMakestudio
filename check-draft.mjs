/** 자동 저장 → 페이지 재진입 → 이어서 하기 가 되는지 봅니다. */
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
/** 동적 import는 반드시 file:// URL로 넘겨야 합니다.
 *  상대경로를 그대로 넘기면 Node가 npm 패키지 이름으로 오해합니다. */
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const dom = new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),
  { url:'http://localhost:8383/', pretendToBeVisual:true });
const { window } = dom;
global.window=window; global.document=window.document;
Object.defineProperty(global,'navigator',{value:window.navigator,configurable:true});
global.location=window.location; global.CustomEvent=window.CustomEvent;
global.Blob=window.Blob; global.URL=window.URL; global.HTMLElement=window.HTMLElement;
const fc={randomUUID:()=>'x'+Math.random().toString(16).slice(2)};
Object.defineProperty(global,'crypto',{value:fc,configurable:true});
Object.defineProperty(window,'crypto',{value:fc,configurable:true});
const store=new Map([['plimusic:settings',JSON.stringify({geminiKey:'K',geminiModel:'g'})]]);
const ls={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
Object.defineProperty(window,'localStorage',{value:ls,configurable:true});
Object.defineProperty(window,'sessionStorage',{value:{getItem:()=>null,setItem(){},removeItem(){}},configurable:true});
global.localStorage=ls; global.sessionStorage=window.sessionStorage;
global.alert=()=>{}; global.confirm=()=>true;
global.fetch=async()=>({ok:true,status:200,json:async()=>({
  candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({songs:[
    {title:'우산',titleAlt:'소매',lyrics:'[Verse]\nline one',style:'A male tenor over dark pop. 96 BPM. The track opens with drums alone.',exclude:'hiss',styleNote:'조용해서'},
  ]})}]}}],usageMetadata:{}})});

let fail=0;
const check=(ok,label)=>{console.log(`  ${ok?'✓':'✗'} ${label}`); if(!ok) fail++;};

// 1) 곡을 만들고 자동 저장되는지
let c = window.document.createElement('div');
window.document.getElementById('view').replaceChildren(c);
let mod = await import(appUrl('js/pages/music.js'));
mod.default(c);
c.querySelector('[data-f=concept]').value = '테스트 주제';
c.querySelector('[data-go]').click();
await new Promise(r=>setTimeout(r,900));
check(c.querySelector('[data-out]').querySelectorAll('[data-lyrics]').length>0, '곡 생성됨');
check(!!store.get('plimusic:draft:music'), '자동 저장됨');

// 2) 가사를 고치면 그것도 저장되는지
const box = c.querySelector('[data-lyrics]');
box.value = '내가 고친 가사';
box.dispatchEvent(new window.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,900));
const d1 = JSON.parse(store.get('plimusic:draft:music'));
check(JSON.stringify(d1).includes('내가 고친 가사'), '고친 가사도 저장됨');

// 3) 나가려 하면 막아 주는지
const { getLeaveGuard } = await import(appUrl('js/ui.js'));
check(!!getLeaveGuard(), '이탈 확인이 걸림');

// 4) 페이지를 새로 열면 이어서 하기가 뜨는지
c = window.document.createElement('div');
window.document.getElementById('view').replaceChildren(c);
mod = await import(appUrl('js/pages/music.js') + '?again=1');
mod.default(c);
const resume = c.querySelector('[data-resume]');
check(!!resume, '이어서 하기 안내가 뜸');

// 5) 눌렀을 때 복구되는지
resume?.click();
await new Promise(r=>setTimeout(r,200));
const restored = c.querySelector('[data-lyrics]')?.value;
check(restored === '내가 고친 가사', '고친 가사 그대로 복구됨');

console.log(fail ? `\n${fail}개 실패` : '\n모두 통과.');
process.exit(fail?1:0);
