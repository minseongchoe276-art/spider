import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {StreamedCollision} from '../src/StreamedCollision.js';
import {GameApp} from '../src/main.js';

const camera=new THREE.PerspectiveCamera(),audio=new Proxy({},{get:()=>()=>{}});
function player(){const p=new SwingPhysics(new THREE.Scene(),{buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false})},
  {group:new THREE.Group(),update(){},fireWeb(){}},audio);
  p.position.set(-12,44,0);p.state='FALLING';p.findBestAnchor=()=>new THREE.Vector3(0,60,0);return p;}
const held=()=>({webHold:true,webFireHeld:true});

for(const fps of [30,60,144]){
  const p=player();p.startSwing(camera);const input=held(),anchor=p.anchorPoint.clone();let low=Infinity,reversed=false;
  p.city.isStreamed=true;p.city.collisionWorld={ready:true,groundAt:()=>0};
  let present=true;
  p.city.raycast=(origin,direction,far)=>far<=1.61 && present
    ? {point:anchor.clone(),normal:new THREE.Vector3(0,1,0)} : null;
  for(let n=0;n<fps*8;n++){
    present=!(n>=fps && n<fps+Math.floor(fps*.2));
    p.update(1/fps,input,camera);assert(p.isSwinging,'Transient LOD loss severed the strand');
    assert(p.anchorPoint.equals(anchor));low=Math.min(low,p.position.y);
    if(p.position.x>5 && p.velocity.x<0)reversed=true;
  }
  assert(low<40.5 && reversed,'Held rope did not complete a pendulum arc and reverse');
  present=false;for(let n=0;n<Math.ceil(fps*.4);n++)p.update(1/fps,input,camera);
  assert(!p.isSwinging,'A permanently deleted support remained an invisible anchor');
  console.log(`PASS ${fps}fps: temporary LOD loss keeps the original pivot and full arc; permanent loss releases`);
}

const endpoint=player(),anchor=new THREE.Vector3(0,60,0);
endpoint.city.raycast=()=>({point:anchor.clone().add(new THREE.Vector3(0,-1.1,0)),normal:new THREE.Vector3(0,1,0)});
assert(!endpoint.webObstructed({anchor,normal:new THREE.Vector3(0,1,0)}),'Endpoint seam cut a valid strand');
endpoint.city.raycast=()=>({point:new THREE.Vector3(-6,50,0),normal:new THREE.Vector3(1,0,0)});
assert(endpoint.webObstructed({anchor,normal:new THREE.Vector3(0,1,0)}),'A real intervening wall was ignored');
console.log('PASS attachment seam tolerance never ignores a real intervening wall');

const retry=player(),input=held();retry.startSwing(camera);let blocked=true;
retry.webObstructed=()=>blocked;
retry.update(1/60,input,camera);assert(!retry.isSwinging);assert(input.webHold && input.webFireHeld);
blocked=false;for(let n=0;n<20;n++)retry.update(1/60,input,camera);
assert(retry.isSwinging,'Held press could not reconnect after its obstacle cleared');
input.webHold=input.webFireHeld=false;retry.update(1/60,input,camera);assert(!retry.isSwinging);
console.log('PASS held press reconnects after obstruction; mouse release still detaches immediately');

const oldRAF=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>{};
try{
  const app=Object.create(GameApp.prototype),press=held();
  Object.assign(app,{clock:{getDelta:()=>1/60,elapsedTime:1/60},city:{update(){},buildingMeshes:[]},
    assetsReady:true,isPlaying:true,isPaused:false,input:press,camera,
    physics:{isSwinging:true,update(){this.isSwinging=false;},position:new THREE.Vector3(),velocity:new THREE.Vector3()},
    tpsCamera:{update(){}},preferences:{values:{}},vfx:{update(){}},timeTrial:{update(){}},
    updateTrialHUD(){},updateHUD(){},updateVitals(){},updateWorldMarker(){},syncHudChrome(){},renderer:{render(){}},scene:new THREE.Scene()});
  app.animate();assert(press.webHold && press.webFireHeld,'Render loop erased the physically held button after an automatic drop');
  console.log('PASS actual game render loop preserves a held button when physics loses its attachment');
}finally{globalThis.requestAnimationFrame=oldRAF;}

const graze=player();graze.position.set(0,.11,0);graze.findBestAnchor=()=>new THREE.Vector3(0,30,30);
graze.state='FALLING';graze.launchAssistAvailable=false;graze.velocity.set(0,-5,10);graze.startSwing(camera);const grazeInput=held();
graze.update(1/60,grazeInput,camera);assert(graze.isSwinging,'Street contact automatically cut the held rope');
const pivot=graze.anchorPoint.clone();let grazeRise=0;for(let n=0;n<180;n++){graze.update(1/60,grazeInput,camera);grazeRise=Math.max(grazeRise,graze.position.y-.1);}
assert(graze.isSwinging && graze.anchorPoint.equals(pivot));assert(grazeRise>0.1,'A taut held rope failed to return a grazing contact to its swing arc');assert(graze.velocity.length()<=graze.maxSpeed+1e-6);
console.log('PASS ground contact keeps the valid pivot and returns to a bounded swing arc');

const world=new StreamedCollision();await world.initialized;
try{
  const floor=new THREE.Mesh(new THREE.BoxGeometry(100,1,100));floor.position.y=-.5;
  const ceiling=new THREE.Mesh(new THREE.BoxGeometry(50,1,50));ceiling.position.y=60.5;
  world.enqueue(floor);world.enqueue(ceiling);for(let n=0;n<15;n++)world.update(new THREE.Vector3());
  const p=player();Object.assign(p.city,{isStreamed:true,collisionWorld:world,buildingMeshes:[floor,ceiling],
    raycast:(...args)=>world.raycast(...args),resolveMovement:(...args)=>world.resolve(...args),
    supportHeight:pos=>{const h=world.groundAt(pos,.5);return h!==null && Math.abs(pos.y-h-.1)<.25?h:null;}});
  p.bestAnchorNormal=new THREE.Vector3(0,-1,0);assert(p.startSwing(camera));
  const attached=world.meshes.get(ceiling.uuid);assert(world.tetherColliders.has(attached.collider.handle));
  world.setActiveMeshes([floor]);attached.inactiveSince=-10000;
  let reverse=false;
  for(let n=0;n<480;n++){world.update(p.position);p.update(1/60,held(),camera);assert(p.isSwinging);
    if(p.position.x>5 && p.velocity.x<0)reverse=true;}
  assert(reverse);assert(world.meshes.has(ceiling.uuid),'Visual LOD disposal removed a live attachment');
  p.releaseSwing(false);assert.equal(world.tetherColliders.size,0);world.update(p.position);
  assert(!world.meshes.has(ceiling.uuid),'Released anchor leaked its old collider');
  console.log('PASS actual Rapier triangles: full 8s arc survives visual LOD eviction; release frees the retained tile');
}finally{world.dispose();}
