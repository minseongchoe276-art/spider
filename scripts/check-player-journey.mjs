import assert from 'node:assert/strict';
import * as T from 'three';
import {JourneyProgress,SoloJourney,LESSONS} from '../src/SoloJourney.js';
import {PlayDiagnostics} from '../src/PlayDiagnostics.js';
import {NetworkHealth} from '../src/NetworkHealth.js';
import {createTrainingOpponent,poseTrainingOpponent} from '../src/TrainingOpponent.js';
import {BINDINGS} from '../src/PlayerSettings.js';
import {City} from '../src/City.js';
import {LOCAL_MAPS} from '../src/MapCatalog.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {PlayerExperience} from '../src/PlayerExperience.js';
import {Multiplayer} from '../src/Multiplayer.js';
let cases=0;
const test=(name,run)=>{run();cases++;console.log('PASS '+name);};
const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
const progress=new JourneyProgress(storage),point=new T.Vector3();
const observe=(state='IDLE',dt=.1,hits=0,webs=0)=>progress.observe({position:point,state,hits,webs},dt);
test('Lessons require real movement, sustained support and a new hit',()=>{
 observe();for(let i=0;i<40;i++){point.x+=.6;observe();}assert.equal(progress.data.lesson,1);
 observe('JUMPING');assert.equal(progress.data.lesson,2);
 for(let i=0;i<30;i++)observe('SWINGING',.1,0,0);assert.equal(progress.data.lesson,2);
 for(let i=0;i<21;i++)observe('SWINGING',.1,0,1);assert.equal(progress.data.lesson,3);
 observe('FALLING');observe('LANDING');assert.equal(progress.data.lesson,4);
 for(let i=0;i<7;i++)observe('WALL_RUNNING');assert.equal(progress.data.lesson,5);
 progress.resetSample();observe('IDLE',.1,20);assert.equal(progress.data.lesson,5);
 observe('IDLE',.1,21);assert.equal(progress.data.lesson,LESSONS.length);
 assert.equal(new JourneyProgress(storage).data.lesson,LESSONS.length);
});
test('Corrupt/denied saves, restarts, inactive timing and teleport baselines',()=>{
 assert.doesNotThrow(()=>new JourneyProgress({getItem(){throw Error('denied');}}));
 assert.equal(new JourneyProgress({getItem:()=>'{'}).data.lesson,0);
 const bad=new JourneyProgress({getItem:()=>JSON.stringify({lesson:99,completed:-1}),setItem(){throw Error('quota');}});
 assert.equal(bad.data.lesson,6);assert.equal(bad.data.completed,0);assert.equal(bad.restart(),false);
 progress.restart();observe();point.x+=1000;assert.equal(observe().distance,0);assert.equal(progress.walk,0);
 progress.resetSample();point.x+=10;assert.equal(observe().distance,0);
 point.x+=1;assert.equal(observe('IDLE',5).distance,0);assert.equal(progress.walk,0);
 progress.dismiss();for(let i=0;i<50;i++){point.x+=1;observe();}assert.equal(progress.data.lesson,0);
});
// Real controller integration with a small DOM surface; physics/coordinates are
// actual Three vectors, and mission arrival reuses the game's safe-surface gate.
class Element{constructor(){this.hidden=false;this.children=[];this.textContent='';}append(...c){this.children.push(...c);}setAttribute(){}addEventListener(){}}
const elements=new Map(),prior=globalThis.document;
globalThis.document={hidden:false,createElement:()=>new Element(),getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}};
try{
 const game={scene:new T.Scene(),assetsReady:true,isPlaying:true,isPaused:false,multiplayer:{solo:true,room:null,pursuitPoints:()=>[{x:40,y:20.1,z:0},{x:80,y:20.1,z:0},{x:120,y:20.1,z:0}]},
  physics:{position:new T.Vector3(0,20.1,0),state:'IDLE',webs:[]},combat:{hits:0},progression:{data:{discoveries:[]}},
  experience:{city:'procedural',safe:()=>true},preferences:{values:{settings:{bindings:BINDINGS}}},practice:{active:false,stop(){}},clearInput(){},setPaused(v){this.isPaused=v;},showNotice(){},canvas:{focus(){}}};
 const journey=new SoloJourney(game,storage);
 test('Roof objectives require a safe landing, dwell, and distinct destinations',()=>{
  journey.start('rooftops');assert.equal(journey.mission.points.length,3);
  game.physics.position.set(40,20.1,0);game.physics.state='FALLING';for(let i=0;i<10;i++)journey.update(.1);assert.equal(journey.mission.index,0);
  game.physics.state='IDLE';game.experience.safe=()=>false;for(let i=0;i<10;i++)journey.update(.1);assert.equal(journey.mission.index,0);
  game.experience.safe=()=>true;
  for(const x of [40,80,120]){game.physics.position.x=x;for(let i=0;i<7;i++)journey.update(.1);}
  assert.equal(journey.mission,null);assert.equal(journey.progress.data.completed,1);assert.equal(journey.marker.visible,false);
 });
 test('Pause, hidden page, recovery, city change and online cannot accrue solo distance',()=>{
  journey.start('travel');journey.update(.1);game.physics.position.x+=1;journey.update(.1);assert(journey.mission.distance>0);
  const before=journey.mission.distance;game.isPaused=true;game.physics.position.x+=50;journey.update(.1);game.isPaused=false;journey.update(.1);assert.equal(journey.mission.distance,before);
  globalThis.document.hidden=true;game.physics.position.x+=50;journey.update(.1);globalThis.document.hidden=false;journey.update(.1);assert.equal(journey.mission.distance,before);
  journey.resetSample();game.physics.position.x+=100;journey.update(.1);assert.equal(journey.mission.distance,before);
  game.experience.city='harbor';journey.update(.1);assert.equal(journey.mission,null);game.experience.city='procedural';
  journey.start('travel');game.multiplayer.room={};journey.update(.1);assert.equal(journey.mission,null);assert(journey.panel.hidden);game.multiplayer.room=null;
 });
 test('Discovery uses new distinct cells and stops cleanly; unavailable roofs preserve play',()=>{
  game.physics.position.set(0,20.1,0);journey.start('discover');journey.update(.1);
  for(let i=0;i<305;i++){game.physics.position.x+=1;journey.update(.1);}
  assert.equal(journey.mission,null);assert.equal(journey.progress.data.completed,2);
  game.multiplayer.pursuitPoints=()=>[];journey.start('rooftops');assert.equal(journey.mission,null);assert(elements.get('journey-feedback').textContent.length>0,'An unavailable roof must explain the failure inside the open menu');
  journey.start('travel');journey.update(.1);for(let i=0;i<501;i++){game.physics.position.x+=1;journey.update(.1);}
  assert.equal(journey.mission,null);assert.equal(journey.progress.data.completed,3);
 });
 test('An entirely explored district can be surveyed repeatedly without counting the starting cell',()=>{
  game.physics.position.set(0,20.1,0);game.progression.data.discoveries=['procedural:0:0','procedural:1:0','procedural:1:1','procedural:0:1'];
  for(let repeat=0;repeat<2;repeat++){
   game.physics.position.set(0,20.1,0);journey.start('discover');journey.update(.1);
   for(const [axis,step]of [['x',1],['z',1],['x',-1]])for(let i=0;i<101;i++){game.physics.position[axis]+=step;journey.update(.1);}
   assert.equal(journey.mission,null);assert.equal(journey.progress.data.last.type,'discover');assert.equal(journey.progress.data.last.sectors,3);
  }
  assert.equal(game.progression.data.discoveries.length,4);
 });
 test('Delivery keeps its current mission if target preparation fails and updates the shared map target',()=>{
  game.physics.position.set(0,20.1,0);game.multiplayer.pursuitPoints=()=>[{x:40,y:20.1,z:0},{x:80,y:20.1,z:0}];
  journey.start('delivery');assert.equal(journey.target.x,40);const current=journey.mission;
  game.multiplayer.pursuitPoints=()=>[];journey.start('rooftops');assert.equal(journey.mission,current);assert.equal(journey.pendingType,'rooftops');
  assert.equal(elements.get('btn-mission-retry').hidden,false);
  game.physics.position.set(40,20.1,0);for(let i=0;i<7;i++)journey.update(.1);assert.equal(journey.target.x,80);
  game.physics.position.set(80,20.1,0);for(let i=0;i<7;i++)journey.update(.1);
  assert.equal(journey.target,null);assert.equal(journey.progress.data.last.type,'delivery');assert(!journey.panel.hidden);
  const restored=new JourneyProgress(storage);assert.equal(restored.data.last.type,'delivery');
  for(let i=0;i<110;i++)journey.update(.1);assert(journey.panel.hidden);
 });
 test('Traversal stages cannot accrue through menus, training, invalid time or unsafe landing',()=>{
  journey.start('technique');game.physics.state='SWINGING';game.physics.webs=[{}];
  for(let i=0;i<20;i++)journey.update(.1);assert.equal(journey.mission.index,0);
  game.isPaused=true;journey.update(.1);game.isPaused=false;
  for(let i=0;i<20;i++)journey.update(.1);assert.equal(journey.mission.index,0);
  journey.update(NaN);assert.equal(journey.mission.skillTime,0);
  game.practice.active=true;for(let i=0;i<35;i++)journey.update(.1);assert.equal(journey.mission.index,0);game.practice.active=false;
  for(let i=0;i<31;i++)journey.update(.1);assert.equal(journey.mission.index,1);
  game.physics.state='WALL_RUNNING';for(let i=0;i<11;i++)journey.update(.1);assert.equal(journey.mission.index,2);
  game.physics.state='IDLE';game.experience.safe=()=>false;for(let i=0;i<10;i++)journey.update(.1);assert.equal(journey.mission.index,2);
  game.experience.safe=()=>true;for(let i=0;i<7;i++)journey.update(.1);assert.equal(journey.mission,null);assert.equal(journey.progress.data.last.type,'technique');game.physics.webs=[];
 });
 test('Repeated HUD refreshes do not repeat a live-region announcement',()=>{
  const controller=new SoloJourney(game,null);let writes=0,value='';Object.defineProperty(controller.title,'textContent',{get:()=>value,set:v=>{value=v;writes++;}});
  for(let i=0;i<30;i++)controller.render();assert.equal(writes,1);
 });
 test('The real multiplayer update reconnects silent sockets and preserves hidden-tab grace',()=>{
  const previousSocket=globalThis.WebSocket;globalThis.WebSocket={OPEN:1};
  try{
   const now=performance.now(),mp=Object.create(Multiplayer.prototype),sent=[],closed=[];
   Object.assign(mp,{game:{combat:{},physics:{position:new T.Vector3()}},players:[],room:null,networkHealth:new NetworkHealth(),lastNetworkTick:now,lastPing:now-6000,
    ws:{readyState:1,close:(...args)=>closed.push(args)},send:data=>sent.push(data)});
   mp.networkHealth.received(now);mp.update(.016);assert.equal(sent[0].type,'ping');assert.equal(closed.length,0);
   mp.networkHealth.lastReceived=now-30000;mp.networkHealth.lastPing=now-20000;globalThis.document.hidden=true;mp.update(.016);assert.equal(closed.length,0);
   globalThis.document.hidden=false;mp.update(.016);assert.equal(closed.length,1);assert.equal(closed[0][0],4000);
  }finally{globalThis.WebSocket=previousSocket;globalThis.document.hidden=false;}
 });
 test('All five real local districts provide three supported, distinct roof destinations and accept grounded arrival',()=>{
  class HeadlessCity extends City{initTextures(){for(const key of ['windowGlassTex','windowBrickTex','windowDarkTex','roadTex'])this[key]=new T.Texture();}createHelipad(){}}
  for(const map of LOCAL_MAPS){
   const scene=new T.Scene(),city=new HeadlessCity(scene,map.id),character={group:new T.Group(),update(){},requestTurn(){},stopAnimation(){},toggleHand(){},fireWeb(){}};
   const physics=new SwingPhysics(scene,city,character,new Proxy({},{get:()=>()=>{}}));physics.position.copy(city.getRooftopSpawn(95));physics.state='IDLE';
   const real={...game,scene,city,physics,experience:{city:map.id},multiplayer:{solo:true,room:null}};
   real.experience.safe=p=>PlayerExperience.prototype.safe.call({game:real},p);
   const survey=new SoloJourney(real,storage);survey.start('rooftops');assert(survey.mission,`${map.id} has no viable survey`);
   assert.equal(survey.mission.points.length,3);assert(survey.mission.points.every(p=>real.experience.safe(new T.Vector3(p.x,p.y,p.z))));
   for(const target of survey.mission.points){physics.position.copy(target);for(let i=0;i<7;i++)survey.update(.1);}
   assert.equal(survey.mission,null,`${map.id} cannot complete its generated survey`);
   scene.traverse(o=>{o.geometry?.dispose();if(o.material?.dispose)o.material.dispose();});
  }
 });
}finally{globalThis.document=prior;}
test('Connection probes reject forged stamps and detect silence without false reconnects on chatty links',()=>{
 const n=new NetworkHealth();n.received(0);n.ping(100);assert(!n.pong(50,150));assert(n.pong(100,180));
 assert.equal(n.snapshot(180).p95Ms,80);assert(!n.snapshot(180).degraded);
 n.ping(5000);assert(n.snapshot(22000).reconnect);n.received(22001);assert(!n.snapshot(22002).reconnect);
 for(let i=0;i<40;i++){n.ping(i*1000);n.pong(i*1000,i*1000+500);}assert.equal(n.samples.length,24);assert(n.snapshot(40000).degraded);
});
test('Thirty minutes of local diagnostics stay bounded; bad times are rejected',()=>{
 const d=new PlayDiagnostics();for(let i=0;i<60*60*31;i++)d.sample(1/60);assert(d.buckets.length<=360);assert(d.seconds>1800);
 const before=d.seconds;d.sample(NaN);d.sample(-1);assert.equal(d.seconds,before);
 const stalled=new PlayDiagnostics();stalled.sample(2);assert.equal(stalled.seconds,2);assert.equal(stalled.slowFrames,1);assert.equal(stalled.worst,2000);
});
test('Every training type articulates without moving collision roots or invalid joints at multiple frame rates',()=>{
 for(const type of ['dummy','melee','ranged','shield'])for(const fps of [24,30,60,144]){
  const rig=createTrainingOpponent(type),e={...rig,pose:rig.pose,body:rig.body,position:new T.Vector3(),windup:.7,stagger:0,strike:0,type};
  for(let i=0;i<fps;i++){e.windup=Math.max(0,e.windup-1/fps);if(i===Math.floor(fps*.7))e.strike=.3;poseTrainingOpponent(e,1/fps);rig.group.updateMatrixWorld(true);rig.group.traverse(n=>assert([...n.position,...n.quaternion,...n.scale].every(Number.isFinite)));}
  assert.deepEqual(rig.group.position.toArray(),[0,0,0]);assert.equal(!!rig.shield,type==='shield');
  e.stagger=.4;poseTrainingOpponent(e,1/fps,true);assert.equal(e.pose.rig.rotation.z,0);
  rig.group.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});
 }
});
console.log(`Player journey review: ${cases} passed, 0 failed.`);
