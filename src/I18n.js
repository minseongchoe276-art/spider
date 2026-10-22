import {EN,EN_TEMPLATES} from './locales/en.js';
const korean=/[가-힣]/;
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const phrases=Object.keys(EN).filter(s=>s.length>1).sort((a,b)=>b.length-a.length);
const pattern=new RegExp(phrases.map(escape).join('|'),'g');
export function language(){
  if(typeof location==='undefined')return 'ko';
  return new URLSearchParams(location.search).get('lang')==='en'?'en':'ko';
}
export function t(value,locale=language()){
  const text=String(value??'');if(locale!=='en'||!korean.test(text))return text;
  const trimmed=text.trim();if(Object.hasOwn(EN,trimmed))return text.replace(trimmed,EN[trimmed]);
  let translated=text;
  for(const [expression,replacement]of EN_TEMPLATES){if(expression.test(text)){translated=text.replace(expression,replacement);break;}}
  return translated.replace(pattern,match=>EN[match])
    .replace(/\b1명/g,'1 player').replace(/(\d+)명/g,'$1 players').replace(/(\d+(?:\.\d+)?)초/g,'$1s').replace(/(\d+)분/g,'$1min').replace(/(\d+)개/g,'$1');
}
const excluded='script,style,[data-user-content],input,textarea';
export function translateUI(root){
  if(!root)return;
  if(root.nodeType===3){if(!root.parentElement?.closest(excluded)){const next=t(root.nodeValue);if(next!==root.nodeValue)root.nodeValue=next;}return;}
  if(root.nodeType!==1&&root.nodeType!==9)return;
  if(root.nodeType===1&&root.matches('script,style,[data-user-content]'))return;
  const apply=el=>{
    if(el.closest('script,style,[data-user-content]'))return;
    for(const attr of ['aria-label','placeholder','title'])if(el.hasAttribute(attr)){const before=el.getAttribute(attr),after=t(before);if(before!==after)el.setAttribute(attr,after);}
  };
  if(root.nodeType===1)apply(root);
  for(const el of root.querySelectorAll('[aria-label],[placeholder],[title]'))apply(el);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode()))translateUI(node);
}
let initialized=false;
export function initLanguage(){
  if(initialized)return;initialized=true;
  // The URL is authoritative; persistence only supplies the initial preference.
  const url=new URL(location.href);
  if(!url.searchParams.has('lang')){try{if(localStorage.getItem('shadow-pulse-language')==='en'){url.searchParams.set('lang','en');history.replaceState(null,'',url);}}catch{}}
  const lang=language();document.documentElement.lang=lang;
  try{localStorage.setItem('shadow-pulse-language',lang);}catch{}
  const nav=document.createElement('nav');nav.className='language-switch';nav.setAttribute('aria-label','Language');
  for(const [id,label]of [['ko','한국어'],['en','EN']]){const link=document.createElement('a');const target=new URL(location.href);target.searchParams.set('lang',id);link.href=target.pathname+target.search+target.hash;link.textContent=label;link.lang=id;link.hreflang=id;link.dataset.userContent='';if(id===lang)link.setAttribute('aria-current','true');nav.append(link);}
  document.body.append(nav);
  const menu=document.querySelector('.overlay-card');
  if(menu){const menuNav=nav.cloneNode(true);menuNav.classList.add('language-in-menu');menu.append(menuNav);}
  for(const link of document.querySelectorAll('a[href]')){
    const target=new URL(link.getAttribute('href'),location.href);
    if(target.origin===location.origin&&target.searchParams.has('city')&&!target.searchParams.has('lang')){target.searchParams.set('lang',lang);link.href=target.pathname+target.search+target.hash;}
  }
  if(lang!=='en')return;
  document.title='SHADOW PULSE — 3D City Action';
  const description=document.querySelector('meta[name="description"]');if(description)description.content='Swing between buildings, connect energy wires and explore the city in SHADOW PULSE.';
  for(const id of ['room-title'])document.getElementById(id)?.setAttribute('data-user-content','');
  const roomName=document.getElementById('room-name');if(roomName?.value==='새로운 도시 여행')roomName.value='A New City Adventure';
  // Translate only changed UI subtrees; avoid rescanning the game every frame.
  const observer=new MutationObserver(records=>{
    for(const record of records){if(record.type==='characterData')translateUI(record.target);
      else if(record.type==='attributes'){const el=record.target;if(!el.closest('script,style,[data-user-content]')){const before=el.getAttribute(record.attributeName),after=t(before);if(before!==after)el.setAttribute(record.attributeName,after);}}
      else for(const node of record.addedNodes)translateUI(node);}
  });
  translateUI(document);observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','placeholder','title']});
}
