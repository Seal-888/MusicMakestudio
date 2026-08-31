/** 레퍼런스를 고르면 옵션이 맞춰지고, 쓰지 않기로 되돌아오는지 봅니다. */
import { JSDOM } from 'jsdom';
import fs from 'fs'; import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
/** 동적 import는 반드시 file:// URL로 넘겨야 합니다.
 *  상대경로를 그대로 넘기면 Node가 npm 패키지 이름으로 오해합니다. */
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const dom = new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),{url:'http://localhost:8383/',pretendToBeVisual:true});
const { window } = dom;
global.window=window; global.document=window.document;
Object.defineProperty(global,'navigator',{value:window.navigator,configurable:true});
global.location=window.location; global.CustomEvent=window.CustomEvent;
global.Blob=window.Blob; global.URL=window.URL; global.HTMLElement=window.HTMLElement;
const fc={randomUUID:()=>'x'+Math.random().toString(16).slice(2)};
Object.defineProperty(global,'crypto',{value:fc,configurable:true});
Object.defineProperty(window,'crypto',{value:fc,configurable:true});

// 재즈 레퍼런스를 미리 심어 둡니다.
const ref={ id:'r1', name:'재즈 플리', source:'소리 분석', summary:'재즈',
  detail:'장르: 재즈', savedAt:Date.now(),
  fields:{ genre:'재즈 보사노바 (Jazz, Bossa Nova)', bpm:'78-84 BPM, 느긋한 그루브',
    vocal:'나른한 여성 보컬, 속삭이듯', instruments:'그랜드 피아노, 색소폰, 베이스 기타',
    mood:'차분하고 나른한 밤의 느낌' }};
const store=new Map([
  ['plimusic:settings',JSON.stringify({geminiKey:'K',geminiModel:'g'})],
  ['plimusic:refs',JSON.stringify([ref])],
]);
const ls={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
Object.defineProperty(window,'localStorage',{value:ls,configurable:true});
Object.defineProperty(window,'sessionStorage',{value:{getItem:()=>null,setItem(){},removeItem(){}},configurable:true});
global.localStorage=ls; global.sessionStorage=window.sessionStorage;
global.alert=()=>{}; global.confirm=()=>true;
global.fetch=async()=>({ok:true,status:200,json:async()=>({})});

const c=window.document.createElement('div');
window.document.getElementById('view').replaceChildren(c);
(await import(appUrl('js/pages/music.js'))).default(c);

const on=(n)=>[...c.querySelectorAll(`[data-pills="${n}"] .pill.on`)].map(p=>p.textContent.trim());
let fail=0;
const check=(ok,label,extra='')=>{console.log(`  ${ok?'✓':'✗'} ${label}${extra}`); if(!ok)fail++;};

console.log('처음 (기본값):');
console.log('  장르:', on('genre').join(', '));
console.log('  보컬:', on('vocal').join(', '));

// 레퍼런스 선택
const radio=[...c.querySelectorAll('input[name=ref]')].find(r=>r.value==='r1');
radio.checked=true; radio.dispatchEvent(new window.Event('change',{bubbles:true}));
await new Promise(r=>setTimeout(r,80));
console.log('\n레퍼런스(재즈) 선택 후:');
console.log('  장르:', on('genre').join(', '));
console.log('  보컬:', on('vocal').join(', '));
console.log('  템포:', on('tempo').join(', '));
console.log('  악기:', on('instrument').join(', '));
console.log('  안내:', c.querySelector('[data-ref-applied]').textContent.trim());
check(on('genre').some(g=>/재즈|보사노바/.test(g)), '장르가 재즈로 바뀜');
check(on('tempo').some(t=>t.includes('70-90')), '템포가 78-84에 맞는 구간으로');
check(on('instrument').some(i=>/피아노|색소폰/.test(i)), '악기가 맞춰짐');
check(!on('genre').includes('다크 팝'), '기본 장르(다크 팝) 꺼짐');

// 쓰지 않기
const none=[...c.querySelectorAll('input[name=ref]')].find(r=>r.value==='');
none.checked=true; none.dispatchEvent(new window.Event('change',{bubbles:true}));
await new Promise(r=>setTimeout(r,80));
console.log('\n"쓰지 않기" 선택 후:');
console.log('  장르:', on('genre').join(', '));
console.log('  안내:', c.querySelector('[data-ref-applied]').textContent.trim());
check(on('genre').includes('다크 팝'), '기본 장르로 되돌아옴');
check(!on('genre').some(g=>/재즈/.test(g)), '재즈가 꺼짐');

console.log(fail?`\n${fail}개 실패`:'\n모두 통과.');
process.exit(fail?1:0);
