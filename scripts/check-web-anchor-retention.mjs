import assert from 'node:assert/strict';
import * as T from 'three';
import {StreamedCollision} from '../src/StreamedCollision.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
for(const inProgress of [false,true]){
 const world=new StreamedCollision();await world.initialized;
 const mesh=new T.Mesh(new T.BoxGeometry(1000,1,1000));mesh.position.y=60.5;mesh.updateMatrixWorld(true);world.setActiveMeshes([mesh]);world.enqueue(mesh);
 for(let i=0;i<30;i++)world.update(new T.Vector3());const original=world.meshes.get(mesh.uuid),handle=original.collider.handle,target=new T.Vector3(220,40,0);
 if(inProgress){world.update(target,{budgetMs:100,maxIndices:3});assert(world.job,'Expected a rebake in progress');}
 world.setTetherColliders([handle]);for(let i=0;i<60;i++)world.update(target);
 assert.notEqual(world.meshes.get(mesh.uuid).collider,original.collider,'Pinned rope blocked coverage expansion');assert(world.world.getCollider(handle)===original.collider,'Coverage refresh deleted the actual pinned collider');assert(world.hasCollider(original.collider));assert.equal(world.retainedTethers.size,1);assert(world.meshes.get(mesh.uuid).coverageCenter.equals(target));assert.equal(world.job,null);
 const holder=Object.create(SwingPhysics.prototype);holder.city={isStreamed:true,collisionWorld:world,raycast(){assert.fail('A real retained anchor must not be replaced by a new probe');}};assert(holder.anchorSupported({anchor:new T.Vector3(0,60,0),supportCollider:original.collider}));
 if(!inProgress){const second=world.meshes.get(mesh.uuid).collider;world.setTetherColliders([handle,second.handle]);for(let i=0;i<30;i++)world.update(new T.Vector3(450,40,0));assert.equal(world.retainedTethers.size,2);world.setTetherColliders([second.handle]);assert(!world.hasCollider(original.collider));assert(world.hasCollider(second));assert.equal(world.retainedTethers.size,1);}
 world.setTetherColliders([]);for(let i=0;i<30;i++)world.update(target);
 assert.notEqual(world.meshes.get(mesh.uuid).collider,original.collider);assert.equal(world.world.getCollider(handle),null);assert.equal(world.retainedTethers.size,0);
 world.dispose();mesh.geometry.dispose();console.log('PASS pinned anchor survives coverage rebake'+(inProgress?' already in progress':' scheduled after attachment')+'; release frees the retired collider');
}

const audio=new Proxy({},{get:()=>()=>{}}),camera=new T.PerspectiveCamera();
function player(){return new SwingPhysics(new T.Scene(),{buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false})},{group:new T.Group(),update(){},fireWeb(){}},audio);}
for(const mode of ['seam','replacement-seam','backface','wall-after-seam','perpendicular','parallel']){
 const p=player(),collider={handle:17},normal=new T.Vector3(0,0,-1),anchor=new T.Vector3(0,30,0);p.position.set(0,10,0);
 p.city.isStreamed=true;p.city.collisionWorld={ready:true,meshes:new Map([['facade',{collider}]])};let rays=0;
 p.city.raycast=(origin)=>{
  rays++;
  if(rays===2){assert.equal(origin.z,-.2);return mode==='wall-after-seam'?{point:new T.Vector3(0,20,-.2),normal:new T.Vector3(1,0,0),collider}:null;}
  return {point:new T.Vector3(0,22,mode==='parallel'?.5:0),normal:mode==='perpendicular'?new T.Vector3(1,0,0):normal.clone().multiplyScalar(mode==='backface'?-1:1),collider:mode==='replacement-seam'?{handle:18}:collider};
 };
 const blocked=p.webObstructed({anchor,normal,supportCollider:collider});
 assert.equal(blocked,['wall-after-seam','perpendicular','parallel'].includes(mode),mode);
 assert.equal(rays,['seam','replacement-seam','backface','wall-after-seam'].includes(mode)?2:1,mode);
 console.log('PASS facade validation: '+mode);
}
for(const fps of [30,60,144]){
 const p=player();p.position.set(0,.11,0);p.state='FALLING';p.velocity.set(0,-2,0);p.launchAssistAvailable=false;p.findBestAnchor=()=>new T.Vector3(0,2.5,6);assert(p.startSwing(camera));const anchor=p.anchorPoint.clone(),length=p.webs[0].length,input={webHold:true,webFireHeld:true};
 for(let i=0;i<fps*3;i++){p.update(1/fps,input,camera);assert(p.isSwinging,'Landing severed a low held anchor');assert(p.anchorPoint.equals(anchor));assert.equal(p.webs[0].length,length);assert(p.position.y<.2,'A low anchor produced an artificial jump');}
 input.webHold=input.webFireHeld=false;p.update(1/fps,input,camera);assert(!p.isSwinging);assert.equal(p.webs.length,0);console.log('PASS '+fps+'fps low anchor survives landing for 3s at fixed length; mouse release detaches');
}
const handoff=player(),heldCollider={handle:23};let pinned=[];
handoff.position.set(0,10,0);handoff.zipAnchor=new T.Vector3(0,30,10);handoff.lastWebNormal=new T.Vector3(0,0,-1);handoff.city.isStreamed=true;handoff.city.collisionWorld={ready:true,meshes:new Map(),setTetherColliders:handles=>{pinned=handles;}};handoff.city.raycast=()=>({point:handoff.zipAnchor.clone(),normal:handoff.lastWebNormal.clone(),collider:heldCollider});assert(handoff.enterSwingFromPull(camera));assert.equal(handoff.webs[0].supportCollider,heldCollider);assert.deepEqual(pinned,[23]);console.log('PASS pull-to-swing handoff pins the validated collider immediately');
