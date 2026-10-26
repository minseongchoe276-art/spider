import {language} from './I18n.js';
import {localMap,mapName} from './MapCatalog.js';
import {selectedCity} from './CitySelection.js';

export function showLobbyView(view,focus=false){
  const shell=document.querySelector?.('.lobby-shell');if(!shell)return;
  shell.dataset.view=view;
  document.getElementById('online-overlay')?.setAttribute('aria-labelledby',view==='online'?'lobby-online-title':'online-title');
  const back=document.getElementById('lobby-back');if(back)back.hidden=view!=='online'||!document.getElementById('room-panel')?.classList.contains('hidden');
  if(focus)document.getElementById(view==='online'?'player-name':'open-multiplayer')?.focus();
}
export function initLobbySelection(){
  const shell=document.querySelector('.lobby-shell'),hero=shell?.querySelector('.lobby-hero');
  if(!hero||shell.dataset.simplified)return;shell.dataset.simplified='true';
  const en=language()==='en',city=selectedCity(location.search);
  let chosen=city,chosenUrl=new URL(location.href);
  const header=shell.querySelector('.lobby-topline'),nav=document.body.querySelector(':scope > .language-switch');
  if(nav)header.append(nav);
  const title=hero.querySelector('h1');title.textContent=en?'City exploration':'도시 탐험';
  hero.querySelector('p').textContent=en?'Choose a district and start exploring.':'지도를 고르고 탐험을 시작하세요.';
  const picker=hero.querySelector('.city-picker'),options=picker.querySelector('.city-options');
  const details=document.createElement('details');details.className='map-selector';
  const summary=document.createElement('summary');
  const caption=document.createElement('small');caption.textContent=en?'YOUR MAP':'플레이할 지도';
  const name=document.createElement('strong');name.textContent=mapName(city,language());
  const change=document.createElement('span');change.className='map-change';change.textContent=en?'Change map':'지도 변경';
  summary.append(caption,name,change);details.append(summary,options);
  picker.replaceChildren(details);
  const description=document.createElement('p');description.className='selected-map-description';
  description.setAttribute('aria-live','polite');
  const describe=id=>id==='hong-kong'?(en?'Hong Kong terrain · Internet connection required':'홍콩의 실제 지형 · 인터넷 연결 필요'):localMap(id)[en?'descriptionEn':'description'];
  description.textContent=describe(city);picker.append(description);
  for(const link of options.querySelectorAll('a[data-city]'))link.addEventListener('click',event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();chosen=link.dataset.city;chosenUrl=new URL(link.href);
    name.textContent=mapName(chosen,language());details.open=false;description.textContent=describe(chosen);
    for(const label of play.querySelectorAll('[data-current-city]'))label.textContent=mapName(chosen,language());
    for(const option of options.querySelectorAll('a')){if(option===link)option.setAttribute('aria-current','page');else option.removeAttribute('aria-current');}
    summary.focus();
  });
  const play=document.getElementById('play-solo');
  play.addEventListener('click',event=>{
    if(chosen===city)return;
    event.preventDefault();event.stopImmediatePropagation();
    chosenUrl.searchParams.set('play','solo');chosenUrl.searchParams.delete('view');location.href=chosenUrl.href;
  },true);play.querySelector('b').textContent=en?'Play Solo':'혼자 플레이';
  const together=document.createElement('button');together.type='button';together.id='open-multiplayer';together.textContent=en?'Play with Friends':'함께 플레이';together.addEventListener('click',()=>{if(chosen!==city){chosenUrl.searchParams.set('view','online');chosenUrl.searchParams.delete('play');location.href=chosenUrl.href;}else showLobbyView('online',true);});hero.querySelector('.lobby-hero-actions').append(together);
  const back=document.createElement('button');back.id='lobby-back';back.type='button';back.textContent=en?'← Back':'← 돌아가기';back.addEventListener('click',()=>showLobbyView('solo',true));shell.querySelector('.online-card').prepend(back);
  shell.querySelector('.online-card .online-header h2').id='lobby-online-title';
  const status=document.getElementById('online-status');if(status)shell.querySelector('.online-header').append(status);
  // Keep joining immediately available; creation settings only open when needed.
  const panel=document.getElementById('lobby-panel'),setup=document.createElement('details'),setupTitle=document.createElement('summary');setup.className='room-setup';setupTitle.textContent=en?'Create a room':'방 만들기';setup.append(setupTitle);
  let item=panel.querySelector('.mode-heading');const end=document.getElementById('create-room');
  while(item){const next=item.nextSibling;setup.append(item);if(item===end)break;item=next;}
  panel.append(setup);
  const loading=rootLoading();
  if(loading&&!loading.querySelector('details')){
    const fold=document.createElement('details'),label=document.createElement('summary');fold.className='loading-atlas';label.textContent=en?'Choose another map':'다른 지도 선택';fold.append(label,loading.querySelector('.city-options'));loading.append(fold);
  }
  const params=new URLSearchParams(location.search);
  showLobbyView(params.has('join')||params.get('view')==='online'?'online':'solo');
}

function rootLoading(){return document.querySelector('.loading-city-picker');}
