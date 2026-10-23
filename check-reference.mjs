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
const sent=[];
global.fetch=async(url,opt)=>{
  if(opt?.body) sent.push(JSON.parse(opt.body));
  const schema=opt?.body?JSON.parse(opt.body).generationConfig?.responseSchema:null;
  const body=schema?.properties?.summary
    ? { genre:{pick:['재즈'],why:'w'}, ...(schema.properties.concept?{concept:'늦은 밤 재즈 바에서 혼자 남은 사람'}:{}), summary:'s' }
    : {};
  return {ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]})};
};

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
check(!on('genre').includes('다크 팝'), '다크 팝이 켜져 있지 않음');

// 쓰지 않기
const none=[...c.querySelectorAll('input[name=ref]')].find(r=>r.value==='');
none.checked=true; none.dispatchEvent(new window.Event('change',{bubbles:true}));
await new Promise(r=>setTimeout(r,80));
console.log('\n"쓰지 않기" 선택 후:');
console.log('  장르:', on('genre').join(', '));
console.log('  안내:', c.querySelector('[data-ref-applied]').textContent.trim());
check(on('genre').length === 0, '기본값(빈 장르)으로 되돌아옴 — 레퍼런스가 켠 장르가 남지 않음');
check(!on('genre').some(g=>/재즈/.test(g)), '재즈가 꺼짐');

console.log('\n벤치마킹 한 곳에서:');
{
  const settle=(ms=80)=>new Promise(r=>setTimeout(r,ms));
  const click=(el)=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  const pick=(name,value)=>{const el=c.querySelector(`input[name=${name}][value="${value}"]`); el.checked=true; el.dispatchEvent(new window.Event('change',{bubbles:true}));};
  check(c.querySelectorAll('.card.bench').length===1 && !c.querySelector('.card.patbox'), '레퍼런스 사운드와 인기곡이 벤치마킹 카드 하나에 있음');
  check(c.querySelectorAll('[data-bench-tab]').length===2, '탭 두 개 (레퍼런스 사운드 / 인기곡)');
  click(c.querySelector('[data-bench-tab="pat"]'));
  check(c.querySelector('[data-bench-pane="pat"]').hidden===false && c.querySelector('[data-bench-pane="ref"]').hidden===true, '탭을 누르면 해당 칸만 보임');
  click(c.querySelector('[data-bench-tab="ref"]'));

  // 하나만 — 레퍼런스를 고른 뒤 인기곡을 고르면 레퍼런스는 풀림 (설정은 기본값으로 되돌리지 않음)
  store.set('plimusic:patterns', JSON.stringify([{ id:'p1', name:'끊어 치는 팝', spec:'[가사 꼴]\n훅: 세 번', savedAt:Date.now() }]));
  // 저장소를 다시 읽도록 화면을 새로 그립니다.
  const c2=window.document.createElement('div');
  window.document.getElementById('view').replaceChildren(c2);
  (await import(appUrl('js/pages/music.js'))).default(c2);
  const q=(sel)=>c2.querySelector(sel);
  const pick2=(name,value)=>{const el=c2.querySelector(`input[name=${name}][value="${value}"]`); el.checked=true; el.dispatchEvent(new window.Event('change',{bubbles:true}));};
  pick2('ref','r1');
  await settle();
  const genreAfterRef=[...c2.querySelectorAll('[data-pills="genre"] .pill.on')].map(p=>p.textContent.trim());
  check(q('[data-bench-now]').textContent.includes('레퍼런스 사운드 「재즈 플리」'), '지금 무엇을 벤치마킹하는지 보여 줌');
  pick2('pat','p1');
  await settle();
  check(q('input[name=ref]:checked').value==='', '인기곡을 고르면 레퍼런스는 쓰지 않기로 (하나만)');
  check(q('[data-bench-now]').textContent.includes('인기곡 「끊어 치는 팝」'), '벤치마킹 표시가 인기곡으로 바뀜');
  const genreAfterPat=[...c2.querySelectorAll('[data-pills="genre"] .pill.on')].map(p=>p.textContent.trim());
  check(JSON.stringify(genreAfterRef)===JSON.stringify(genreAfterPat), '옮겨 갈 때 설정을 기본값으로 되돌리지 않음');
  pick2('ref','r1');
  await settle();
  check(q('input[name=pat]:checked').value==='', '레퍼런스를 고르면 인기곡은 쓰지 않기로');

  // 방향 잡기 — 레퍼런스 사운드도 봄, 주제가 없으면 주제를 제안
  q('[data-f=concept]').value='';
  sent.length=0;
  click(q('[data-fit]'));
  await settle(150);
  const prompt=sent[0]?.contents?.[0]?.parts?.at(-1)?.text||'';
  check(prompt.includes('벤치마킹 — 레퍼런스 사운드') && prompt.includes('장르: 재즈'), '방향 잡기가 고른 레퍼런스 사운드를 봄');
  check(prompt.includes('주제가 없습니다') && !!sent[0]?.generationConfig?.responseSchema?.properties?.concept, '주제가 없으면 레퍼런스에 맞는 주제를 제안받음');
  check(c2.textContent.includes('기준 · 레퍼런스 사운드 「재즈 플리」'), '무엇을 기준으로 잡았는지 보여 줌');
  check(!!q('[data-fit-concept]'), '제안된 주제를 적용할 수 있음');

  // 유튜브·음원 분석을 음악 만들기 안에서
  const det=q('[data-ref-new]');
  det.open=true; det.dispatchEvent(new window.Event('toggle'));
  await settle();
  check(!!q('[data-ref-analyze] input[name=sndsrc]') && !!q('[data-ref-analyze] [data-go]'), '음악 만들기 안에서 유튜브·음원으로 새로 분석할 수 있음');
}

console.log(fail?`\n${fail}개 실패`:'\n모두 통과.');
process.exit(fail?1:0);
