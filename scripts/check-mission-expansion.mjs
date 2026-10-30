import assert from 'node:assert/strict';
import {createMission,advanceMission,missionTarget,missionFraction,completionRecord,validCompletion} from '../src/MissionRules.js';
import {JourneyProgress} from '../src/SoloJourney.js';
import {loadingMessage,startLoadingStatus} from '../src/LoadingStatus.js';
let count=0;
const test=(name,run)=>{run();count++;console.log('PASS '+name);};
const position={x:0,y:20,z:0};
test('Landing progress grows during a safe hold and resets when support is lost',()=>{
 const m=createMission('rooftops','procedural',position,[position,{x:40,y:20,z:0},{x:80,y:20,z:0}]);
 const sample={position,state:'IDLE',safe:true};
 advanceMission(m,sample,.2);advanceMission(m,sample,.1);
 assert(Math.abs(missionFraction(m)-1/6)<1e-8);
 advanceMission(m,{...sample,safe:false},.1);assert.equal(missionFraction(m),0);assert.equal(m.index,0);
 const training=createMission('technique','procedural',position);
 for(let i=0;i<5;i++)advanceMission(training,{position,state:'SWINGING',webs:1},.2);
 assert(Math.abs(missionFraction(training)-1/9)<1e-8);assert.equal(training.index,0);
});
test('Delivery requires ordered supported collection and delivery, regardless of distance',()=>{
 const m=createMission('delivery','procedural',position,[{x:40,y:20,z:0},{x:80,y:20,z:0}]);
 const sample={position:{x:80,y:20,z:0},state:'IDLE',safe:true,distance:600};
 assert.equal(advanceMission(m,sample,.1),false);assert.equal(m.index,0);
 sample.distance=0;sample.position.x=40;sample.state='FALLING';for(let i=0;i<10;i++)advanceMission(m,sample,.1);assert.equal(m.index,0);
 sample.state='IDLE';for(let i=0;i<5;i++)advanceMission(m,sample,.1);
 advanceMission(m,sample,NaN);assert.equal(m.dwell,0);
 for(let i=0;i<6;i++)advanceMission(m,sample,.1);assert.equal(m.index,1);assert.equal(missionTarget(m).x,80);
 sample.position.x=80;for(let i=0;i<5;i++)assert(!advanceMission(m,sample,.1));assert(advanceMission(m,sample,.1));assert.equal(missionTarget(m),undefined);
 assert.equal(completionRecord(m).distance,600);
});
test('Repeated cells, stationary samples and the starting cell cannot finish a survey',()=>{
 const m=createMission('discover','procedural',position);
 const sample={position:{...position},state:'IDLE',distance:1};
 for(const x of [1,1,101,102,101,1]){sample.position.x=x;advanceMission(m,sample,.1);}assert.equal(m.found.size,1);
 sample.distance=0;sample.position.x=201;advanceMission(m,sample,.1);assert.equal(m.found.size,1);
 sample.distance=1;advanceMission(m,sample,.1);sample.position.x=301;assert(advanceMission(m,sample,.1));
});
test('Legacy saves migrate, invalid completion records are discarded, and quota failures are reported',()=>{
 const old=new JourneyProgress({getItem:()=>JSON.stringify({lesson:4,completed:5})});assert.equal(old.data.last,null);assert.equal(old.data.completed,5);
 for(const invalid of [{type:'unknown',distance:1,seconds:2,sectors:0},{type:'travel',distance:-1,seconds:2,sectors:0},{type:'travel',distance:1,seconds:Infinity,sectors:0}])assert.equal(validCompletion(invalid),null);
 const good={type:'travel',distance:500,seconds:25,sectors:0};assert.deepEqual(validCompletion({...good,token:'ignored'}),good);
 const denied=new JourneyProgress({getItem:()=>null,setItem(){throw Error('quota');}});assert(!denied.save());
});
test('Loading feedback distinguishes offline/streamed/local states in both languages',()=>{
 assert.match(loadingMessage(31.7,true,true,'ko'),/31초/);assert.match(loadingMessage(3,false,true,'en'),/local district/);
 assert.match(loadingMessage(3,true,false,'en'),/Offline/);assert.match(loadingMessage(3,true,true,'en'),/terrain/);
});
test('Slow engine import has a working retry before app initialization and releases its listeners',()=>{
 const originals=Object.fromEntries(['document','window','navigator','setInterval','clearInterval'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const events=new Map(),clicks=new Set(),removed=[],output={textContent:''};let tick,reloads=0;
 try{
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});
  globalThis.document={getElementById:id=>id==='loading-wait'?output:id==='btn-retry-load'?{addEventListener:(_,fn)=>clicks.add(fn),removeEventListener:(_,fn)=>clicks.delete(fn)}:{classList:{remove:v=>removed.push(v)}}};
  globalThis.window={addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)};
  globalThis.setInterval=fn=>{tick=fn;return 42;};globalThis.clearInterval=id=>assert.equal(id,42);
  const locationDescriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{configurable:true,value:{reload:()=>reloads++}});
  try{
   const stop=startLoadingStatus(true);assert.match(output.textContent,/인터넷/);assert(removed.includes('hidden'));
   for(const click of clicks)click();assert.equal(reloads,1);assert.equal(events.size,2);tick();stop();assert.equal(events.size,0);assert.equal(clicks.size,0);assert.equal(output.textContent,'');
  }finally{if(locationDescriptor)Object.defineProperty(globalThis,'location',locationDescriptor);else delete globalThis.location;}
 }finally{for(const [k,d]of Object.entries(originals)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
console.log(`Mission expansion: ${count} passed, 0 failed.`);
