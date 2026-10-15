import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MOTIONS } from '../src/MotionCatalog.js';
import { RemoteMotion, sanitizePose, capturePose } from '../src/RemoteMotion.js';
import { SupabaseRooms, roomAuthOptions } from '../src/SupabaseRooms.js';
import { Multiplayer } from '../src/Multiplayer.js';

globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,values);}};
const raw=fs.readFileSync('public/models/spiderman.glb'),length=raw.readUInt32LE(12);
const json=JSON.parse(raw.subarray(20,20+length));
json.buffers[0].uri=`data:application/octet-stream;base64,${raw.subarray(28+length).toString('base64')}`;
delete json.images;delete json.textures;json.materials=[];
json.meshes.forEach(m=>m.primitives.forEach(p=>delete p.material));
const model=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
const source={model,mixer:new THREE.AnimationMixer(model),actions:{}};
for(const motion of MOTIONS){
  const data=JSON.parse(fs.readFileSync(`public/motions/${motion.key}.json`));
  const clip=THREE.AnimationClip.parse(data);clip.userData=data.userData;
  const action=source.mixer.clipAction(clip);action.setLoop(motion.loop?THREE.LoopRepeat:THREE.LoopOnce);
  action.clampWhenFinished=!motion.loop;source.actions[motion.key]=action;
}
const original=[];model.traverse(b=>{if(b.isBone)original.push([b,b.quaternion.clone()]);});
const geometry=model.getObjectByProperty('isSkinnedMesh',true).geometry;
let sharedDisposed=0;geometry.addEventListener('dispose',()=>sharedDisposed++);
const finalPositions=[];
// Joining while the local model is still loading must never create a capsule
// or freeze a partial set of clips into the opponent's rig.
const loadingSource={model:null,mixer:null,actions:{},isLoaded:false};
const loadingScene=new THREE.Scene();
const pending=new RemoteMotion(loadingScene,loadingSource,
  {id:'loading-friend',x:0,y:.1,z:0,facing:0,team:'free'},{colliders:[]});
pending.update(1/60,0);
assert.equal(pending.character.placeholder,undefined,'Opponent used a capsule proxy');
assert.equal(pending.character.isLoaded,false);
assert.equal(pending.marker.visible,false,'Marker appeared before the opponent model');
Object.assign(loadingSource,source);
pending.update(1/60,16);
assert.equal(pending.character.model,null,'Cloned a partially loaded animation set');
loadingSource.isLoaded=true;
pending.update(1/60,32);
assert(pending.character.model.getObjectByProperty('isSkinnedMesh',true));
assert.equal(pending.marker.visible,true);
assert.equal(Object.keys(pending.character.actions).length,MOTIONS.length);
const localSkin=source.model.getObjectByProperty('isSkinnedMesh',true);
const remoteSkin=pending.character.model.getObjectByProperty('isSkinnedMesh',true);
assert.equal(remoteSkin.material,localSkin.material,'Opponent lost the Spider-Man suit material');
assert.notEqual(remoteSkin.skeleton,localSkin.skeleton,'Opponent reused the local skeleton');
pending.dispose();assert.equal(loadingScene.children.length,0);
console.log('PASS remote appearance: no capsule, deferred full rig, shared suit material, independent skeleton');
for(const key of ['dodgeLeft','dodgeRight','dodgeBack','dodgeForward','slamLand','hit','hitHead']) {
  const pose=sanitizePose({state:'IDLE',velocity:{x:0,y:0,z:0},combat:{key,id:1,time:.1,duration:.7}});
  assert.equal(pose.combat?.key,key,`${key}: remote combat pose was discarded`);
}
{
  const remote=new RemoteMotion(new THREE.Scene(),source,
    {id:'slam-review',x:0,y:20,z:0,facing:0,team:'free'},{colliders:[]});
  remote.receive(remote.player,{state:'FALLING',velocity:{x:0,y:-20,z:0},
    combat:{key:'slam',id:1,time:.62,duration:1}},0);
  remote.update(1/60,500);
  assert.equal(remote.character.combatAction?.key,'slam','Remote slam disappeared before contact');
  assert.equal(remote.character.combatAction.time,.62,'Network extrapolation completed a slam in midair');
  remote.receive({...remote.player,y:.1},{state:'LANDING',velocity:{x:0,y:0,z:0},
    combat:{key:'slamLand',id:1,time:0,duration:.7}},510);
  remote.update(1/60,510);
  assert.equal(remote.character.activeAction.getClip().name,'slamLand');
  remote.dispose();
}
console.log('PASS remote skill coverage: directional dodges, landing, hit reactions and held airborne slam');
for(const fps of [30,60,144]){
  const scene=new THREE.Scene(),player={id:'friend',x:0,y:.1,z:0,facing:0,team:'free'};
  const remote=new RemoteMotion(scene,source,player,{colliders:[]});
  assert.notEqual(remote.character.model,source.model);
  assert.equal(remote.character.model.getObjectByProperty('isSkinnedMesh',true).geometry,geometry);
  const pose={state:'RUNNING',velocity:{x:0,y:0,z:2.8},webs:[]};
  for(let frame=0;frame<=fps*2;frame++){
    const t=frame/fps;
    if(frame===0 || Math.floor(t*10)>Math.floor((frame-1)/fps*10)){
      player.z=Math.floor(t*10)/10*2.8;remote.receive(player,pose,t*1000);
    }
    remote.update(1/fps,t*1000);
    for(const bone of Object.values(remote.character.bones)){
      assert(bone.quaternion.toArray().every(Number.isFinite));
      assert(Math.abs(bone.quaternion.length()-1)<1e-4);
    }
  }
  finalPositions.push(remote.mesh.position.z);
  assert(['walk','jog','regularRun'].includes(remote.character.activeAction.getClip().name));
  const anchor={x:0,y:40,z:10};
  remote.receive({...player,y:12},{state:'SWINGING',velocity:{x:0,y:-3,z:10},anchor,
    webs:[{hand:'left',anchor}]},2100);
  for(let i=0;i<10;i++)remote.update(1/fps,2100+i*1000/fps);
  assert.equal(remote.character.activeAction.getClip().name,'swing');
  assert(remote.character.webMeshOffhand.visible,'Remote left-hand web was missing');
  remote.receive({...player,y:12},{state:'FALLING',velocity:{x:0,y:-5,z:10},webs:[]},2400);
  remote.update(1/fps,2400);
  assert(!remote.character.webMesh.visible && !remote.character.webMeshOffhand.visible,'Released remote rope remained attached');
  remote.update(.1,4000);
  assert(!remote.character.webMesh.visible && !remote.character.webMeshOffhand.visible,'Stale pose kept a ghost rope');
  remote.dispose();assert.equal(scene.children.length,0,'Remote rig/web leaked after leave');
  assert.equal(sharedDisposed,0,'Leaving disposed the local player model');
  for(const [bone,q] of original)assert(bone.quaternion.equals(q),'Remote animation modified local skeleton');
  console.log(`PASS remote real rig ${fps}fps: strides, independent bones, swing/release, stale pose, leave cleanup`);
}
assert(Math.max(...finalPositions)-Math.min(...finalPositions)<.12,'Network smoothing depends on FPS');
assert.equal(sanitizePose({state:'bogus',velocity:{x:0,y:0,z:0}}),null);
assert.equal(sanitizePose({state:'IDLE',velocity:{x:NaN,y:0,z:0}}),null);
assert.equal(sanitizePose({state:'IDLE',velocity:{x:900,y:0,z:0}}),null);
const sanitized=sanitizePose({state:'IDLE',velocity:{x:0,y:0,z:0},webs:[{anchor:{x:NaN,y:0,z:0}}]});
assert.equal(sanitized.webs.length,0);
assert(capturePose({state:'IDLE',velocity:new THREE.Vector3(),webs:[]},{}));

globalThis.WebSocket={OPEN:1,CLOSED:3};
const transport=Object.create(SupabaseRooms.prototype);
Object.assign(transport,{readyState:1,controlQueue:Promise.resolve()});
const calls=[];
transport.dispatch=async data=>{calls.push(data.type+'-start');await Promise.resolve();calls.push(data.type+'-end');};
transport.fail=e=>{throw e;};
transport.send(JSON.stringify({type:'ready'}));transport.send(JSON.stringify({type:'start'}));
await transport.controlQueue;
assert.deepEqual(calls,['ready-start','ready-end','start-start','start-end'],'Room control requests raced');
const reconnect=Object.create(SupabaseRooms.prototype);
let closes=0,removals=0;
Object.assign(reconnect,{readyState:1,channel:{},client:{removeChannel:async()=>{removals++;},realtime:{disconnect(){}}},onclose(){closes++;}});
reconnect.close();reconnect.close();
assert.equal(closes,1);assert.equal(removals,1);
console.log('PASS transport: ordered ready/start, idempotent connection cleanup, bounded pose payloads');

const stale=Object.create(SupabaseRooms.prototype);let complete,staleEvents=0;
Object.assign(stale,{readyState:1,roomCode:'OLD',rpc:()=>new Promise(r=>{complete=r;}),emit:()=>staleEvents++});
const refresh=stale.refreshState();stale.roomCode=null;complete({type:'room',room:{code:'OLD'}});await refresh;
assert.equal(staleEvents,0,'Late snapshot reopened a left room');
const replacement=Object.create(SupabaseRooms.prototype);
const old={};let oldDetached=false;
Object.assign(replacement,{channel:old,readyState:1,roomCode:'OLD',client:{
  removeChannel:async()=>{oldDetached=replacement.channel===null;},
  channel:()=>{const c={on(){return c;},subscribe(cb){cb('SUBSCRIBED');return c;}};return c;},
}});
await replacement.subscribe('NEW');assert(oldDetached,'Unsubscribe could trigger reconnect during room replacement');

const online=Object.create(Multiplayer.prototype),sent=[];
const camera=new THREE.PerspectiveCamera(65,1,.1,1000);camera.rotation.y=-Math.PI/2;camera.updateMatrixWorld();
Object.assign(online,{id:'police',room:{phase:'playing',mode:'tag'},players:[
  {id:'police',team:'police'}, {id:'runner',team:'runner',seen:true,x:10,y:.1,z:0}],
  spectating:false,lastSend:Infinity,lastHud:Infinity,lastPing:Infinity,avatars:new Map(),send:data=>sent.push(data),
  game:{isPlaying:true,isPaused:false,physics:{position:new THREE.Vector3(0,.1,0),facingAngle:0,webAimNdc:new THREE.Vector2()},
    camera,city:{raycast:()=>null},combat:{action:{id:4,key:'jab',time:0}},character:{}},
});
online.attack('web');assert(Math.abs(sent.pop().facing-Math.PI/2)<1e-6,'Web hit ignored camera aim');
online.game.city.raycast=()=>({distance:4});online.attack('web');assert.equal(sent.length,0,'Web attack passed through wall');
online.game.city.raycast=()=>null;online.players[1].x=0;online.players[1].z=2;
online.attack('punch');assert.equal(sent.length,0,'Punch hit at anticipation');
online.update(.016);assert.equal(sent.length,0);
online.game.combat.action.time=.14;online.update(.016);assert.equal(sent.length,1,'Punch missed authored contact');
online.update(.016);assert.equal(sent.length,1,'Punch repeated the same contact');
online.game.combat.action={id:5,key:'cross',time:0};online.attack('punch');
online.game.combat.action=null;online.update(.016);assert.equal(online.pendingPunch,null,'Cancelled punch remained queued');
online.game.combat.action={id:6,key:'jab',time:0};
online.update(.016);
online.game.combat.action.time=.14;online.update(.016);
assert.equal(sent.length,2,'A queued combo played its animation without sending its contact');
online.update(.016);assert.equal(sent.length,2,'Queued combo sent duplicate contact');
console.log('PASS online regressions: stale room, channel replacement, camera web aim, wall obstruction, timed single punch, cancellation');
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};};
const tabA=storage(),tabB=storage();
const aKey=roomAuthOptions(tabA,()=> 'tab-a').storageKey;
assert.notEqual(aKey,roomAuthOptions(tabB,()=> 'tab-b').storageKey,'Tabs share GoTrue auth broadcasts');
assert.equal(aKey,roomAuthOptions(tabA,()=> 'new-id').storageKey,'Reload lost resumable auth identity');
assert.equal(roomAuthOptions({getItem(){throw Error('Blocked storage');}}).persistSession,false);
console.log('PASS browser auth: isolated tab broadcasts, stable refresh identity, blocked-storage fallback');
