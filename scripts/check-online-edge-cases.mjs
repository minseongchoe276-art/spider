import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Multiplayer} from '../src/Multiplayer.js';
import {RemoteMotion,sanitizePose} from '../src/RemoteMotion.js';
import {GameApp} from '../src/main.js';
import {RaceGhost} from '../src/RaceGhost.js';
import {PlayerExperience} from '../src/PlayerExperience.js';
const results=[];
function check(name,run){try{run();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
check('Null web elements cannot interrupt pose handling',()=>{
 const pose=sanitizePose({state:'SWINGING',velocity:{x:0,y:0,z:5},webs:[null,{hand:'left',anchor:{x:1,y:20,z:3}}]});
 assert.equal(pose.webs.length,1);
});
check('Fresh stationary swing poses retain their velocity',()=>{
 const model=new THREE.Group(),source={model,mixer:new THREE.AnimationMixer(model),actions:{},isLoaded:true};
 const scene=new THREE.Scene(),player={id:'friend',x:0,y:10,z:0,facing:0};
 const remote=new RemoteMotion(scene,source,player,{colliders:[]});let observed;
 remote.receivedAt=0;remote.character.update=(_dt,_state,v)=>{observed=v.clone();};
 remote.receive(player,{state:'SWINGING',velocity:{x:0,y:-3,z:10},webs:[]},1000);
 remote.update(.016,1016);assert.equal(observed.z,10);remote.dispose();
});
function match(me){
 const mp=Object.create(Multiplayer.prototype),position=new THREE.Vector3();
 const group=new THREE.Group();let spawnCalls=0;
 Object.assign(mp,{id:me.id,room:{phase:'playing',mode:'tag'},players:[me],arena:null,
  placeMatchSpawn(){spawnCalls++;position.set(100,100,100);},send(){},
  game:{assetsReady:true,character:{group},isPlaying:false,isPaused:true,input:{},clearInput(){},
   audio:{ensureContext(){}},physics:{position,previousFixedPosition:new THREE.Vector3(),renderPosition:new THREE.Vector3(),velocity:new THREE.Vector3(),resetPosition(){position.set(0,0,0);}},
   resetCamera(){},timeTrial:{stop(){}},combat:{mode:'web',cancel(){},clearEnemies(){},toggle(){}},applyPreferences(){},showNotice(){}}});
 return {mp,group,position,spawns:()=>spawnCalls};
}
check('Eliminated reconnects restore spectator mode',()=>{
 const state=match({id:'me',team:'runner',seen:true,eliminated:true,x:17,y:25,z:30,facing:1});
 state.mp.begin();assert.equal(state.mp.spectating,true);assert.equal(state.group.visible,false);
});
check('Living reconnects preserve server position in ordinary rooms',()=>{
 const state=match({id:'me',team:'police',seen:true,eliminated:false,x:17,y:25,z:30,facing:1});
 state.mp.begin();assert.deepEqual(state.position.toArray(),[17,25,30]);assert.equal(state.spawns(),0);
});
check('A new match exits solo presentation state',()=>{
 const state=match({id:'me',team:'runner',seen:false,eliminated:false});state.mp.solo=true;
 state.mp.begin();assert.equal(state.mp.solo,false);
});
// A paused strike must not land later after its contact frame has passed.
check('Pause cancels queued online punch contact',()=>{
 const app=Object.create(GameApp.prototype);Object.assign(app,{multiplayer:{pendingPunch:4,room:{phase:'playing'}},isPlaying:true,
  canvas:{},clearInput(){},audio:{setWindSpeed(){}},preferences:{},speedLines:null});
 const old=globalThis.document,oldTimeout=globalThis.setTimeout;globalThis.setTimeout=()=>0;globalThis.document={querySelector:()=>null,getElementById:()=>null,pointerLockElement:null};
 try{app.setPaused(true);assert.equal(app.multiplayer.pendingPunch,null);}finally{globalThis.document=old;globalThis.setTimeout=oldTimeout;}
});
check('Solo play restores a previously hidden spectator character',()=>{
 const state=match({id:'me'});state.mp.solo=true;state.group.visible=false;state.mp.render=()=>{};
 state.mp.beginSoloReady();assert.equal(state.group.visible,true);
});
check('Race completion records the finish sample and final split',()=>{
 const scene=new THREE.Scene(),ghost=new RaceGhost(scene),position=new THREE.Vector3();
 let saved;const progression={data:{ghosts:{}},recordGhost(_id,time,samples,splits){saved={time,samples,splits};}};
 ghost.start('course',progression,position,0);
 const trial={courseId:'course',isActive:true,elapsedTime:.5,currentIndex:1,splitTimes:[.5],checkpoints:[{position:new THREE.Vector3(1,0,0)},{position:new THREE.Vector3(2,0,0)}]};
 ghost.update(trial,position,0,false);
 Object.assign(trial,{isActive:false,elapsedTime:1,currentIndex:2,splitTimes:[.5,1]});
 const experience=Object.create(PlayerExperience.prototype);
 Object.assign(experience,{ghost,refreshProgress(){},game:{physics:{position,facingAngle:0},progression,timeTrial:trial,city:{getRooftopSpawn:()=>new THREE.Vector3()}}});
 experience.raceFinished({totalTime:1});
 assert.equal(saved.samples.at(-1)[0],1);assert.deepEqual(saved.splits,[.5,1]);
});
console.log(JSON.stringify({results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
