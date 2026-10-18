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
  const output=document.createElement('pre');output.id='hong-kong-audit';panel.append(title,output);document.body.append(panel);
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
      position:p.position.toArray().map(n=>+n.toFixed(3)),velocity:p.velocity.toArray().map(n=>+n.toFixed(3)),state:p.state,motion:a,mode:app.combat.mode,feet,peers,map3D:!!app.minimap?.renderer,mapMeshes:app.minimap?.terrainCopies.size,
      facing:p.facingAngle,cameraYaw:app.tpsCamera.yaw,
      webs:p.webs.map(w=>({hand:w.hand,anchor:w.anchor.toArray().map(n=>+n.toFixed(2)),length:+w.length.toFixed(2),supported:p.anchorSupported?.(w)})),support:c.supportHeight?.(p.position),collision:c.collisionWorld?.meshes.size,pending:c.collisionWorld?.pending.length,history,decodedRGBTextures:c.decodedRGBTextures || 0,textureDiagnostics:c.textureDiagnostics},null,1);
  }};
}
