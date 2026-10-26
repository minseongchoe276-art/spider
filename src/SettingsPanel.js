import { BINDINGS, SETTING_LIMITS, keyLabel, rebind } from './PlayerSettings.js';
const labels={forward:'앞으로',backward:'뒤로',left:'왼쪽',right:'오른쪽',sprint:'질주',jump:'점프',wall:'벽 이동',zip:'와이어 당기기 / 훅',trick:'공중 묘기',mode:'전투 / 에너지 와이어',guard:'방어',heavy:'강공격',dodge:'회피',recenter:'카메라 정렬',camera:'시점'};
const ranges={sensitivity:'마우스 / 스틱 감도',fov:'시야각',shake:'카메라 흔들림',speedFov:'속도 시야각 변화',follow:'자동 추적',speedLines:'속도선',effectsVolume:'효과음',environmentVolume:'환경음',musicVolume:'음악',hudScale:'HUD 크기'};
const switches={invertY:'세로축 반전',webToggle:'에너지 와이어 클릭으로 유지 / 해제',sprintToggle:'질주 키로 유지 / 해제',autoQuality:'성능에 맞춰 해상도 조절',trajectory:'비행 방향 미리 보기',showPerformance:'성능 정보 표시'};
export class SettingsPanel {
  constructor(game) {
    this.game=game;const root=document.getElementById('extended-settings');if(!root)return;
    const section=(title)=>{const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=title;details.append(summary);root.append(details);return details;};
    const camera=section('카메라 · 화면'),audio=section('소리'),input=section('조작 · 게임패드');
    for(const [key,label] of Object.entries(ranges)) {
      const row=document.createElement('label');row.className='setting-row';const title=document.createElement('span');title.textContent=label;
      const slider=document.createElement('input');slider.type='range';slider.id=`setting-${key}`;slider.min=SETTING_LIMITS[key][0];slider.max=SETTING_LIMITS[key][1];slider.step=key==='fov'?1:.05;
      const value=document.createElement('output');slider.setAttribute('aria-label',label);slider.value=game.preferences.values.settings[key];value.value=this.formatValue(key,slider.value);
      slider.addEventListener('input',()=>{game.preferences.values.settings[key]=Number(slider.value);value.value=this.formatValue(key,slider.value);game.applyPreferences();});slider.addEventListener('change',()=>this.save());
      row.append(title,slider,value);(key.includes('Volume')?audio:camera).append(row);
    }
    for(const [key,label] of Object.entries(switches)) {
      const row=document.createElement('label');row.className='setting-row';const title=document.createElement('span');title.textContent=label;const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id=`setting-${key}`;checkbox.checked=game.preferences.values.settings[key];
      checkbox.addEventListener('change',()=>{game.clearInput();game.preferences.values.settings[key]=checkbox.checked;this.save();game.applyPreferences();});row.append(title,checkbox);
      (['webToggle','sprintToggle','aimAssist','invertY'].includes(key)?input:camera).append(row);
    }
    this.buttons={};
    for(const [action,label] of Object.entries(labels)) {
      const row=document.createElement('div');row.className='setting-row';const title=document.createElement('span');title.textContent=label;const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`${label} 키 변경`);
      button.addEventListener('click',()=>{this.cancel();this.pending=action;button.textContent='새 키 입력 · Esc 취소';});this.buttons[action]=button;row.append(title,button);input.append(row);
    }
    const reset=document.createElement('button');reset.type='button';reset.textContent='기본 키로 복원';reset.addEventListener('click',()=>{game.clearInput();game.preferences.values.settings.bindings={...BINDINGS};this.cancel();this.save();});input.append(reset);
    const pad=document.createElement('p');pad.textContent='게임패드: 왼쪽 스틱 이동 · 오른쪽 시점 · A 점프 · LT/RT 양손 에너지 와이어 · X 집 · Y 모드 · LB 방어 · RB 묘기 · B 회피 · 스틱 클릭 질주/정렬 · 십자키 시점/강공격/벽 이동 · Start 메뉴';input.append(pad);
    window.addEventListener('keydown',event=>{
      if(!this.pending)return;event.preventDefault();event.stopImmediatePropagation();
      if(event.code==='Escape')return this.cancel();
      if(!rebind(game.preferences.values.settings,this.pending,event.code)){
        this.buttons[this.pending].textContent='사용할 수 없는 키 · H 도움말 / M 전체 지도';return;
      }
      game.clearInput();this.cancel();this.save();
    },true);
    const theme=document.getElementById('web-theme');theme?.addEventListener('change',()=>{game.progression.data.theme=theme.value;game.progression.dirty=true;game.progression.save();game.applyWebTheme();});
    this.refresh();
  }
  formatValue(key,value){
    const n=Number(value);
    if(key==='fov')return `${Math.round(n)}°`;
    if(key==='sensitivity')return `${n.toFixed(2)}×`;
    return `${Math.round(n*100)}%`;
  }
  save(){if(!this.game.preferences.save())this.game.showNotice('설정을 저장할 수 없어 이번 실행에만 적용합니다.');this.refresh();}
  cancel(){this.pending=null;this.refresh();}
  refresh(){for(const [action,button]of Object.entries(this.buttons||{}))button.textContent=keyLabel(this.game.preferences.values.settings.bindings[action]);
    document.querySelectorAll('[data-action-key]').forEach(el=>{
      el.textContent=keyLabel(this.game.preferences.values.settings.bindings[el.dataset.actionKey]);
    });
    if(this.game.isPlaying){this.game.multiplayer?.renderHud?.();}
    document.querySelectorAll('#controls-guide .key-badge, #gameplay-quickbar kbd').forEach(el=>{
      el.dataset.originalKey??=el.textContent;
      const original=el.dataset.originalKey;
      const names={Q:'mode',G:'heavy',Shift:'sprint',Space:'jump',E:'zip',T:'trick',C:'recenter',V:'camera',B:'guard'};
      if(names[original])el.textContent=keyLabel(this.game.preferences.values.settings.bindings[names[original]]);
      if(original==='W A S D')el.textContent=['forward','left','backward','right'].map(a=>keyLabel(this.game.preferences.values.settings.bindings[a])).join(' ');
      if(original==='SPACE')el.textContent=keyLabel(this.game.preferences.values.settings.bindings.jump).toUpperCase();
      if(original==='Ctrl + 방향')el.textContent=keyLabel(this.game.preferences.values.settings.bindings.dodge)+' + 방향';
      if(original==='F + W')el.textContent=keyLabel(this.game.preferences.values.settings.bindings.wall)+' + '+keyLabel(this.game.preferences.values.settings.bindings.forward);
    });
  }
}
