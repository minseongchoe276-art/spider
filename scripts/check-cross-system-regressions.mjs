import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GameApp} from '../src/main.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {Multiplayer} from '../src/Multiplayer.js';
import {SupabaseRooms} from '../src/SupabaseRooms.js';
import {CombatSystem} from '../src/Combat.js';
import {GamepadInput} from '../src/GamepadInput.js';
import {cleanSettings,deadzone} from '../src/PlayerSettings.js';
import {TimeTrialSystem} from '../src/TimeTrial.js';
import {Preferences} from '../src/Preferences.js';
import {Progression} from '../src/Progression.js';
import {PlayerExperience} from '../src/PlayerExperience.js';
import {resolveMatchSpawn} from '../src/MatchRules.js';
import {SoundController} from '../src/Audio.js';

const silent=new Proxy({},{get:()=>()=>{}}), camera=new THREE.PerspectiveCamera();
const results=[];
async function check(name,run){try{await run();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.stack});}}
function body(){return new SwingPhysics(new THREE.Scene(),{buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false})},
  {group:new THREE.Group(),update(){},fireWeb(){},cancelAirTrick(){this.isTricking=false;}},silent);}
function withDOM(run){const old={window:globalThis.window,document:globalThis.document};
  globalThis.window=new EventTarget();window.devicePixelRatio=2;
  globalThis.document=new EventTarget();Object.assign(document,{querySelector:()=>null,getElementById:()=>null,body:{classList:{toggle(){}}}});
  try{return run();}finally{Object.assign(globalThis,old);}}

await check('Spawns skip unloaded or malformed fallback roofs',()=>{
  const anchor={x:0,y:20,z:0},roofs=[null,{x:0,y:NaN,z:-28},{x:0,y:20,z:-28},{x:0,y:20,z:-40}];
  const spawn=resolveMatchSpawn(anchor,{x:0,z:-28},p=>p.z===-40?19.9:null,roofs);
  assert.deepEqual(spawn,{x:0,y:20,z:-40});
});
await check('Partial audio initialization closes its context and later sounds remain safe',()=>withDOM(()=>{
  let closed=0;window.AudioContext=class {createGain(){throw new Error('device lost');}close(){closed++;return Promise.resolve();}};
  const audio=new SoundController();audio.ensureContext();assert.equal(closed,1);assert.equal(audio.ctx,null);
  assert.doesNotThrow(()=>audio.playWebShoot());assert.doesNotThrow(()=>audio.playJump());assert.doesNotThrow(()=>audio.setWindSpeed(100));
}));

await check('Keyboard and gamepad releases do not cancel each other',()=>withDOM(()=>{
  const app=Object.create(GameApp.prototype);Object.assign(app,{canvas:new EventTarget(),physics:body(),camera,
    isPlaying:true,isPaused:false,input:{},heldKeys:new Set(),audio:silent,combat:{mode:'web',guard(){},clearHeld(){}}});
  app.physics.performAirJump=()=>false;app.initInputListeners();
  const key=(down,pad)=>{const event=new Event(down?'keydown':'keyup',{cancelable:true});
    Object.defineProperties(event,{code:{value:'KeyE'},gamepadInput:{value:pad}});window.dispatchEvent(event);};
  key(true,false);key(true,true);key(false,true);assert(app.input.webZipHeld);
  key(true,true);key(false,false);assert(app.input.webZipHeld);
  key(false,true);assert(!app.input.webZipHeld);
  key(true,true);app.clearInput();assert.equal(app.gamepadHeldKeys.size,0);
}));
await check('Switching pads releases old buttons before pressing the new pad',()=>withDOM(()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  let connected={index:0,mapping:'standard',axes:[0,0,0,0],buttons:[{pressed:true}]};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[connected]}});
  try{
    const game={isPlaying:true,isPaused:false,preferences:{values:{settings:cleanSettings()}},syncHeldInput(){},showNotice(){}};
    const pad=new GamepadInput(game),actions=[];pad.action=(button,down)=>actions.push([button,down]);
    pad.update(.016);connected={...connected,index:1};pad.update(.016);
    assert.deepEqual(actions,[[0,true],[0,false],[0,true]]);
  }finally{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;}
}));
await check('Invalid or out-of-range stick samples cannot poison movement',()=>{
  for(const value of [NaN,Infinity,-Infinity])assert.equal(deadzone(value),0);
  assert.equal(deadzone(2),1);assert.equal(deadzone(-2),-1);assert(Number.isFinite(deadzone(.5,1)));
});
await check('Combat toggle clears held zip without inventing a new air action',()=>{
  const p=body(),combat=new CombatSystem(new THREE.Scene(),p,p.character),input={webZipHeld:true};
  combat.mode='web';assert.equal(combat.toggle(input),'combat');assert(!input.webZipHeld);
});

await check('Room snapshots enter spectator mode and rescue clears old traversal',()=>withDOM(()=>{
  const p=body();p.position.set(0,.1,0);p.state='MANTLING';p.mantle={elapsed:.3};p.recoveryTime=4;p.character.isTricking=true;
  const mp=Object.create(Multiplayer.prototype);Object.assign(mp,{id:'me',room:{phase:'playing'},lastPhase:'playing',
    spectating:false,game:{physics:p,character:p.character,clearInput(){},resetCamera(){},showNotice(){},combat:{cancel(){}}},
    render(){},syncAvatars(){}});
  const snapshot=eliminated=>({type:'room',room:{phase:'playing',mode:'tag'},players:[{id:'me',eliminated,x:12,y:5,z:8,facing:1}]});
  mp.message(snapshot(true));assert(mp.spectating);assert(!p.character.group.visible);
  mp.message(snapshot(false));assert(!mp.spectating);assert(p.character.group.visible);
  assert.equal(p.state,'FALLING');assert.equal(p.mantle,null);assert.equal(p.recoveryTime,0);assert(!p.character.isTricking);
  assert.deepEqual(p.position.toArray(),[12,5,8]);assert(p.renderPosition.equals(p.position));
}));
await check('Late server corrections cannot move a solo player',()=>{
  const p=body(),mp=Object.create(Multiplayer.prototype);mp.game={physics:p};mp.solo=true;mp.room=null;
  const before=p.position.clone();mp.message({type:'correction',x:100,y:100,z:100});assert(p.position.equals(before));
});
await check('Old Supabase broadcasts cannot restore a departed or replaced room',async()=>{
  const channels=[],events=[],client={removeChannel:async()=>{},channel(){
    const channel={handlers:{},on(_type,{event},handler){this.handlers[event]=handler;return this;},
      subscribe(callback){queueMicrotask(()=>callback('SUBSCRIBED'));}};channels.push(channel);return channel;}};
  const rooms=Object.create(SupabaseRooms.prototype);Object.assign(rooms,{client,readyState:1,emit:data=>events.push(data)});
  await rooms.subscribe('OLD');channels[0].handlers.state({payload:{type:'room',marker:'current'}});assert.equal(events.length,1);
  await rooms.subscribe('NEW');channels[0].handlers.state({payload:{type:'room',marker:'stale'}});
  channels[0].handlers.hit({payload:{type:'hit'}});assert.equal(events.length,1);
  channels[1].handlers.move({payload:{type:'move'}});assert.equal(events.length,2);
  rooms.roomCode=null;channels[1].handlers.state({payload:{type:'room'}});assert.equal(events.length,2);
});

await check('Finish timing and final ghost position use the actual gate crossing at every FPS',()=>{
  for(const fps of [30,60,144]){
    const trial=new TimeTrialSystem(new THREE.Scene(),{},silent);trial.isActive=true;trial.previousPosition=new THREE.Vector3();
    trial.checkpoints=[{position:new THREE.Vector3(0,0,10),normal:new THREE.Vector3(0,0,1),radius:3,mesh:new THREE.Mesh()}];
    let result;for(let n=1;n<=fps && !result?.completed;n++)result=trial.update(new THREE.Vector3(0,0,20*n/fps),1/fps);
    assert(Math.abs(result.totalTime-.5)<1e-8);assert.equal(result.finishPosition.z,10);
    assert.equal(trial.splitTimes.at(-1),result.totalTime);trial.dispose();
  }
});
await check('Malformed frame duration never corrupts checkpoint times',()=>{
  for(const dt of [NaN,Infinity,-1]){
    const trial=new TimeTrialSystem(new THREE.Scene(),{},silent);trial.isActive=true;trial.previousPosition=new THREE.Vector3();
    trial.checkpoints=[{position:new THREE.Vector3(0,0,10),normal:new THREE.Vector3(0,0,1),radius:3,mesh:new THREE.Mesh()}];
    assert.equal(trial.update(new THREE.Vector3(0,0,20),dt).totalTime,0);assert.equal(trial.splitTimes[0],0);trial.dispose();
  }
});
await check('New timing records persist without comparing against older timing rules',()=>{
  let saved;const storage={getItem:()=>saved,setItem:(_key,value)=>{saved=value;}};
  const prefs=new Preferences(storage);prefs.recordTime('procedural-v4-12345678',1);prefs.recordTime('procedural-v5-12345678',2);
  assert.equal(new Preferences(storage).values.bestTimes['procedural-v5-12345678'],2);
  const progress=new Progression(storage);progress.recordGhost('procedural-v5-12345678',1,[[0,0,0,0,0],[1,1,0,0,0]],[1],'gold');
  assert(new Progression(storage).data.ghosts['procedural-v5-12345678']);
  progress.bank(NaN);assert(Number.isFinite(progress.data.score));
});
await check('Audio changes preserve first-person zoom and adaptive resolution; FOV stays bounded',()=>withDOM(()=>{
  document.getElementById=id=>id==='graphics-quality'?{}:null;
  const app=Object.create(GameApp.prototype),settings=cleanSettings();let ratio=0;
  Object.assign(app,{preferences:{values:{muted:false,reducedMotion:false,quality:'balanced',settings}},tpsCamera:{},
    physics:{},audio:{isMuted:false,configure(){}},city:{},timeTrial:{},renderer:{setPixelRatio:value=>{ratio=value;},shadowMap:{}},applyWebTheme(){}});
  app.applyPreferences();app.tpsCamera.firstPersonFov=55;ratio=.7;settings.effectsVolume=.1;app.applyPreferences();
  assert.equal(app.tpsCamera.firstPersonFov,55);assert.equal(ratio,.7);
  settings.fov=95;app.applyPreferences();assert.equal(app.tpsCamera.maxFov,95);assert.equal(app.tpsCamera.firstPersonFov,95);
  app.preferences.values.quality='low';app.applyPreferences();assert.equal(ratio,1);
}));
await check('Zip HUD reports movement and cooldown rather than false readiness',()=>withDOM(()=>{
  const hands={textContent:''};document.getElementById=id=>id==='hand-status'?hands:null;
  const experience=Object.create(PlayerExperience.prototype);experience.game={physics:{state:'WEB_ZIP',webs:[],zipCooldown:.2},
    combat:{mode:'web'},preferences:{values:{settings:cleanSettings()}}};
  experience.previewAnchor();assert(hands.textContent.includes('집 이동 중'));
  experience.game.physics.state='FALLING';experience.previewAnchor();assert(hands.textContent.includes('집 대기'));
}));
console.log(JSON.stringify({results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
