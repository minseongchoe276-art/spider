import * as THREE from 'three';
import {Character} from './Character.js';

// Development laboratory: deterministic samples of the live character rig.
export function startMotionLab() {
 document.body.replaceChildren();
 document.body.style.cssText='margin:0;background:#e5edf2;color:#182b39;font:14px system-ui';
 const panel=document.createElement('section');
 panel.style.cssText='position:fixed;z-index:2;top:12px;left:12px;width:350px;max-height:95vh;overflow:auto;background:#fffffff0;padding:14px;border-radius:12px;box-sizing:border-box';
 panel.innerHTML=`<h2>모션 조합 검증실</h2><p>실제 캐릭터와 무기 모델 · 고정 시간 간격 검사</p>
 <label>무기 <select id="weapon"><option value="none">맨손</option><option value="knife">나이프</option><option value="pistol">권총</option><option value="baseball-bat">야구 방망이</option><option value="metal-pipe">쇠파이프</option><option value="sniper-rifle">저격총</option></select></label>
 <label>이동 <select id="state"><option>IDLE</option><option>RUNNING</option><option>SPRINTING</option><option>JUMPING</option><option>FALLING</option><option>LANDING</option><option>ROLLING</option><option>WALL_RUNNING</option><option>SWINGING</option><option>WEB_ZIP</option></select></label>
 <p><label>전투 동작 <select id="action"><option value="">없음</option>${['jab','cross','heavy','special','guard','dodgeLeft','dodgeRight','dodgeBack','dodgeForward','hitHead','hitBody','hitHeavy','knifeStab','gunFire'].map(x=>`<option>${x}</option>`).join('')}</select></label></p>
 <p><button id="play">선택 조합 재생</button> <button id="run">전체 자동 검사</button> <button id="download" disabled>결과 저장</button></p>
 <p><label>시점 <select id="view"><option value="front">정면</option><option value="side">측면</option><option value="back">후면</option></select></label></p>
 <output id="status">캐릭터 로딩 중…</output><pre id="report" style="white-space:pre-wrap;max-height:35vh;overflow:auto"></pre><p><a href="/">게임으로 돌아가기</a></p>`;
 document.body.append(panel);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#dce7ed');scene.add(new THREE.HemisphereLight(0xffffff,0x708090,2.8));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,7,5);scene.add(light,new THREE.GridHelper(20,20));
 const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.01,100);const $=id=>panel.querySelector('#'+id),status=$('status');
 let c,ready=false,running=false,report=null,elapsed=0;
 c=new Character(scene,()=>{},()=>{ready=true;status.textContent=`준비 완료 · 모션 ${Object.keys(c.actions).length}개`;});
 const attackFor=weapon=>({none:['jab','cross','heavy','special'],knife:['knifeStab'],pistol:['gunFire'],'baseball-bat':['heavy'],'metal-pipe':['heavy'],'sniper-rifle':['gunFire']}[weapon] || []);
 const attacks=new Set(['jab','cross','heavy','special','knifeStab','gunFire']);
 const allowed=(weapon,state,action)=>!attacks.has(action) || (['IDLE','RUNNING','SPRINTING','LANDING'].includes(state) && attackFor(weapon).includes(action));
 function refreshActions(){
  for(const option of $('action').options)option.disabled=!allowed($('weapon').value,$('state').value,option.value);
  if($('action').selectedOptions[0]?.disabled)$('action').value='';
 }
 $('weapon').onchange=refreshActions;$('state').onchange=refreshActions;refreshActions();
 const velocity=state=>new THREE.Vector3(0,state==='JUMPING'?4:state==='FALLING'?-5:0,state==='SPRINTING'?7:state==='RUNNING'?4:state==='SWINGING'?8:0);
 async function equip(type){
  c.knifeVisible=false;c.gunVisible=false;c.extraWeapon=null;c.extraWeaponVisible=false;
  let ok=true;if(type==='knife')ok=await c.prepareKnife();else if(type==='pistol')ok=await c.prepareGun();else if(type!=='none')ok=await c.prepareExtraWeapon(type);
  if(!ok)throw new Error(`${type} 모델 로딩 실패`);
  c.knifeVisible=type==='knife';c.gunVisible=type==='pistol'||type==='sniper-rifle';c.extraWeapon=['baseball-bat','metal-pipe','sniper-rifle'].includes(type)?type:null;c.extraWeaponVisible=!!c.extraWeapon;c.combatStance=true;
 }
 function step(state,action,time,dt=1/60){
  c.combatAction=action?{id:1,key:action,time,duration:action==='gunFire'?.42:1.05}:null;
  c.update(dt,state,velocity(state),null);c.group.updateMatrixWorld(true);
 }
 function inspect(){
  for(const b of Object.values(c.bones))if(![...b.position.toArray(),...b.quaternion.toArray()].every(Number.isFinite)||Math.abs(b.quaternion.length()-1)>.002)throw new Error(`관절 값 이상: ${b.name}`);
  for(const {bone,rest,limit} of c.jointConstraints || [])if(rest.angleTo(bone.quaternion)>limit+.002)throw new Error(`관절 제한 초과: ${bone.name}`);
 }
 $('play').onclick=async()=>{if(!ready||running)return;try{await equip($('weapon').value);elapsed=0;status.textContent='선택 조합 재생 중';}catch(e){status.textContent=e.message;}};
 $('run').onclick=async()=>{
  if(!ready||running)return;running=true;report={created:new Date().toISOString(),clips:[],combinations:[],limitations:'클립 샘플과 지정된 상태·행동 교차 및 전환의 수치 검사. 물리 입력, 충돌, 자연스러움과 무기 관통의 육안 검증은 별도.'};
  $('run').disabled=$('play').disabled=true;
  for(const [key,action] of Object.entries(c.actions)){
   try{c.stopAnimation();c.fadeToAction(key,0);const duration=action.getClip().duration;for(let i=0;i<=20;i++){action.enabled=true;action.paused=false;action.time=Math.min(duration*i/20,Math.max(0,duration-.0001));c.mixer.update(0);inspect();}report.clips.push({key,ok:true});}catch(e){report.clips.push({key,ok:false,error:e.message});}
  }
  const states=['IDLE','RUNNING','SPRINTING','JUMPING','FALLING','LANDING','ROLLING','WALL_RUNNING','SWINGING','WEB_ZIP'];
  const actions=['','jab','cross','heavy','special','guard','dodgeLeft','dodgeRight','dodgeBack','dodgeForward','hitHead','hitBody','hitHeavy','knifeStab','gunFire'];
  for(const weapon of ['none','knife','pistol','baseball-bat','metal-pipe','sniper-rifle']){
   try{await equip(weapon);}catch(e){report.combinations.push({weapon,ok:false,error:e.message});continue;}
   for(const state of states)for(const action of actions){
    if(!allowed(weapon,state,action))continue;
    try{
     // Exercise the attack, its interruption by the selected state/action, and recovery.
     c.stopAnimation();c.lastState=null;const attack=weapon==='knife'?'knifeStab':['pistol','sniper-rifle'].includes(weapon)?'gunFire':weapon==='none'?'jab':'heavy';
     for(let i=0;i<12;i++)step('IDLE',attack,i/60);
     for(let i=0;i<18;i++){step(state,action,i/60);inspect();}
     for(let i=0;i<12;i++){step('IDLE','',i/60);inspect();}
     report.combinations.push({weapon,state,action:action||'none',ok:true});
    }catch(e){report.combinations.push({weapon,state,action:action||'none',ok:false,error:e.message});}
   }
   status.textContent=`검사 중: ${weapon} · ${report.combinations.length}개 조합`;await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  const failures=[...report.clips,...report.combinations].filter(x=>!x.ok);$('report').textContent=JSON.stringify({clips:report.clips.length,combinations:report.combinations.length,failures},null,2);status.textContent=`완료 · 클립 ${report.clips.length}개 · 조합 ${report.combinations.length}개 · 오류 ${failures.length}개`;window.motionLabReport=report;$('download').disabled=false;$('run').disabled=$('play').disabled=false;running=false;
 };
 $('download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='motion-lab-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 let last=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.05);last=now;if(ready&&!running){elapsed+=dt;step($('state').value,$('action').value,elapsed%1.05,dt);}const center=new THREE.Vector3(0,1,0),offset={front:[2,1,4],side:[4,1,0],back:[-2,1,-4]}[$('view').value];camera.position.copy(center).add(new THREE.Vector3(...offset));camera.lookAt(center);camera.setViewOffset(innerWidth,innerHeight,-175,0,innerWidth,innerHeight);renderer.render(scene,camera);});
 window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
}
