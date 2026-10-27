import {COMBAT_GROUND_STATES} from './AttackRules.js';

export function stickState(dx, dy, radius = 52, wasSprinting = false) {
  const length=Math.hypot(dx,dy),scale=Math.min(1,radius/Math.max(length,1));
  const x=dx*scale/radius,y=dy*scale/radius,dead=.2;
  // Wide cardinal sectors make straight movement easy; the outer ring runs.
  const horizontal=Math.abs(x)>dead && Math.abs(x)>=Math.abs(y)*.5;
  const vertical=Math.abs(y)>dead && Math.abs(y)>=Math.abs(x)*.5;
  return {x:x*radius,y:y*radius,forward:vertical&&y<0,backward:vertical&&y>0,left:horizontal&&x<0,right:horizontal&&x>0,sprint:length/radius>(wasSprinting ? .78 : .96)};
}

export function isTouchDevice({coarsePointer=false,mobileUserAgent=false,review=false}={}) {
  return coarsePointer || mobileUserAgent || review;
}

const icons={wire:'M4 19 17 6m-8 0h9v9M4 12v7h7',offhand:'m5 6 14 13M5 15V6h9',jump:'m7 10 5-6 5 6M12 4v16M5 20h14',zip:'m4 14 8-10v7h8L9 21v-7H4',wall:'M17 3v18M5 17l4-5 4 3M9 12V7l5-2',trick:'M5 8a8 8 0 1 1-1 7M5 3v5h5',dodge:'m5 8 5-4 5 4-3 4 6 7M12 12l-5 7M3 12h5',guard:'m12 3 8 4v6c0 4-8 8-8 8s-8-4-8-8V7l8-4',heavy:'m5 15 2-7 3 1 2-4 3 2 1 5 3 1-2 7H8l-3-5',mode:'m12 2 8 5v10l-8 5-8-5V7l8-5M4 7l8 5 8-5M12 12v10'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[name]}"/></svg>`;
const action=(attributes,name,label)=>`<button ${attributes}>${icon(name)}<span>${label}</span></button>`;

// Touch owns its pointers and held inputs independently of keyboard/gamepad.
export class TouchControls {
  constructor(game) {
    this.game=game;this.simpleTraversal=true;this.wireLatched=false;this.pointers=new Map();this.enabled=false;
    this.review=!!import.meta.env?.DEV && new URLSearchParams(location.search).has('touchReview');
    // `any-pointer` and maxTouchPoints also match many touchscreen laptops.
    // Use the primary pointer, with a mobile-UA fallback for older browsers.
    this.media=window.matchMedia('(pointer: coarse)');
    this.root=document.createElement('div');this.root.id='touch-controls';this.root.dataset.simple='true';
    this.root.setAttribute('aria-label','모바일 게임 조작');
    this.root.innerHTML=`<nav class="touch-toolbar" aria-label="게임 메뉴"><button data-ui="fullscreen" aria-label="전체화면으로 플레이" aria-pressed="false">전체화면</button><button data-ui="map" aria-label="전체 지도 열기">지도</button><button data-ui="menu" aria-label="게임 메뉴 열기">메뉴</button></nav>
      <div class="touch-move-zone" aria-label="왼쪽 이동 영역"><div class="touch-stick" role="group" aria-label="이동 스틱 · 끝까지 밀면 질주"><span class="touch-sprint-mark">질주 ↑</span><span class="touch-stick-knob"></span><span class="touch-stick-caption">이동</span></div></div>
      ${action('data-key="mode" class="touch-mode" aria-label="전투와 에너지 와이어 모드 전환" aria-pressed="false"','mode','전투')}
      <div class="touch-actions" role="group" aria-label="동작 버튼">
      ${action('data-mouse="0" class="touch-web touch-primary" aria-label="거미줄 연결 · 한 번 누르기"','wire','거미줄')}
      ${action('data-key="jump" class="touch-jump" aria-label="점프 / 줄에서 뛰어내리기"','jump','점프')}
      ${action('data-key="zip" class="touch-zip" aria-label="와이어 집 / 전투 훅"','zip','집')}
      ${action('data-key="guard" class="touch-guard" aria-label="방어 · 누르고 유지" hidden','guard','방어')}
      ${action('data-key="heavy" class="touch-heavy" aria-label="강공격" hidden','heavy','강공격')}
      <button data-ui="more" class="touch-more" aria-label="보조 동작과 시점 메뉴" aria-expanded="false" aria-controls="touch-extra">···<span>더보기</span></button></div>
      <div id="touch-extra" class="touch-extra" role="group" aria-label="보조 동작과 시점" hidden>
      ${action('data-mouse="2" class="touch-web touch-offhand" aria-label="오른손 와이어 · 누른 채 드래그로 조준"','offhand','오른손')}
      ${action('data-key="wall" class="touch-wall" aria-label="벽 이동 · 이동 스틱을 앞으로 유지"','wall','벽 이동')}
      ${action('data-key="trick" class="touch-trick" aria-label="공중 묘기"','trick','묘기')}
      <button data-key="camera">시점</button><button data-key="crouch">앉기</button><button data-key="recenter">시점 정렬</button><button data-ui="help">조작 안내</button></div>`;
    document.getElementById('game-container').append(this.root);
    this.stick=this.root.querySelector('.touch-stick');this.knob=this.root.querySelector('.touch-stick-knob');
    this.moveZone=this.root.querySelector('.touch-move-zone');
    this.extra=this.root.querySelector('#touch-extra');
    for(const selector of ['.touch-mode','.touch-zip'])this.extra.append(this.root.querySelector(selector));
    this.anchorMarker=document.createElement('div');this.anchorMarker.id='touch-anchor';this.anchorMarker.hidden=true;this.anchorMarker.setAttribute('aria-hidden','true');this.root.append(this.anchorMarker);
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
      if(button.dataset.ui==='more')this.setExpanded(this.extra.hidden);
    });
    this.media.addEventListener('change',()=>this.detect());
    window.addEventListener('resize',()=>this.release());
    window.addEventListener('orientationchange',()=>this.release());
    this.detect();
  }
  setExpanded(open){
    if(!open)for(const [id,p] of this.pointers)if(this.extra.contains(p.target))this.up({pointerId:id});
    this.extra.hidden=!open;this.root.querySelector('[data-ui=more]').setAttribute('aria-expanded',String(open));
    document.body.classList.toggle('touch-extra-open',open);
  }
  detect(){const previous=this.enabled;this.enabled=isTouchDevice({coarsePointer:this.media.matches,mobileUserAgent:navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),review:this.review});if(previous&&!this.enabled)this.release();document.body.classList.toggle('touch-device',this.enabled);this.update();}
  active(){const g=this.game;return this.enabled&&g.isPlaying&&!g.isPaused&&!g.helpOpen&&!g.multiplayer?.spectating&&!g.contextLost;}
  key(action,down){
    const code=this.game.preferences.values.settings.bindings[action];if(!code)return;
    const event=new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true});Object.defineProperty(event,'touchInput',{value:true});window.dispatchEvent(event);
  }
  mouse(button,down,traversal=false){
    const r=this.game.canvas.getBoundingClientRect();
    const event=new MouseEvent(down?'mousedown':'mouseup',{button,clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true});
    Object.defineProperty(event,'touchInput',{value:true});Object.defineProperty(event,'touchTraversal',{value:traversal});(down?this.game.canvas:window).dispatchEvent(event);
  }
  down(e){
    if((e.pointerType==='mouse'&&!this.review)||!this.active())return;
    const button=e.target.closest('button');if(button?.dataset.ui || button?.disabled)return;
    let kind,action;
    if(e.target.closest('.touch-stick') || e.target.closest('.touch-move-zone'))kind='stick';
    else if(button?.dataset.key){kind='key';action=button.dataset.key;}
    else if(button?.dataset.mouse!==undefined){action=Number(button.dataset.mouse);kind=this.simpleTraversal&&action===0&&this.game.combat?.mode!=='combat'?'wire':'mouse';}
    else if(e.target===this.game.canvas&&e.clientX>innerWidth*.3)kind='look';
    else return;
    if([...this.pointers.values()].some(p=>p.kind===kind&&(kind==='stick'||kind==='look'||p.action===action)))return;
    e.preventDefault();e.target.setPointerCapture?.(e.pointerId);
    const pointer={kind,action,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,target:e.target};this.pointers.set(e.pointerId,pointer);
    button?.classList.add('pressed');
    this.game.audio.ensureContext();
    if(kind==='key'){this.key(action,true);if(this.simpleTraversal&&['jump','mode'].includes(action))this.releaseWire();}
    if(kind==='mouse')this.mouse(action,true);
    if(kind==='stick'){
      if(this.moveZone){
        const zone=this.moveZone.getBoundingClientRect(),radius=this.stick.getBoundingClientRect().width/2;
        const x=Math.max(radius,Math.min(zone.width-radius,e.clientX-zone.x)),y=Math.max(radius,Math.min(zone.height-radius,e.clientY-zone.y));
        this.stick.style.left=`${zone.x+x-radius}px`;this.stick.style.top=`${zone.y+y-radius}px`;this.stick.style.bottom='auto';
        this.stickOrigin={x:e.clientX,y:e.clientY};
      }
      this.moveStick(e);
    }
  }
  moveStick(e){const r=this.stick.getBoundingClientRect(),origin=this.stickOrigin || {x:r.x+r.width/2,y:r.y+r.height/2};const s=stickState(e.clientX-origin.x,e.clientY-origin.y,Math.max(1,(r.width-(this.knob.getBoundingClientRect?.().width||54))/2),!!this.game.touchDirections?.sprint);
    this.knob.style.transform=`translate(${s.x}px,${s.y}px)`;this.game.touchDirections=s;this.game.syncHeldInput();this.stick.classList.toggle('sprinting',s.sprint);}
  move(e){const p=this.pointers.get(e.pointerId);if(!p)return;
    e.preventDefault();if(!this.active()){this.release();return;}
    if(p.kind==='stick')this.moveStick(e);
    if(p.kind==='look'||p.kind==='mouse'||p.kind==='wire'||(p.kind==='key'&&p.action!=='mode')){
      // Ignore tiny thumb jitter on an action button, then keep aiming while
      // jumping, dodging or holding a strand with the same thumb.
      const started=p.looking;
      p.looking ||= p.kind==='look'||Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>=8;
      if(p.looking){
      // Spend the first action drag on the deadzone, avoiding a sudden view jump.
      let dx=e.clientX-p.x,dy=e.clientY-p.y;
      if(!started && p.kind!=='look'){
        dx=e.clientX-p.startX;dy=e.clientY-p.startY;
        const remaining=1-8/Math.hypot(dx,dy);dx*=remaining;dy*=remaining;
      }
      this.game.tpsCamera.handleMouseMove(dx,dy,.0028);
      this.game.physics.setWebAimPoint(0,0,null,true);
      }
    }
    p.x=e.clientX;p.y=e.clientY;
  }
  up(e){const p=this.pointers.get(e.pointerId);if(!p)return;this.pointers.delete(e.pointerId);
    p.target.closest('button')?.classList.remove('pressed');
    if(p.target.hasPointerCapture?.(e.pointerId))p.target.releasePointerCapture?.(e.pointerId);
    if(p.kind==='key')this.key(p.action,false);
    if(p.kind==='mouse')this.mouse(p.action,false);
    if(p.kind==='wire'&&!p.looking&&e.type!=='pointercancel'&&e.type!=='lostpointercapture'&&this.active())this.toggleWire();
    if(p.kind==='stick'){this.game.touchDirections={};this.resetStick();this.game.syncHeldInput();}
  }
  toggleWire(){
    if(this.wireLatched){this.releaseWire();return;}
    if(!this.active()||this.game.combat?.mode==='combat')return;
    this.wireLatched=true;this.mouse(0,true,true);
    // Keep a successful rope, but do not keep firing/reconnecting after a miss.
    this.game.input.webFireHeld=false;
  }
  releaseWire(){
    if(!this.wireLatched)return;
    this.wireLatched=false;this.mouse(0,false,true);
    if(this.game.input)this.game.input.webTap=false;
  }
  syncTraversal(active){
    const g=this.game,p=g.physics,combat=g.combat?.mode==='combat';
    p.mobileTraversalAssist=this.enabled&&!combat;
    document.body.classList.toggle('mobile-traversal',this.enabled&&!combat);
    g.tpsCamera.mobileAutoFollow=this.enabled;
    g.tpsCamera.mobileLooking=[...this.pointers.values()].some(pointer=>pointer.kind==='look'||pointer.looking);
    if(this.wireLatched&&(!active||combat||(!g.input.webTap&&(!g.input.webHold||!p.webs.some(web=>(web.button??0)===0)))))this.releaseWire();
    const connected=this.wireLatched&&p.webs.some(web=>(web.button??0)===0),ready=!!p.bestAnchorCandidate;
    const button=this.root.querySelector('.touch-primary');
    const key=`${combat}:${connected}:${this.wireLatched}:${ready}`;
    if(this.wireUiKey!==key){
      this.wireUiKey=key;button.setAttribute('aria-pressed',String(connected));
      if(!combat){button.querySelector('span').textContent=connected?'놓기':this.wireLatched?'연결 중':'거미줄';button.setAttribute('aria-label',connected?'거미줄 놓기':ready?'거미줄 연결 · 한 번 누르기':'거미줄 · 건물을 바라보세요');button.querySelector('path').setAttribute('d',icons.wire);}
      this.root.dataset.wireConnected=String(connected);this.root.dataset.wireReady=String(ready);
    }
    if(this.anchorMarker){
      this.anchorMarker.hidden=true;
      if(active&&!combat&&!connected&&p.bestAnchorCandidate){
        const screen=p.bestAnchorCandidate.clone().project(g.camera),rect=g.canvas.getBoundingClientRect();
        if(screen.z>-1&&screen.z<1&&Math.abs(screen.x)<.92&&Math.abs(screen.y)<.94){
          this.anchorMarker.hidden=false;this.anchorMarker.style.left=`${rect.x+(screen.x+1)*rect.width/2}px`;this.anchorMarker.style.top=`${rect.y+(1-screen.y)*rect.height/2}px`;
        }
      }
    }
  }
  resetStick(){this.stickOrigin=null;this.knob.style.transform='translate(0px,0px)';this.stick.classList.remove('sprinting');if(this.moveZone){this.stick.style.left='';this.stick.style.top='';this.stick.style.bottom='';}}
  release(){
    for(const id of [...this.pointers.keys()])this.up({pointerId:id,type:'pointercancel'});
    if(this.simpleTraversal)this.releaseWire();
    this.game.touchDirections={};this.resetStick();this.game.syncHeldInput();
    if(this.extra)this.setExpanded(false);
  }
  update(){
    const active=this.active(),g=this.game;
    this.root.hidden=!(this.enabled&&g.isPlaying&&!g.isPaused&&!g.helpOpen&&!g.contextLost);
    this.root.dataset.spectating=String(!!g.multiplayer?.spectating);
    document.body.classList.toggle('touch-solo',this.enabled&&!!g.multiplayer?.solo);
    document.body.classList.toggle('touch-extra-open',!this.root.hidden&&!this.extra.hidden);
    if(active&&!this.announced){this.announced=true;g.showNotice(this.simpleTraversal?'왼쪽 이동 · 거미줄 한 번으로 연결 / 다시 눌러 놓기 · 카메라 자동 추적':'왼쪽 이동 · 오른쪽 드래그로 시점 · 와이어를 누른 채 조준 · 보조 동작은 더보기');}
    if(this.enabled)this.game.pointerLockWanted=false;
    if(!active&&(this.pointers.size||this.wireLatched))this.release();
    if(this.simpleTraversal)this.syncTraversal(active);
    const combat=this.game.combat?.mode==='combat',grounded=COMBAT_GROUND_STATES.includes(this.game.physics.state),recovering=['ROLLING','TURNING'].includes(this.game.physics.state);
    const layoutKey=`${g.combat?.mode}:${grounded}:${recovering}:${!!g.combat?.allowGuardInWeb}`;
    if(this.layoutKey===layoutKey)return;
    this.layoutKey=layoutKey;
    this.root.dataset.combat=String(combat);
    for(const [action,visible]of [['wall',!combat],['guard',!!(combat||g.combat?.allowGuardInWeb)&&grounded],['trick',!combat],['heavy',combat&&grounded]]){
      const button=this.root.querySelector(`[data-key="${action}"]`);
      if(button && button.hidden===visible){
        if(!visible)for(const [id,p]of this.pointers)if(p.kind==='key'&&p.action===action)this.up({pointerId:id});
        button.hidden=!visible;
      }
    }
    const modeButton=this.root.querySelector('.touch-mode');
    modeButton.setAttribute('aria-pressed',String(g.combat?.mode==='combat'));
    modeButton.querySelector('span').textContent=g.combat?.mode==='combat'?'와이어':'전투';
    this.root.querySelector('.touch-zip span').textContent=combat?(grounded?'훅':recovering?'회복 후 훅':'착지 후 훅'):'집';
    const zipButton=this.root.querySelector('.touch-zip');if(zipButton)zipButton.disabled=combat&&!grounded;
    for(const button of this.root.querySelectorAll('[data-mouse]')){
      button.disabled=combat&&!grounded;
      const right=button.dataset.mouse==='2';if(this.simpleTraversal&&!combat&&!right)continue;const label=combat?(!grounded?(recovering?'회복 후 공격':'착지 후 공격'):right?'스트레이트':'잽'):(this.simpleTraversal?'보조 와이어':right?'오른손':'왼손 와이어');
      const caption=button.querySelector('span');
      button.querySelector('path').setAttribute('d',icons[combat?'heavy':right?'offhand':'wire']);
      if(caption.textContent!==label){caption.textContent=label;button.setAttribute('aria-label',`${right?'오른손':'왼손'} ${combat?'공격':'와이어'} · 누른 채 드래그로 조준`);}
    }
  }
}
