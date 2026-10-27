import * as THREE from 'three';
import {Character} from './Character.js';
import {CombatSystem} from './Combat.js';
import {sampleCombatScenario,COMBAT_DIRECTIONS} from './CombatMotionScenario.js';
import {sampleCombatReviewPose} from './CombatReviewPose.js';
import {SwingPhysics} from './SwingPhysics.js';
import {City} from './City.js';
import {VFXManager} from './VFX.js';

export function startCombatReview() {
  document.body.replaceChildren();document.body.style.cssText='margin:0;overflow:hidden;font:14px system-ui;background:#dce5ec';
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));document.body.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#dce5ec');scene.add(new THREE.HemisphereLight(0xffffff,0x677588,2.6));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,8,5);scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshStandardMaterial({color:0x829398}));floor.rotation.x=-Math.PI/2;scene.add(floor,new THREE.GridHelper(50,50));
  const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.05,200);camera.userData.movementYaw=0;camera.position.set(4,3.5,7);camera.lookAt(0,1.2,0);
  const panel=document.createElement('section');panel.style.cssText='position:fixed;top:16px;left:16px;padding:16px;border-radius:12px;background:#ffffffed;color:#17232d;max-width:330px';
  panel.innerHTML='<strong>전투 모드 · 모션 검증</strong><p><button id="combat-jab">잽</button> <button id="combat-cross">오른손 펀칭</button> <button id="combat-hook">강한 훅</button> <button id="combat-special">오른손 강타</button></p><p><button id="combat-guard">방어 전환</button> <button id="combat-left">좌 회피</button> <button id="combat-right">우 회피</button> <button id="combat-back">뒤 회피</button> <button id="combat-forward">앞 회피</button></p><p><button id="combat-mode">Q 모드 전환</button></p><p>모션 <select id="combat-clip"></select> <button id="combat-pose">타격·기준 자세 보기</button></p><p>행동 시간 구간 <input id="combat-phase" type="number" min="0" max="1" step="0.05" value="0.5" style="width:65px"> <button id="combat-sample">구간 보기</button></p><p>재생 속도 <select id="combat-speed"><option value="1">실제 속도</option><option value="0.35">느리게 확인</option></select></p><output id="combat-output">모션 로딩 중</output><p><a href="/">홍콩 게임으로 돌아가기</a></p>';
  document.body.append(panel);const output=panel.querySelector('output');
  const movement=document.createElement('select');movement.id='combat-movement';movement.setAttribute('aria-label','이동 속도');
  movement.innerHTML='<option value="0">제자리</option><option value="4.4">달리며 공격</option><option value="6.5">질주하며 공격</option>';
  panel.append(movement);
  const direction=document.createElement('select');direction.id='combat-direction';direction.setAttribute('aria-label','전투 이동 방향');
  direction.innerHTML='<option value="stationary">정지</option><option value="forward" selected>전진</option><option value="backward">후진</option><option value="left">왼쪽</option><option value="right">오른쪽</option><option value="forwardLeft">전진 왼쪽</option><option value="forwardRight">전진 오른쪽</option><option value="backwardLeft">후진 왼쪽</option><option value="backwardRight">후진 오른쪽</option>';panel.append(direction);
  const pattern=document.createElement('select');pattern.id='combat-pattern';pattern.setAttribute('aria-label','이동 변화');pattern.innerHTML='<option value="steady">계속 이동</option><option value="start">공격 중 이동 시작</option><option value="stop">공격 중 정지</option><option value="reverse">공격 중 방향 반전</option>';panel.append(pattern);
  const view=document.createElement('select');view.id='combat-camera-view';view.setAttribute('aria-label','검사 시점');view.innerHTML='<option value="three">사선</option><option value="side">측면</option><option value="rear">후면</option>';panel.append(view);
  const liveSample=document.createElement('button');liveSample.id='combat-live-sample';liveSample.textContent='실제 입력 시간으로 자세 검사';panel.append(liveSample);
  const labels={combatIdle:'복싱 대기 자세',jab:'리드 잽',cross:'오른손 펀칭',rightHook:'이전 오른손 훅',hook:'훅 원본',heavy:'강한 훅',special:'오른손 강타',guard:'단단한 가드',dodgeLeft:'좌측 상체 회피',dodgeRight:'우측 상체 회피',dodgeBack:'짧은 뒤 회피',dodgeForward:'낮은 앞 회피'};
  let ready=false,pose=false,history=[],lastMotion;
  const character=new Character(scene,()=>{},()=>{ready=true;output.textContent='준비 완료';panel.querySelector('select').replaceChildren(...['combatIdle','jab','cross','rightHook','hook','heavy','special','guard','slam','slamLand','hitHead','hitBody','hitHeavy'].map(key=>{const o=document.createElement('option');o.value=key;o.textContent=labels[key] || key;return o;}));});
  scene.add(camera);
  const city={buildingMeshes:[],colliders:[],checkCollision:City.prototype.checkCollision,raycast:City.prototype.raycast,getRooftopSpawn:()=>new THREE.Vector3(0,.1,0)};
  const audio=new Proxy({}, {get:()=>()=>{}}),physics=new SwingPhysics(scene,city,character,audio),vfx=new VFXManager(scene);
  physics.position.set(0,.1,0);physics.previousFixedPosition.copy(physics.position);physics.renderPosition.copy(physics.position);physics.state='IDLE';physics.facingAngle=Math.PI;character.targetFacingAngle=Math.PI;
  const combat=new CombatSystem(scene,physics,character,{vfx,audio,onNotice:message=>{output.textContent=message;}});
  combat.toggle();
  const input={forward:false,backward:false,left:false,right:false,strafe:0,webHold:false};
  const control=()=>{pose=false;history=[];lastMotion=null;character.combatAction=null;combat.cancel();combat.mode='combat';physics.webEnabled=false;combat.stamina=100;input.guard=false;};
  panel.querySelector('#combat-jab').onclick=()=>{if(!ready)return;control();combat.attack(camera);};
  panel.querySelector('#combat-cross').onclick=()=>{if(!ready)return;control();combat.straight(camera);};
  panel.querySelector('#combat-special').onclick=()=>{control();combat.specialCooldown=0;combat.special(camera);};
  panel.querySelector('#combat-hook').onclick=()=>{if(!ready)return;control();combat.heavy(camera);};
  panel.querySelector('#combat-guard').onclick=()=>{pose=false;input.guard=!combat.blocking;combat.guard(input.guard);};
  for(const dir of ['left','right','back','forward'])panel.querySelector('#combat-'+dir).onclick=()=>{control();combat.dodge({[dir]:true},camera);};
  panel.querySelector('#combat-mode').onclick=()=>{pose=false;combat.toggle(input);};
  const showPose=(phase)=>{
    if(!ready)return;
    combat.cancel();pose=true;physics.position.set(0,.1,0);character.group.position.copy(physics.position);
    character.model.rotation.set(0,Math.PI,0);character.model.position.set(0,-.1,0);
    const key=panel.querySelector('#combat-clip').value;
    const sample=sampleCombatReviewPose(character,{key,phase,speed:Number(movement.value),id:++combat.serial});
    output.textContent=`전투 동작: ${labels[key] || key} · 행동 시간 ${(sample.fraction*100).toFixed(1)}% · ${sample.state} · 기본 모션 ${sample.active}`;
  };
  panel.querySelector('#combat-pose').onclick=()=>showPose();
  panel.querySelector('#combat-sample').onclick=()=>showPose(THREE.MathUtils.clamp(Number(panel.querySelector('#combat-phase').value),0,1));
  liveSample.onclick=()=>{
    if(!ready)return;pose=true;
    const key=panel.querySelector('#combat-clip').value;if(!['jab','cross','heavy','guard'].includes(key)){output.textContent='잽·스트레이트·훅·가드를 선택하세요';return;}
    const result=sampleCombatScenario({combat,physics,camera},{key,direction:direction.value,sprint:Number(movement.value)>5,pattern:pattern.value,phase:Number(panel.querySelector('#combat-phase').value)});
    output.textContent=`${key} · ${direction.value} · ${pattern.value}\n${result.state} / ${result.base} · 이동 ${result.travel ?? '가드'}\n공격 구간 ${(result.phase*100).toFixed(1)}%`;output.style.whiteSpace='pre-wrap';
  };
  const clock=new THREE.Clock();renderer.setAnimationLoop(()=>{
    const dt=Math.min(clock.getDelta(),.05)*Number(panel.querySelector('#combat-speed').value);
    if(ready && !pose) {
      Object.assign(input,{forward:false,backward:false,left:false,right:false},Number(movement.value)>0?COMBAT_DIRECTIONS[direction.value]:{});input.sprint=Number(movement.value)>5;
      combat.before(dt,camera,input);physics.update(dt,input,camera);combat.after(dt);vfx.update(dt);
      const motion=character.activeAction?.getClip().name;if(motion!==lastMotion){history.push(motion);history=history.slice(-12);lastMotion=motion;}
      output.textContent=`${combat.mode==='web'?'에너지 와이어 ON':'전투 모드'} · ${labels[character.activeAction?.getClip().name] || character.activeAction?.getClip().name}\nHP ${combat.health} / 기력 ${Math.ceil(combat.stamina)} / 명중 ${combat.hits}\n최근 동작: ${history.map(key=>labels[key] || key).join(' → ')}`;output.style.whiteSpace='pre-line';
    }
    const center=character.group.position.clone().add(new THREE.Vector3(0,1,0));
    const offset=view.value==='side'?new THREE.Vector3(4.5,1.1,.8):view.value==='rear'?new THREE.Vector3(-2.5,1.1,-3.9):new THREE.Vector3(2.5,1.1,(camera.userData.movementYaw===0?3.9:-3.9));
    camera.position.copy(center).add(offset);camera.lookAt(center);camera.setViewOffset(innerWidth,innerHeight,-panel.offsetWidth/2,0,innerWidth,innerHeight);
    renderer.render(scene,camera);
  });
  window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
}
