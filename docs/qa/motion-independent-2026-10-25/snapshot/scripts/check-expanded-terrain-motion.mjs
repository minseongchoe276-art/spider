import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {loadMotionRig,disposeRig,joint,point} from './lib/motion-rig.mjs';import {SwingPhysics} from '../src/SwingPhysics.js';import {StreamedCollision} from '../src/StreamedCollision.js';import {CombatSystem} from '../src/Combat.js';import {ThirdPersonCamera} from '../src/Camera.js';
const folder='docs/qa/expanded-motion-2026-10-19';fs.mkdirSync(folder,{recursive:true});const {actor}=await loadMotionRig(),results=[];
function box(w,h,d,x,y,z){const m=new T.Mesh(new T.BoxGeometry(w,h,d));m.position.set(x,y,z);m.updateMatrixWorld(true);return m;}
const terrainFilter=process.argv.find(a=>a.startsWith('--terrain='))?.split('=')[1];
const fpsFilter=Number(process.argv.find(a=>a.startsWith('--fps='))?.split('=')[1]) || null;
for(const terrain of ['flat','diagonal-ramp','ramp-edge','stairs-up','stairs-down','low-ceiling','narrow-corner','roof-edge']){
 if(terrainFilter && terrain!==terrainFilter)continue;
 const world=new StreamedCollision();await world.initialized;const meshes=[];
 if(terrain==='roof-edge')meshes.push(box(10,1,8,0,1.5,0));else meshes.push(box(80,1,80,0,-.5,0));
 if(['diagonal-ramp','ramp-edge'].includes(terrain)){const r=box(9,.2,10,0,1.6,3);r.rotation.set(.25,terrain==='diagonal-ramp'?.5:0,.12);r.updateMatrixWorld(true);meshes.push(r);}
 if(terrain.startsWith('stairs'))for(let i=0;i<8;i++)meshes.push(box(5,.18*(i+1),.75,0,.09*(i+1),i*.75-2));
 if(terrain==='low-ceiling')meshes.push(box(12,.15,12,0,2.05,0));
 if(terrain==='narrow-corner')meshes.push(box(.08,10,12,1.2,5,0),box(12,10,.08,0,5,2));
 for(const mesh of meshes)world.enqueue(mesh);for(let i=0;i<35;i++)world.update(new T.Vector3());
 for(const fps of [24,30,60,144])for(const variant of ['reverse-diagonal','sprint-attack-jump']){
 if(fpsFilter && fps!==fpsFilter)continue;
 const c=actor(),p=new SwingPhysics(c.scene,{isStreamed:true,checkCollision:()=>({collided:false}),collisionWorld:world,buildingMeshes:meshes,colliders:[],resolveMovement:world.resolve.bind(world),raycast:world.raycast.bind(world),supportHeight(pos){const h=world.groundAt(pos,.65);return h!==null&&Math.abs(pos.y-h-.1)<.3?h:null;},getRooftopSpawn:()=>new T.Vector3(0,terrain==='roof-edge'?2.1:.1,-3)},c,new Proxy({},{get:()=>()=>{}}));
 const camera=new T.PerspectiveCamera(64,1.6,.01,200),tps=new ThirdPersonCamera(camera,{});let maxFootStep=0,maxRelativeFootStep=0,minToe=Infinity,worstToe=null,worstStep=null,resets=0,resetFrame=false,lastRoot=null,frames=0,jumpSeen=false,attacks=new Set(),maxJoint=0;const previous={},rest=Object.values(c.bones).filter(b=>b.parent?.isBone).map(b=>[b,b.position.length()]);
 try{
  p.position.set(terrain==='diagonal-ramp'?-1:0,5,terrain==='stairs-down'?3.5:terrain==='roof-edge'?2:-3);p.position.y=(world.groundAt(p.position,10)??0)+.1;p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';tps.placeBehind(p.position,0);tps.lockBehind=false;
  const combat=new CombatSystem(c.scene,p,c,{audio:new Proxy({},{get:()=>()=>{}})});if(variant==='sprint-attack-jump')combat.toggle();
  const resetCombat=p.onReset;p.onReset=()=>{resetCombat?.();resets++;resetFrame=true;};
  for(let i=0;i<Math.ceil(fps*2.6);i++){
   const t=i/fps,back=terrain==='stairs-down',input={forward:!back&&t<1.1,backward:back||t>=1.1,left:variant==='reverse-diagonal'&&t<1.1,right:variant==='reverse-diagonal'&&t>=1.1,sprint:variant==='sprint-attack-jump',wallRun:false,webHold:false,strafe:variant==='reverse-diagonal'?(t<1.1?-1:1):0,jump:variant==='sprint-attack-jump'&&i===Math.floor(fps*1.7)};
   if(i===Math.floor(fps*.25)&&variant==='sprint-attack-jump')combat.attack(camera);if(i===Math.floor(fps*.95)&&variant==='sprint-attack-jump')combat.straight(camera);
   if(i%Math.max(1,Math.round(fps*.2))===0)tps.cycleMode();tps.handleMouseMove(Math.sin(t*4)*8/fps,0);
   const previousState=p.state;combat.before(1/fps,camera,input);p.update(1/fps,input,camera);combat.after(1/fps);tps.update(1/fps,p.renderPosition,p.velocity,p.isSwinging,meshes,world.raycast.bind(world));frames++;
   if(c.combatAction)attacks.add(c.combatAction.key);jumpSeen ||= p.state==='JUMPING';assert(p.position.toArray().concat(p.velocity.toArray()).every(Number.isFinite));assert(p.velocity.length()<=p.maxSpeed+1e-6);
   for(const [b,len]of rest){assert(Math.abs(b.position.length()-len)<1e-6,'Limb length changed');assert(b.quaternion.toArray().every(Number.isFinite));assert(Math.abs(b.quaternion.length()-1)<1e-4);}
   for(const item of c.jointConstraints||[]){const angle=item.rest.angleTo(item.bone.quaternion);maxJoint=Math.max(maxJoint,angle);if(['foot','toebase'].includes(item.kind))assert(angle<=item.limit+1e-5,'Rendered ankle exceeded its anatomical limit');}
   for(const side of ['left','right']){const foot=point(c,side+'foot');if(previous[side] && !resetFrame){maxFootStep=Math.max(maxFootStep,foot.distanceTo(previous[side]));const relative=foot.clone().sub(c.group.position).distanceTo(previous[side].clone().sub(lastRoot));if(relative>maxRelativeFootStep){maxRelativeFootStep=relative;worstStep={frame:i,side,state:p.state,previousState,root:c.group.position.toArray(),lastRoot:lastRoot.toArray(),foot:foot.toArray(),previousFoot:previous[side].toArray(),velocity:p.velocity.toArray()};}assert(relative<=(18+2*Math.hypot(p.velocity.x,p.velocity.z))/fps+.08,'Foot snapped relative to the moving body');}previous[side]=foot;
    if(['IDLE','RUNNING','SPRINTING'].includes(p.state)){const toe=point(c,side+'toebase'),support=c.surfaceProbe(toe);if(support && toe.y-support.height<minToe){minToe=toe.y-support.height;worstToe={frame:i,side,state:p.state,root:c.group.position.toArray(),toe:toe.toArray(),height:support.height};}}
   }
   lastRoot=c.group.position.clone();resetFrame=false;
  }
  assert(minToe>=-.002,'Toe penetrated the sampled support');
  results.push({terrain,fps,variant,pass:true,frames,maxFootStep,maxRelativeFootStep,resets,worstToe,worstStep,minToe:Number.isFinite(minToe)?minToe:null,jumpSeen,attacks:[...attacks],maxJoint,finalState:p.state});console.log('PASS',terrain,fps,variant);
 }catch(e){results.push({terrain,fps,variant,pass:false,error:e.message,frames,maxFootStep,maxRelativeFootStep,resets,worstToe,worstStep,minToe});console.error('FAIL',terrain,fps,variant,e.message);}finally{disposeRig(c);}
 }
 world.dispose();for(const m of meshes){m.geometry.dispose();m.material.dispose();}
}
fs.writeFileSync(folder+'/terrain-motion-results.json',JSON.stringify({cases:results.length,failed:results.filter(r=>!r.pass).length,results},null,2)+'\n');console.log(`Expanded terrain motion: ${results.filter(r=>r.pass).length}/${results.length}`);if(results.some(r=>!r.pass))process.exitCode=1;
