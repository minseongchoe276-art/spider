import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {ThirdPersonCamera} from '../src/Camera.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';

const {actor}=await loadMotionRig(),results=[];
for(const fps of [24,60,144])for(const input of [{backward:true},{left:true},{right:true},{forward:true,right:true}])for(const guard of [false,true]){
  const c=actor(),city={buildingMeshes:[],colliders:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
  const p=new SwingPhysics(c.scene,city,c,new Proxy({},{get:()=>()=>{}}));
  const camera=new T.PerspectiveCamera(),view=new ThirdPersonCamera(camera,{});
  p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';
  p.combatMotion=guard?{key:'guard'}:null;
  view.placeBehind(p.position,0);view.update(0,p.position,p.velocity,false,[],null,0,input);
  camera.updateMatrixWorld(true);
  const forward=camera.getWorldDirection(new T.Vector3()).setY(0).normalize();
  const right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0));
  const expected=forward.clone().multiplyScalar(Number(!!input.forward)-Number(!!input.backward)).addScaledVector(right,Number(!!input.right)-Number(!!input.left)).normalize();
  try{
    for(let n=0;n<fps*2;n++){
      p.update(1/fps,input,camera);
      view.update(1/fps,p.renderPosition,p.velocity,false,[],null,p.facingAngle,input);camera.updateMatrixWorld(true);
    }
    const along=p.position.dot(expected),side=p.position.clone().addScaledVector(expected,-along).setY(0).length();
    assert(along>(guard?2:7),'Camera feedback traps directional movement in a circle');
    assert(side<.15,`Camera feedback curves the requested straight path: ${JSON.stringify({fps,input,guard,along,side,yaw:view.yaw})}`);
    assert(Math.abs(view.yaw)<1e-6,'Reverse/side input rotates its camera reference');
    for(let n=0;n<fps;n++)view.update(1/fps,p.position,new T.Vector3(),false,[],null,p.facingAngle,{});
    assert(Math.abs(view.yaw)<1e-6,'Releasing movement unexpectedly spins the view');
    view.recenterBehind(p.facingAngle);
    for(let n=0;n<fps;n++)view.update(1/fps,p.position,new T.Vector3(),false,[],null,p.facingAngle,{});
    assert(Math.abs(Math.atan2(Math.sin(view.yaw-p.facingAngle),Math.cos(view.yaw-p.facingAngle)))<.01,'C no longer recenters');
    results.push({fps,input,guard,along,side,pass:true});
  }finally{disposeRig(c);}
}
fs.mkdirSync('docs/qa/live-motion-2026-10-22',{recursive:true});
fs.writeFileSync('docs/qa/live-motion-2026-10-22/camera-movement.json',JSON.stringify(results,null,2)+'\n');
console.log(`PASS ${results.length} real physics/camera movement cases, including guard and stop/recenter`);
