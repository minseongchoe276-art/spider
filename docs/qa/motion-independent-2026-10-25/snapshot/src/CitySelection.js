import {LOCAL_MAPS,mapName} from './MapCatalog.js';
export function selectedCity(search) {
  const id=new URLSearchParams(search).get('city');
  return LOCAL_MAPS.some(map=>map.id===id)?id:'hong-kong';
}
export function initCitySelection(root=document,search=location.search) {
  const city=selectedCity(search),language=new URLSearchParams(search).get('lang')==='en'?'en':'ko';
  // The same atlas remains reachable from the pause menu.
  const menu=root.querySelector?.('.overlay-card');
  if(menu&&!menu.querySelector('.pause-atlas')){
    const details=document.createElement('details');details.className='player-progress pause-atlas';
    const summary=document.createElement('summary');summary.textContent=language==='en'?'Change district':'지도 변경';
    const options=document.createElement('div');options.className='city-options';
    const hint=document.createElement('p');hint.textContent=language==='en'?'Changing district returns to the lobby. Online matches use Neon Core.':'지도 변경 시 로비로 돌아갑니다. 온라인 경기는 네온 도심에서 진행합니다.';
    details.append(summary,options,hint);menu.append(details);
  }
  for(const options of root.querySelectorAll('.city-options')){
    options.replaceChildren();
    for(const map of [{id:'hong-kong',name:'홍콩',en:'Hong Kong',description:'실제 3D 도시 · 네트워크 필요',descriptionEn:'Real 3D city · Network required',accent:'#80bcff'},...LOCAL_MAPS]){
      const url=new URL(location.href);url.searchParams.set('city',map.id);url.searchParams.delete('join');
      const link=document.createElement('a');link.href=url.pathname+url.search;link.dataset.city=map.id;link.style.setProperty('--map-accent',map.accent);
      const title=document.createElement('b'),description=document.createElement('small'),tag=document.createElement('span');
      title.textContent=map[language==='en'?'en':'name'];description.textContent=map[language==='en'?'descriptionEn':'description'];tag.className='map-tag';tag.textContent=map[language==='en'?'tagEn':'tag']||'3D STREAM';
      link.append(tag,title,description);if(map.id===city)link.setAttribute('aria-current','page');options.append(link);
    }
  }
  const picker=root.querySelector?.('.lobby-hero .city-picker');
  if(picker&&!picker.querySelector('.district-route')){
    const route=document.createElement('p');route.className='district-route';
    route.textContent=language==='en'?'Suggested route: Sky Gardens → Neon Core → Sunset Harbor → Brick Quarter → Crown Skyline':'추천 코스: 스카이 가든 → 네온 도심 → 선셋 항만 → 브릭 구시가지 → 크라운 금융가';picker.append(route);
  }
  for(const label of root.querySelectorAll('[data-current-city]'))label.textContent=mapName(city,language);
}
