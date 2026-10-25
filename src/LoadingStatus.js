import {language} from './I18n.js';

export function loadingMessage(seconds,streamed,online,locale=language()){
  const en=locale==='en',time=Math.max(0,Math.floor(seconds));
  if(!online)return en?'Offline. Reconnect and retry, or choose a local district.':'인터넷 연결이 끊겼습니다. 연결 후 재시도하거나 로컬 지도를 선택하세요.';
  return en?`${time}s elapsed · ${streamed?'City terrain arrives over the network. You can switch to a local district below.':'Preparing character and local district.'}`:
    `${time}초 경과 · ${streamed?'도시 지형을 네트워크로 불러옵니다. 아래에서 로컬 지도로 전환할 수 있습니다.':'캐릭터와 로컬 지도를 준비합니다.'}`;
}

// Starts before the streamed engine import, so slow engine downloads also have
// visible recovery controls. Completion releases the timer and network listeners.
export function startLoadingStatus(streamed){
  const started=performance.now(),output=document.getElementById('loading-wait');
  const update=()=>{
    const seconds=(performance.now()-started)/1000,online=navigator.onLine!==false;
    if(output)output.textContent=loadingMessage(seconds,streamed,online);
    if(seconds>=30||!online)document.getElementById('loading-recovery')?.classList.remove('hidden');
  };
  const timer=setInterval(update,1000);
  const retry=document.getElementById('btn-retry-load'),reload=()=>location.reload();
  retry?.addEventListener('click',reload);
  window.addEventListener('online',update);window.addEventListener('offline',update);update();
  return ()=>{clearInterval(timer);retry?.removeEventListener('click',reload);window.removeEventListener('online',update);window.removeEventListener('offline',update);if(output)output.textContent='';};
}
