import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { attachRooms } from './rooms.mjs';
import { cleanSettings } from '../src/PlayerSettings.js';
import * as THREE from 'three';
import {CombatPractice} from '../src/CombatPractice.js';
import {AuditMetrics} from '../src/AuditMetrics.js';
import {CombatSystem} from '../src/Combat.js';
import {StreamedCollision} from '../src/StreamedCollision.js';
import {UrbanGroundCity} from '../src/UrbanGroundCity.js';
import {ThirdPersonCamera} from '../src/Camera.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {updateDualWebReview} from '../src/MotionReview.js';

const results=[];
async function check(name,run){try{await run();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function roomTest(run){
  const server=createServer(),api=attachRooms(server),sockets=[];
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);sockets.push(ws);ws.events=[];ws.on('message',raw=>ws.events.push(JSON.parse(raw)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return ws;}
  const send=(ws,data)=>ws.send(JSON.stringify(data));
  async function wait(ws,predicate){const end=Date.now()+2000;while(Date.now()<end){const i=ws.events.findIndex(predicate);if(i>=0)return ws.events.splice(i,1)[0];await sleep(10);}throw new Error('Expected room event not received');}
  async function create(ws,enhanced=false,mode='free'){send(ws,{type:'create',capacity:2,city:'procedural',mode,enhanced});const joined=await wait(ws,e=>e.type==='joined');return {joined,room:api.rooms.get(joined.code)};}
  try{await run({connect,send,wait,create,api,sleep});}finally{for(const ws of sockets)ws.terminate();await new Promise(r=>server.close(r));}
}

await check('Paused defenders remain damageable at their accepted server position',()=>roomTest(async({connect,create,send,wait})=>{
  const cop=await connect(),runner=await connect();const {joined,room}=await create(cop,true,'tag');
  send(runner,{type:'join',code:joined.code,city:'procedural'});const runnerJoined=await wait(runner,e=>e.type==='joined');
  room.phase='playing';room.vulnerableAt=0;room.endsAt=Date.now()+30000;
  const now=Date.now();Object.assign(room.players.get(joined.id),{team:'police',seen:true,x:0,y:50,z:0,facing:0,lastMove:now});
  Object.assign(room.players.get(runnerJoined.id),{team:'runner',seen:true,x:0,y:50,z:2,lastMove:now-5000});
  send(cop,{type:'attack',kind:'punch',facing:0});
  const hit=await wait(runner,e=>e.type==='hit');assert.equal(hit.health,75);
}));

await check('Null or malformed saved settings preserve usable defaults',()=>{
  for(const saved of [null,{},[],42,'broken'])assert.deepEqual(cleanSettings(saved),cleanSettings());
});
await check('Practice from a loaded lobby enters solo play before spawning',()=>{
  const practice=Object.create(CombatPractice.prototype);let entered=0,spawned=0,focused=0;
  const game={assetsReady:true,isPlaying:false,physics:{position:new THREE.Vector3(0,.1,0),supportHeight:()=>0},
    experience:{safe:()=>true,ghost:{stop(){}}},combat:{mode:'combat',health:0,stamina:0,obstructed:()=>false,cancel(){}},
    timeTrial:{stop(){}},clearInput(){},setPaused(){},showNotice(){},canvas:{focus(){focused++;}}};
  game.multiplayer={beginSolo(){entered++;game.isPlaying=true;}};
  practice.game=game;practice.stop=()=>{};practice.spawn=()=>{spawned++;};practice.start('dummy');
  assert.equal(entered,1);assert.equal(spawned,1);assert.equal(practice.active,true);assert.equal(focused,1);
});
await check('Practice does not start while assets are unavailable or online',()=>{
  const practice=Object.create(CombatPractice.prototype);let notice=0;
  practice.game={assetsReady:false,showNotice(){notice++;},multiplayer:{beginSolo(){throw Error('Unexpected start');}}};
  practice.start();assert.equal(notice,1);practice.game.multiplayer.room={};practice.start();assert.equal(notice,2);
});
await check('Opt-in frame metrics measure percentiles and keep a bounded window',()=>{
  const metrics=new AuditMetrics();metrics.update(0,true);for(let i=1;i<=4000;i++)metrics.update(i/60,true);
  const result=metrics.snapshot();assert.equal(result.windowFrames,3600);assert.equal(result.totalFrames,4000);
  assert(Math.abs(result.averageFps-60)<.01);assert.equal(result.frameMs.p95,16.67);
  metrics.update(70,false);assert.equal(metrics.snapshot().totalFrames,4000);
  metrics.update(900,true);assert.equal(metrics.snapshot().totalFrames,4000,'Paused interval polluted active performance');
});
await check('Camera keeps nearer pending LOD walls and queries baked terrain without duplicate triangles',async()=>{
  const world=new StreamedCollision();await world.initialized;
  try{
    const baked=new THREE.Mesh(new THREE.BoxGeometry(8,8,.1));baked.position.z=4;baked.updateMatrixWorld(true);
    const pending=new THREE.Mesh(new THREE.BoxGeometry(8,8,.1));pending.position.z=2;pending.updateMatrixWorld(true);
    world.enqueue(baked);world.setActiveMeshes([baked]);world.update(new THREE.Vector3());
    const city=Object.create(UrbanGroundCity.prototype);city.collisionWorld=world;city.buildingMeshes=[baked,pending];
    const camera=new ThirdPersonCamera(new THREE.PerspectiveCamera(),{}),origin=new THREE.Vector3(0,2,0),direction=new THREE.Vector3(0,0,1);
    baked.raycast=()=>{throw Error('Duplicate triangle scan for baked terrain');};
    const before=camera.safeDistance(origin,direction,8,city.getCameraCollisionMeshes(origin),city.raycast.bind(city));
    assert(before<2,'Pending visual LOD was ignored');
    world.enqueue(pending);world.setActiveMeshes([baked,pending]);world.update(new THREE.Vector3());
    pending.raycast=()=>{throw Error('Duplicate scan for newly baked terrain');};
    const after=camera.safeDistance(origin,direction,8,city.getCameraCollisionMeshes(origin),city.raycast.bind(city));
    assert(Math.abs(before-after)<.01,'Camera clearance changed after collision baking');
    assert.equal(city.getCameraCollisionMeshes(new THREE.Vector3(800,2,0)).length,2,'Distant spectator lost visual collision fallback');
    world.meshes.get(baked.uuid).queued=true;
    assert(city.getCameraCollisionMeshes(origin).includes(baked),'Rebuilding collider lost its visual fallback');
  }finally{world.dispose();}
});
await check('Profiling preserves method receiver, arguments, return values and errors',()=>{
  const metrics=new AuditMetrics(),target={value:4,add(n){return this.value+n;},fail(){throw Error('expected');}};
  metrics.profile(target,'add','add');metrics.profile(target,'fail','fail');assert.equal(target.add(3),7);
  assert.throws(()=>target.fail(),/expected/);assert.equal(metrics.sectionSnapshot().add.calls,1);assert.equal(metrics.sectionSnapshot().fail.calls,1);
});
await check('The dual-web review actually holds two independent ropes before and after replacement',()=>{
  const meshes=[-4,4].map(x=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(1.5,8,1.5));mesh.position.set(x,6,4);mesh.updateMatrixWorld(true);return mesh;});
  const city={buildingMeshes:meshes,colliders:[],checkCollision:()=>({collided:false}),getRooftopSpawn:()=>new THREE.Vector3(0,.1,0)};
  const silent=new Proxy({},{get:()=>()=>{}}),character={group:new THREE.Group(),update(){},fireWeb(){},stopAnimation(){}};
  const physics=new SwingPhysics(new THREE.Scene(),city,character,silent);physics.position.set(0,3,0);physics.state='FALLING';
  const input={webHold:false,webFireHeld:false,webTap:false,webHoldRight:false,webFireHeldRight:false,webTapRight:false,strafe:0};
  const camera=new THREE.PerspectiveCamera();let leftAnchor,rightAnchor;
  for(let i=0;i<540;i++){
    const old=i/120,elapsed=(i+1)/120;camera.rotation.y=Math.PI;camera.position.copy(physics.position).add(new THREE.Vector3(0,1.3,0));
    updateDualWebReview(physics,input,camera,old,elapsed);physics.update(1/120,input,camera);
    if(i===119){assert.equal(physics.webs.length,2);leftAnchor=physics.webs.find(w=>w.button===0).anchor.clone();rightAnchor=physics.webs.find(w=>w.button===2).anchor.clone();}
  }
  assert.equal(physics.webs.length,2);assert(physics.webs.find(w=>w.button===2).anchor.equals(rightAnchor));
  assert(!physics.webs.find(w=>w.button===0).anchor.equals(leftAnchor),'Review never replaced the left rope');
});
await check('Being defeated in practice is not reported as successful completion',()=>{
  const notices=[],physics={position:new THREE.Vector3(0,.1,0),velocity:new THREE.Vector3(),state:'IDLE',facingAngle:0,
    city:{raycast:()=>null},clearWebAnchor(){},clearPendingInput(){},resetPosition(){}};
  const scene=new THREE.Scene(),combat=new CombatSystem(scene,physics,{group:new THREE.Group()});combat.onNotice=message=>notices.push(message);combat.health=10;
  const practice=Object.create(CombatPractice.prototype);practice.projectiles=[];practice.active=true;
  practice.game={scene,physics,combat,camera:new THREE.PerspectiveCamera(),city:physics.city,showNotice:message=>notices.push(message)};
  const enemy=practice.spawn('melee',new THREE.Vector3(0,.1,2));enemy.windup=.001;
  practice.update(.02);assert.equal(combat.enemies.length,0);assert(notices.some(n=>n.includes('회복')));
  assert(!notices.some(n=>n.includes('연습 완료')),'Defeat was displayed as success');
});
await check('Enhanced host cannot become ready with an invalid arena',()=>roomTest(async({connect,create,send,sleep})=>{
  const ws=await connect(),{room}=await create(ws,true);
  send(ws,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:null,z:0}});await sleep(80);
  assert.equal([...room.players.values()][0].ready,false,'Invalid start point was accepted');
}));
await check('Valid enhanced arena supports a two-player start',()=>roomTest(async({connect,create,send,wait})=>{
  const host=await connect(),guest=await connect(),{room}=await create(host,true);
  send(guest,{type:'join',code:room.code,city:'procedural'});await wait(host,e=>e.type==='room'&&e.room.count===2);
  send(host,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:40,z:0},roofs:[{x:70,y:40,z:0},{x:-70,y:40,z:0}]});
  send(guest,{type:'ready',ready:true,terrainReady:true});await wait(host,e=>e.type==='room'&&e.players.every(p=>p.ready));
  send(host,{type:'start'});await wait(host,e=>e.type==='room'&&e.room.phase==='playing');assert(room.arena);
}));
await check('Repeated short teleports cannot reuse the movement jitter allowance',()=>roomTest(async({connect,create,send,wait,sleep})=>{
  const a=await connect(),b=await connect(),{room}=await create(a);
  send(b,{type:'join',code:room.code,city:'procedural'});await wait(a,e=>e.type==='room'&&e.room.count===2);
  send(a,{type:'ready',ready:true});send(b,{type:'ready',ready:true});await wait(a,e=>e.type==='room'&&e.players.every(p=>p.ready));
  send(a,{type:'start'});await wait(a,e=>e.type==='room'&&e.room.phase==='playing');
  send(a,{type:'move',x:0,y:200,z:0,facing:0});await wait(b,e=>e.type==='move'&&e.x===0);
  await sleep(55);send(a,{type:'move',x:18,y:200,z:0,facing:0});await wait(b,e=>e.type==='move'&&e.x===18);
  await sleep(55);send(a,{type:'move',x:36,y:200,z:0,facing:0});await sleep(60);
  assert(!b.events.some(e=>e.type==='move'&&e.x===36),'Two 18m teleports in ~110ms were accepted');
  assert(![...room.players.values()].some(p=>p.x===36),'Server stored the rejected teleport');
}));
await check('Normal maximum-speed movement survives delayed updates',()=>roomTest(async({connect,create,send,wait,sleep})=>{
  const a=await connect(),b=await connect(),{room}=await create(a);
  send(b,{type:'join',code:room.code,city:'procedural'});await wait(a,e=>e.type==='room'&&e.room.count===2);
  send(a,{type:'ready',ready:true});send(b,{type:'ready',ready:true});await wait(a,e=>e.type==='room'&&e.players.every(p=>p.ready));
  send(a,{type:'start'});await wait(a,e=>e.type==='room'&&e.room.phase==='playing');
  send(a,{type:'move',x:0,y:200,z:0,facing:0});await wait(b,e=>e.type==='move'&&e.x===0);
  await sleep(500);send(a,{type:'move',x:24,y:200,z:0,facing:0});await wait(b,e=>e.type==='move'&&e.x===24);
  for(let i=1;i<=6;i++){await sleep(55);send(a,{type:'move',x:24+i*2.4,y:200,z:0,facing:0});await wait(b,e=>e.type==='move'&&Math.abs(e.x-(24+i*2.4))<1e-6);}
}));
await check('The final runner elimination finishes one match with police victory',()=>roomTest(async({connect,create,send,wait,sleep})=>{
  const a=await connect(),b=await connect(),{room,joined}=await create(a,false,'tag');
  send(b,{type:'join',code:room.code,city:'procedural'});await wait(a,e=>e.type==='room'&&e.room.count===2);
  send(a,{type:'ready',ready:true});send(b,{type:'ready',ready:true});await wait(a,e=>e.type==='room'&&e.players.every(p=>p.ready));
  send(a,{type:'start'});const started=await wait(a,e=>e.type==='room'&&e.room.phase==='playing');
  // Opening protection has its own integration scenarios. Advance this local
  // fixture to combat so the test isolates the terminal health transition.
  room.vulnerableAt=Date.now()-1;
  const cop=started.players.find(p=>p.team==='police').id===joined.id?a:b;
  const runner=cop===a?b:a;
  send(cop,{type:'move',x:0,y:200,z:0,facing:0});send(runner,{type:'move',x:0,y:200,z:2,facing:0});await wait(cop,e=>e.type==='move'&&e.z===2);
  for(const health of [75,50,25,0]){send(cop,{type:'attack',kind:'punch',facing:0});assert.equal((await wait(runner,e=>e.type==='hit')).health,health);if(health)await sleep(570);}
  const finished=await wait(cop,e=>e.type==='room'&&e.room.phase==='finished');assert.equal(finished.winner,'police');
  assert.equal(room.phase,'finished');assert.equal(room.winner,'police');assert.equal(started.players.length,2);
  cop.events=[];send(cop,{type:'attack',kind:'punch',facing:0});await sleep(80);assert(!cop.events.some(e=>e.type==='hit'),'Attack continued after match end');
}));
await check('Resuming from an occupied socket cannot strand its previous membership',()=>roomTest(async({connect,create,send,sleep,api})=>{
  const old=await connect(),{joined,room}=await create(old,true);room.phase='playing';
  old.terminate();await sleep(80);
  const ws=await connect(),{room:other}=await create(ws);
  send(ws,{type:'resume',code:joined.code,token:joined.resumeToken});await sleep(80);
  const memberships=[...api.rooms.values()].flatMap(r=>[...r.players.values()]).filter(p=>p.ws.readyState===1);
  assert.equal(memberships.length,1,'One socket occupies two rooms');
  assert.equal(other.players.size,1,'Occupied session should stay in its current room');
}));
await check('Oversized WebSocket payload is rejected at the transport boundary',()=>roomTest(async({connect,sleep})=>{
  const ws=await connect();let closed=false;ws.once('close',()=>{closed=true;});
  ws.send('x'.repeat(8192));await sleep(160);assert(closed,'Oversized connection remained open');
}));
await check('Control-message floods cannot trigger unlimited room-list broadcasts',()=>roomTest(async({connect,send,sleep})=>{
  const ws=await connect();let closed=false;ws.once('close',()=>{closed=true;});
  for(let i=0;i<150;i++)send(ws,{type:'list'});
  await sleep(160);assert(closed,'Flooding connection remained open');
}));
await check('Malformed messages do not prevent the next valid command',()=>roomTest(async({connect,create})=>{
  const ws=await connect();ws.send('{broken');const {room}=await create(ws);assert.equal(room.players.size,1);
}));

console.log(JSON.stringify({passed:results.filter(r=>r.status==='PASS').length,total:results.length,results},null,2));
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
