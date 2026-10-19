import { GROUNDED } from './MotionCatalog.js';

export function stickState(dx, dy, radius = 52) {
  const length=Math.hypot(dx,dy),scale=Math.min(1,radius/Math.max(length,1));
  const x=dx*scale/radius,y=dy*scale/radius,dead=.16;
  return {x:x*radius,y:y*radius,forward:y<-dead,backward:y>dead,left:x<-dead,right:x>dead,sprint:length/radius>.85};
}

export function isTouchDevice({coarsePointer=false,mobileUserAgent=false,review=false}={}) {
  return coarsePointer || mobileUserAgent || review;
}

// Touch owns its pointers and held inputs independently of keyboard/gamepad.
export class TouchControls {
  constructor(game) {
    this.game=game;this.pointers=new Map();this.enabled=false;
    this.review=!!import.meta.env?.DEV && new URLSearchParams(location.search).has('touchReview');
    // `any-pointer` and maxTouchPoints also match many touchscreen laptops.
    // Use the primary pointer, with a mobile-UA fallback for older browsers.
    this.media=window.matchMedia('(pointer: coarse)');
    this.root=document.createElement('div');this.root.id='touch-controls';
    this.root.setAttribute('aria-label','모바일 게임 조작');
    this.root.innerHTML=`<nav class="touch-toolbar" aria-label="게임 메뉴"><button data-ui="fullscreen" aria-label="전체화면으로 플레이" aria-pressed="false">전체화면</button><button data-ui="map" aria-label="전체 지도 열기">지도</button><button data-ui="menu" aria-label="게임 메뉴 열기">메뉴</button></nav>
      <div class="touch-stick" role="group" aria-label="이동 스틱 · 끝까지 밀면 질주"><span class="touch-stick-knob"></span><span class="touch-stick-caption">이동 · 질주</span></div>
      <div class="touch-actions"><button data-mouse="0" class="touch-web" aria-label="왼손 거미줄 · 누르고 유지"><span>왼손 웹</span></button><button data-mouse="2" class="touch-web" aria-label="오른손 거미줄 · 누르고 유지"><span>오른손 웹</span></button><button data-key="jump" class="touch-jump">점프</button><button data-key="zip">웹 집</button><button data-key="wall">벽 이동</button><button data-ui="more" aria-expanded="false" aria-controls="touch-extra">더보기</button></div>
      <div id="touch-extra" class="touch-extra" hidden><button data-key="mode" aria-label="외형 변신 · 전투와 거미줄 모드 전환">변신</button><button data-key="guard">방어</button><button data-key="dodge">회피</button><button data-key="heavy">강공격</button><button data-key="trick">묘기</button><button data-key="camera">시점</button><button data-key="recenter">시점 정렬</button><button data-ui="help">조작 안내</button></div>`;
    document.getElementById('game-container').append(this.root);
    this.stick=this.root.querySelector('.touch-stick');this.knob=this.root.querySelector('.touch-stick-knob');
    this.extra=this.root.querySelector('#touch-extra');
    this.root.addEventListener('contextmenu',e=>e.preventDefault());
    this.root.addEventListener('pointerdown',e=>this.down(e));
    game.canvas.addEventListener('pointerdown',e=>this.down(e));
    window.addEventListener('pointermove',e=>this.move(e),{passive:false});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])window.addEventListener(name,e=>this.up(e));
    this.root.addEventListener('click',e=>{
      const button=e.target.closest('[data-ui]');if(!button)return;
      if(button.dataset.ui==='fullscreen')game.toggleFullscreen();
      if(button.dataset.ui==='map')game.worldMap.toggle();
      if(button.dataset.ui==='menu')game.togglePause();
      if(button.dataset.ui==='help')game.toggleHelp();
      if(button.dataset.ui==='more'){const open=this.extra.hidden;this.extra.hidden=!open;button.setAttribute('aria-expanded',String(open));}
    });
    this.media.addEventListener('change',()=>this.detect());
    window.addEventListener('resize',()=>this.release());
    window.addEventListener('orientationchange',()=>this.release());
    this.detect();
  }
  detect(){this.enabled=isTouchDevice({coarsePointer:this.media.matches,mobileUserAgent:navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),review:this.review});document.body.classList.toggle('touch-device',this.enabled);this.update();}
  active(){const g=this.game;return this.enabled&&g.isPlaying&&!g.isPaused&&!g.helpOpen&&!g.multiplayer?.spectating&&!g.contextLost;}
  key(action,down){
    const code=this.game.preferences.values.settings.bindings[action];if(!code)return;
    const event=new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true});Object.defineProperty(event,'touchInput',{value:true});window.dispatchEvent(event);
  }
  mouse(button,down){
    const r=this.game.canvas.getBoundingClientRect();
    const event=new MouseEvent(down?'mousedown':'mouseup',{button,clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true});
    Object.defineProperty(event,'touchInput',{value:true});(down?this.game.canvas:window).dispatchEvent(event);
  }
  down(e){
    if((e.pointerType==='mouse'&&!this.review)||!this.active())return;
    const button=e.target.closest('button');if(button?.dataset.ui)return;
    let kind,action;
    if(e.target.closest('.touch-stick'))kind='stick';
    else if(button?.dataset.key){kind='key';action=button.dataset.key;}
    else if(button?.dataset.mouse!==undefined){kind='mouse';action=Number(button.dataset.mouse);}
    else if(e.target===this.game.canvas&&e.clientX>innerWidth*.3)kind='look';
    else return;
    if([...this.pointers.values()].some(p=>p.kind===kind&&(kind==='stick'||kind==='look'||p.action===action)))return;
    e.preventDefault();e.target.setPointerCapture?.(e.pointerId);
    const pointer={kind,action,x:e.clientX,y:e.clientY,target:e.target};this.pointers.set(e.pointerId,pointer);
    button?.classList.add('pressed');
    this.game.audio.ensureContext();
    if(kind==='key')this.key(action,true);
    if(kind==='mouse')this.mouse(action,true);
    if(kind==='stick')this.moveStick(e);
  }
  moveStick(e){const r=this.stick.getBoundingClientRect();const s=stickState(e.clientX-r.x-r.width/2,e.clientY-r.y-r.height/2,r.width*.32);
    this.knob.style.transform=`translate(${s.x}px,${s.y}px)`;this.game.touchDirections=s;this.game.syncHeldInput();this.stick.classList.toggle('sprinting',s.sprint);}
  move(e){const p=this.pointers.get(e.pointerId);if(!p)return;
    e.preventDefault();if(!this.active()){this.release();return;}
    if(p.kind==='stick')this.moveStick(e);
    if(p.kind==='look'||p.kind==='mouse'){
      this.game.tpsCamera.handleMouseMove(e.clientX-p.x,e.clientY-p.y,.0035);
      this.game.physics.setWebAimPoint(0,0,null,true);
    }
    p.x=e.clientX;p.y=e.clientY;
  }
  up(e){const p=this.pointers.get(e.pointerId);if(!p)return;this.pointers.delete(e.pointerId);
    p.target.closest('button')?.classList.remove('pressed');
    if(p.kind==='key')this.key(p.action,false);
    if(p.kind==='mouse')this.mouse(p.action,false);
    if(p.kind==='stick'){this.game.touchDirections={};this.resetStick();this.game.syncHeldInput();}
  }
  resetStick(){this.knob.style.transform='translate(0px,0px)';this.stick.classList.remove('sprinting');}
  release(){
    for(const id of [...this.pointers.keys()])this.up({pointerId:id});
    this.game.touchDirections={};this.resetStick();this.game.syncHeldInput();
    if(this.extra){this.extra.hidden=true;this.root.querySelector('[data-ui=more]').setAttribute('aria-expanded','false');}
  }
  update(){
    const active=this.active(),g=this.game;
    this.root.hidden=!(this.enabled&&g.isPlaying&&!g.isPaused&&!g.helpOpen&&!g.contextLost);
    this.root.dataset.spectating=String(!!g.multiplayer?.spectating);
    document.body.classList.toggle('touch-solo',this.enabled&&!!g.multiplayer?.solo);
    document.body.classList.toggle('touch-extra-open',!this.root.hidden&&!this.extra.hidden);
    if(active&&!this.announced){this.announced=true;g.showNotice('왼쪽 스틱 이동 · 오른쪽 화면을 밀어 조준 · 거미줄은 누르고 유지');}
    if(this.enabled)this.game.pointerLockWanted=false;
    if(!active&&this.pointers.size)this.release();
    const combat=this.game.combat?.mode==='combat'&&GROUNDED.includes(this.game.physics.state);
    for(const button of this.root.querySelectorAll('[data-mouse]')){
      const right=button.dataset.mouse==='2';const label=combat?(right?'오른손 공격':'왼손 공격'):(right?'오른손 웹':'왼손 웹');
      if(button.firstElementChild.textContent!==label){button.firstElementChild.textContent=label;button.setAttribute('aria-label',`${label} · 누르고 유지`);}
    }
  }
}
