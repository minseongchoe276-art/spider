import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {WorldMap} from '../src/WorldMap.js';
import {PlayDiagnostics} from '../src/PlayDiagnostics.js';
import {PlayStudy} from '../src/PlayStudy.js';
import {releaseIdentity} from './lib/release-identity.mjs';
import {buildReleaseManifest} from './build-release-manifest.mjs';
import {verifyRelease} from './verify-release.mjs';
import {analyzePlaytests} from './analyze-playtests.mjs';
import {assessDeviceReport} from './assess-device-report.mjs';

// Exercise actual map drawing with a recording canvas at multiple resolutions.
const priorWidth=globalThis.innerWidth,priorHeight=globalThis.innerHeight;
for(const [width,height]of [[1280,720],[390,844],[844,390]])for(const mapId of ['procedural','harbor','gardens','old-town','skyline']){
 globalThis.innerWidth=width;globalThis.innerHeight=height;const strokes=[];
 const ctx=new Proxy({lineWidth:1,strokeRect(...rect){strokes.push({width:this.lineWidth,rect});}}, {get:(o,k)=>k in o?o[k]:(()=>{})});
 const map={isOpen:true,zoom:1,lastDraw:-1000,canvas:{width:0,height:0},ctx,root:{querySelector:()=>({})},game:{
  city:{mapId,playableHalfExtent:160,profile:{accent:'#abc'},district:{zones:[],roads:[]}},
  minimap:{range:180,collectFootprints:()=>[{minX:-16,maxX:16,minZ:-16,maxZ:16}]},physics:{position:{x:0,z:0}},multiplayer:{minimapPlayers:()=>[]},combat:{enemies:[]}}};
 for(let draw=0;draw<2;draw++){map.lastDraw=-1000;WorldMap.prototype.update.call(map);}
 assert.equal(strokes.length,4);assert.deepEqual(strokes.map(s=>s.width),[1,1.5,1,1.5]);assert(strokes[0].rect[2]>1);
}
globalThis.innerWidth=priorWidth;globalThis.innerHeight=priorHeight;
console.log('PASS actual map drawing: five maps, three viewports and repeated draw keep pixel-sized outlines');

const d=new PlayDiagnostics();for(let i=0;i<3600*60;i++)d.sample(i%100===0?.05:1/60);
assert(d.buckets.length<=360);assert(d.totalFrames===216000);assert(d.totalSlow===2160);
const snapshot=d.seconds;d.sample(NaN);d.sample(-1);assert.equal(d.seconds,snapshot);
for(let i=0;i<300;i++)d.record('resize');assert.equal(d.events.length,256);d.record('token-secret');assert.equal(d.events.length,256);
const game={city:{mapId:'procedural'},preferences:{values:{quality:'balanced'}},renderer:{getPixelRatio:()=>1,info:{render:{},memory:{}}},multiplayer:{},experience:{}};
const report=d.report(game);assert.equal(report.summary.p95Ms,17);assert.equal(report.capabilities.thermal,false);assert.equal(report.capabilities.battery,false);
const stall=new PlayDiagnostics();stall.sample(2);assert.equal(stall.report(game).summary.p95Ms,2000);
console.log('PASS bounded hour-long diagnostics, full-session P95, stalls, interruptions and unsupported sensors');

const study=new PlayStudy();study.lesson('walk');study.tick(12);study.lesson('jump');study.tick(2);study.endLesson('dismissed');
study.startMission('travel');study.tick(20);study.startMission('delivery');study.tick(5);study.endMission('completed');
study.matchState({phase:'playing',mode:'tag',city:'harbor'},[{id:'private-user',team:'runner'}],'private-user');study.tick(10);
study.matchState({phase:'finished'},[],'private-user','runner');
const proof=study.report();assert.equal(proof.events[0].duration,12);assert.equal(proof.events[2].result,'abandoned');assert.equal(proof.events[3].result,'completed');assert.equal(proof.events[4].result,'won');assert.equal(proof.events[4].role,'runner');
assert(!JSON.stringify(proof).includes('private-user'));const copy=study.report();copy.events[0].name='changed';assert.equal(study.report().events[0].name,'walk');
console.log('PASS lesson/mission completion and abandonment, match outcome and anonymous export');
const exported={...report,sourceId:'build-a',sessionId:'local-test',study:proof};
assert.equal(assessDeviceReport(exported,{sourceId:'build-a'}).status,'PASS');
assert.equal(assessDeviceReport({...exported,measuredActiveSeconds:20},{sourceId:'build-a'}).status,'FAIL');
assert.equal(assessDeviceReport(exported,{sourceId:'build-b'}).status,'FAIL');
const analyzed=analyzePlaytests([{...exported,measuredActiveSeconds:1},exported]);assert.equal(analyzed.sessions,1);assert.equal(analyzed.balance[0].won,1);assert.equal(analyzed.missions.find(m=>m.group[1]==='travel').abandoned,1);
assert(!JSON.stringify(analyzed).includes('local-test'));
console.log('PASS device duration/source gates and deduplicated local playtest analysis');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'shadow-release-'));let server;
try{
 fs.mkdirSync(path.join(folder,'assets'));const source=releaseIdentity().sourceId;
 fs.writeFileSync(path.join(folder,'index.html'),'<script src="/assets/main.js"></script>');fs.writeFileSync(path.join(folder,'assets/main.js'),`console.log('${source}');`);
 const manifest=buildReleaseManifest(folder);assert.equal(manifest.entries.length,2);assert(manifest.entries.every(e=>e.role==='bootstrap'));
 let tamper=false,backendMismatch=false;
 server=createServer((req,res)=>{
  if(req.url==='/healthz'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({status:'ready',backendId:backendMismatch?'old':manifest.backendId,databaseId:manifest.databaseId}));}
  const name=req.url==='/'?'index.html':req.url.slice(1);if(!['release.json','index.html','assets/main.js'].includes(name)){res.writeHead(404);return res.end();}
  res.end(tamper&&name==='assets/main.js'?'tampered':fs.readFileSync(path.join(folder,name)));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const site=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await verifyRelease({site,room:site,manifest,all:true})).status,'PASS');
 tamper=true;assert.equal((await verifyRelease({site,room:site,manifest})).status,'FAIL');
 tamper=false;backendMismatch=true;assert.equal((await verifyRelease({site,room:site,manifest})).status,'FAIL');
 console.log('PASS real HTTP artifact verification: correct build accepted, altered bytes and old authority rejected');
}finally{if(server)await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true});}
