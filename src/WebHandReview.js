import * as THREE from 'three';
import {Character} from './Character.js';
import {boneId} from './MotionRetarget.js';
import {restoreHandPose} from './WebHandPose.js';

export function startWebHandReview(){
  document.body.replaceChildren();document.body.style.cssText='margin:0;overflow:hidden;font:15px system-ui;background:#dbe7ef';
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));document.body.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#dbe7ef');scene.add(new THREE.HemisphereLight(0xffffff,0x738294,2.5));
  const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(3,6,4);scene.add(sun,new THREE.GridHelper(100,100));
  const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.01,200);scene.add(camera);
  const panel=document.createElement('section');panel.style.cssText='position:fixed;top:16px;left:16px;background:#fffffff0;color:#17232d;padding:16px;border-radius:12px;max-width:320px';
  panel.innerHTML='<strong>거미줄 손 자세 검증</strong><p>손 <select id="web-hand"><option value="left">왼손</option><option value="right">오른손</option><option value="both">양손</option></select></p><p>동작 <select id="web-phase"><option value="fire">발사</option><option value="miss">빗나간 발사</option><option value="hold">줄 잡기</option><option value="release">해제</option><option value="combat">펀치</option></select></p><p>시점 <select id="web-view"><option value="first">1인칭</option><option value="third">3인칭 전신</option><option value="palm">손바닥 확대</option><option value="back">손등 확대</option></select></p><button id="web-sample">자세 보기</button> <button id="web-play">연속 재생</button><p><output id="web-status">로딩 중</output></p><a href="/">게임으로 돌아가기</a>';
  const fovLabel=document.createElement('p');fovLabel.innerHTML='<label>1인칭 시야각 <select id="web-fov"><option>45</option><option>55</option><option>64</option><option>95</option></select></label>';panel.append(fovLabel);
  const sampleControls=document.createElement('p');sampleControls.innerHTML='<label>검사 시각 <input id="web-time" type="number" min="0.01" max="2.5" step="0.01" placeholder="자동" style="width:65px">초</label> <label>배경 <select id="web-background"><option value="day">낮</option><option value="night">밤</option></select></label>';panel.append(sampleControls);
  document.body.append(panel);const status=panel.querySelector('output');let ready=false,playing=false,elapsed=0,released=false;
  const c=new Character(scene,()=>{},()=>{ready=true;sample();});c.setFirstPersonCamera(camera);
  function reset(){
    restoreHandPose(c.webFingerRig);c.stopAnimation();c.webGestures={};c.webAttachments=[];c.webHandWeights={};c.webHandTargets={};c.webLaunchTimers={};c.persistentWebAnchor=null;c.webShotAnchor=null;c.webShotTimer=0;c.webShotIsMiss=false;c.combatAction=null;
    c.group.position.set(0,.1,0);c.visualYaw=c.targetFacingAngle=Math.PI;c.model.rotation.set(0,Math.PI,0);c.model.position.set(0,0,0);c.lastState=null;elapsed=0;released=false;
    for(const side of panel.querySelector('#web-hand').value==='both'?['left','right']:[panel.querySelector('#web-hand').value]){
      const target=new THREE.Vector3(side==='left'?-2:2,4,-10);
      if(panel.querySelector('#web-phase').value==='miss')c.fireWebMiss(target,side);else c.fireWeb(target,side);
    }
  }
  function advance(dt){
    elapsed+=dt;const phase=panel.querySelector('#web-phase').value;
    if((phase==='release' || phase==='combat') && elapsed>=.35 && !released){released=true;c.webAttachments=[];c.webLaunchTimers={};c.webShotTimer=0;c.webShotAnchor=null;c.persistentWebAnchor=null;}
    if(phase==='combat' && elapsed>=.35)c.combatAction={key:'jab',id:1,time:.3,duration:1};
    const view=panel.querySelector('#web-view').value;c.setFirstPersonMode(view==='first');
    c.update(dt,'IDLE',new THREE.Vector3(),c.persistentWebAnchor);
  }
  function sample(){if(!ready)return;playing=false;reset();const phase=panel.querySelector('#web-phase').value,manual=Number(panel.querySelector('#web-time').value),target=manual>0?THREE.MathUtils.clamp(manual,.01,2.5):['hold','release','combat'].includes(phase)?1.05:.16;
    while(elapsed<target-1e-8)advance(Math.min(1/120,target-elapsed));render();}
  panel.querySelector('#web-sample').onclick=sample;
  panel.querySelector('#web-play').onclick=()=>{if(!ready)return;reset();playing=true;};
  for(const select of panel.querySelectorAll('select'))select.onchange=sample;
  panel.querySelector('#web-time').onchange=sample;
  function render(){
    if(!ready)return;const view=panel.querySelector('#web-view').value,side=panel.querySelector('#web-hand').value==='right'?'right':'left';
    scene.background.set(panel.querySelector('#web-background').value==='night'?'#172c42':'#dbe7ef');
    const fov=view==='first'?Number(panel.querySelector('#web-fov').value):45;
    if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
    const hand=Object.values(c.bones).find(b=>boneId(b.name)===side+'hand'),center=new THREE.Vector3(0,1.15,0);
    camera.clearViewOffset();camera.up.set(0,1,0);
    if(view==='first'){camera.position.set(0,1.75,0);camera.lookAt(0,1.75,-1);}
    else if(view==='third'){camera.position.set(2.4,2.3,-4.8);camera.lookAt(center);camera.setViewOffset(innerWidth,innerHeight,-panel.offsetWidth/2,0,innerWidth,innerHeight);}
    else if(hand){c.group.updateMatrixWorld(true);hand.getWorldPosition(center);const q=hand.getWorldQuaternion(new THREE.Quaternion());
      const palm=new THREE.Vector3(0,0,view==='palm'?1:-1).applyQuaternion(q),tip=new THREE.Vector3(0,1,0).applyQuaternion(q);
      camera.position.copy(center).addScaledVector(palm,.45).addScaledVector(tip,.1);camera.up.copy(tip);camera.lookAt(center.clone().addScaledVector(tip,.1));
      camera.setViewOffset(innerWidth,innerHeight,-panel.offsetWidth/2,0,innerWidth,innerHeight);
    }
    if(view==='first' || view==='third')camera.up.set(0,1,0);
    if(view==='palm' || view==='back')c.updateWeb(false,null);
    else c.updateWeb(!!(c.persistentWebAnchor || c.webShotAnchor),c.persistentWebAnchor || c.webShotAnchor);
    const gesture={hold:'다섯 손가락으로 줄 잡기',release:'기본 손 자세로 복귀',combat:'전투 주먹 자세'}[panel.querySelector('#web-phase').value] || '중지·약지 접기 / 검지·새끼손가락 펴기';status.textContent=`${panel.querySelector('#web-hand').selectedOptions[0].text} · ${panel.querySelector('#web-phase').selectedOptions[0].text} · ${elapsed.toFixed(2)}초\n${c.firstPersonRig.children.every(arm=>arm.userData.hand.triangles>0)?'실제 캐릭터 손 메시':'대체 관절 손'} · ${gesture}`;status.style.whiteSpace='pre-line';renderer.render(scene,camera);
  }
  const clock=new THREE.Clock();renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);if(ready && playing){advance(dt);if(elapsed>2.5)playing=false;}render();});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
}
