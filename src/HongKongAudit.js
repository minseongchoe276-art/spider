// Opt-in evidence surface. Gameplay uses the same real city and controller.
import * as THREE from 'three';
import { boneId } from './MotionRetarget.js';
import { groundSample } from './LedgeTraversal.js';
import { AuditMetrics } from './AuditMetrics.js';
export function createHongKongAudit(app) {
  if(typeof location==='undefined')return null;
  if(!new URLSearchParams(location.search).has('hongKongAudit'))return null;
  const panel=document.createElement('aside');panel.style.cssText='position:fixed;right:12px;top:80px;width:360px;max-height:45vh;overflow:auto;background:#11202eed;color:white;padding:12px;z-index:20;font:12px monospace;white-space:pre-wrap';
  const title=document.createElement('strong');title.textContent='실제 지형 · 모션 · 온라인 검사';
  const output=document.createElement('pre');output.id='hong-kong-audit';
  const controls=document.createElement('div');controls.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin:8px 0';
  let run=null,lastRun=null;
  const release=reason=>{if(!run)return;for(const code of run.keys)app.gamepad.key(code,false);if(run.mouse!==undefined)app.gamepad.mouse(run.mouse,false);
    lastRun={name:run.name,result:reason,states:[...run.states],attacks:[...run.attacks],start:run.start,end:app.physics.position.toArray()};run=null;};
  const begin=(name,actions,seconds,mouse,leftSeconds=0)=>{
    release('중지');if(!app.isPlaying||app.isPaused||app.helpOpen||app.multiplayer?.spectating)return;
    if(((mouse!==undefined && seconds<1) || actions.includes('heavy')) && app.combat.mode!=='combat'){lastRun={name,result:'Q로 전투 모드를 켜세요'};return;}
    const keys=actions.map(action=>app.preferences.values.settings.bindings[action]);
    run={name,keys,mouse,until:performance.now()+seconds*1000,leftUntil:leftSeconds?performance.now()+leftSeconds*1000:0,
      states:new Set(),attacks:new Set(),start:app.physics.position.toArray(),mantled:false};
    for(const code of keys)app.gamepad.key(code,true);
    if(mouse!==undefined)app.gamepad.mouse(mouse,true);
  };
  for(const [label,action]of [
    ['벽 오르기 15초',()=>begin('climb',['forward','wall'],15)],
    ['왼쪽 벽 진입',()=>begin('climb-left',['forward','wall','left'],15,undefined,1.1)],
    ['좌클릭 1.5초',()=>begin('left-hold',[],1.5,0)],
    ['이동 잽',()=>begin('moving-jab',['forward'],.56,0)],
    ['이동 훅',()=>begin('moving-hook',['forward'],.68,2)],
    ['이동 G 강타',()=>begin('moving-special',['forward','heavy'],1.2)],
    ['입력 중지',()=>release('중지')],
  ]){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',action);controls.append(button);}
  panel.append(title,controls,output);document.body.append(panel);
  const history=[],metrics=new AuditMetrics(),anklePeaks={};let last='',next=0,lateProfiled=false;
  const active=()=>app.isPlaying&&!app.isPaused&&!document.hidden;
  for(const [object,method,name]of [[app.city,'update','city'],[app.physics,'update','physics'],
    [app.character,'update','character'],[app.tpsCamera,'update','camera'],[app.minimap,'update','minimap'],
    [app.experience,'update','experience'],[app.renderer,'render','render'],[app.city.collisionWorld,'resolve','collisionResolve']])
    metrics.profile(object,method,name,active);
  app.city.collisionWorld?.initialized.then(()=>metrics.profile(app.city.collisionWorld.world,'step','rapierStep',active));
  return {update(now){
    if(!lateProfiled){metrics.profile(app.minimap,'update','minimap',active);metrics.profile(app.experience,'update','experience',active);lateProfiled=true;}
    metrics.update(now,app.isPlaying&&!app.isPaused&&!document.hidden);
    const p=app.physics,c=app.city,a=app.character.activeAction?.getClip().name;
    if(run){
      run.states.add(p.state+'/'+a);run.mantled ||= p.state==='MANTLING';
      if(app.combat.action)run.attacks.add(app.combat.action.key);
      if(!active()||app.helpOpen||app.multiplayer?.spectating)release('일시정지');
      else if(run.mantled&&['IDLE','RUNNING'].includes(p.state))release('옥상 착지');
      else if(performance.now()>=run.until)release('완료');
      else if(run.leftUntil&&performance.now()>=run.leftUntil){const code=app.preferences.values.settings.bindings.left;app.gamepad.key(code,false);run.keys=run.keys.filter(k=>k!==code);run.leftUntil=0;}
    }
    const angles={};
    for(const joint of app.character.jointConstraints || [])if(joint.kind==='foot'){
      const id=boneId(joint.bone.name),degrees=THREE.MathUtils.radToDeg(joint.rest.angleTo(joint.bone.quaternion));
      if(active())anklePeaks[id]=Math.max(anklePeaks[id] || 0,degrees);
      angles[id]={angleDegrees:+degrees.toFixed(2),peakDegrees:+(anklePeaks[id] || 0).toFixed(2),limitDegrees:+THREE.MathUtils.radToDeg(joint.limit).toFixed(2)};
    }
    const state=p.state+'/'+a;if(state!==last){history.push(state);if(history.length>40)history.shift();last=state;}
    if(now<next)return;next=now+.25;
    const feet=['left','right'].map(side=>{
      const bone=Object.values(app.character.bones).find(b=>boneId(b.name)===side+'foot');
      const point=bone?.getWorldPosition(new THREE.Vector3());
      return {side,...angles[side+'foot'],ankle:point?.toArray().map(n=>+n.toFixed(3)),
        surface:point?groundSample(c,new THREE.Vector3(point.x,p.position.y+.45,point.z),.8)?.height:null};
    });
    const peers=[...(app.multiplayer?.avatars.values() || [])].map(remote=>({name:remote.player.name,
      position:remote.mesh.position.toArray().map(n=>+n.toFixed(2)),state:remote.character.lastState,
      motion:remote.character.activeAction?.getClip().name,web:remote.character.webMesh.visible || remote.character.webMeshOffhand.visible}));
    output.textContent=JSON.stringify({map:c.isStreamed?'Hong Kong':'procedural',ready:c.isReady,playing:app.isPlaying,paused:app.isPaused,practice:app.practice?.active,
      performance:metrics.snapshot(),cpuSections:metrics.sectionSnapshot(),renderer:{calls:app.renderer.info.render.calls,triangles:app.renderer.info.render.triangles,...app.renderer.info.memory,pixelRatio:app.renderer.getPixelRatio()},
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},quality:app.preferences.values.quality,
      resources:{count:performance.getEntriesByType('resource').length,transferBytes:performance.getEntriesByType('resource').reduce((sum,r)=>sum+(r.transferSize||0),0)},
      position:p.position.toArray().map(n=>+n.toFixed(3)),velocity:p.velocity.toArray().map(n=>+n.toFixed(3)),state:p.state,motion:a,mode:app.combat.mode,feet,peers,
      attack:app.combat.action?{key:app.combat.action.key,phase:+(app.combat.action.time/app.combat.action.duration).toFixed(3)}:null,
      input:{forward:app.input.forward,wall:app.input.wallRun,left:app.input.left},auditRun:run?{name:run.name,states:[...run.states],attacks:[...run.attacks]}:lastRun,
      map3D:!!app.minimap?.renderer,mapMeshes:app.minimap?.terrainCopies.size,
      facing:p.facingAngle,cameraYaw:app.tpsCamera.yaw,
      webs:p.webs.map(w=>({hand:w.hand,anchor:w.anchor.toArray().map(n=>+n.toFixed(2)),length:+w.length.toFixed(2),supported:p.anchorSupported?.(w)})),support:c.supportHeight?.(p.position),collision:c.collisionWorld?.meshes.size,pending:c.collisionWorld?.pending.length,history,decodedRGBTextures:c.decodedRGBTextures || 0,textureDiagnostics:c.textureDiagnostics},null,1);
  }};
}
