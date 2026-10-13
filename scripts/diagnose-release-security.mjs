// A deliberate diagnostic of the Hong Kong defender trust boundary.
// Only a fresh, ephemeral local server is touched; no Supabase writes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from './rooms.mjs';
import {MATCH} from '../src/MatchRules.js';
const server=createServer(),api=attachRooms(server),sockets=[];
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),send=(ws,data)=>ws.send(JSON.stringify(data));
async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);ws.events=[];sockets.push(ws);ws.on('message',raw=>ws.events.push(JSON.parse(raw)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return ws;}
async function wait(ws,predicate){const end=Date.now()+2500;while(Date.now()<end){const i=ws.events.findIndex(predicate);if(i>=0)return ws.events.splice(i,1)[0];await sleep(10);}throw new Error('Diagnostic event timeout');}
try{
  MATCH.graceMs=0;const a=await connect(),b=await connect();
  send(a,{type:'create',mode:'tag',city:'hong-kong',capacity:2,enhanced:true});const ja=await wait(a,e=>e.type==='joined');
  send(b,{type:'join',code:ja.code,city:'hong-kong'});const jb=await wait(b,e=>e.type==='joined');
  await wait(a,e=>e.type==='room'&&e.room.count===2);
  send(a,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:50,z:0},roofs:[{x:70,y:50,z:0},{x:-70,y:50,z:0}]});
  send(b,{type:'ready',ready:true,terrainReady:true});await wait(a,e=>e.type==='room'&&e.players.every(p=>p.ready));send(a,{type:'start'});
  const started=await wait(a,e=>e.type==='room'&&e.room.phase==='playing'),byId=new Map([[ja.id,a],[jb.id,b]]);
  const copId=started.players.find(p=>p.team==='police').id,runnerId=started.players.find(p=>p.team==='runner').id;
  const cop=byId.get(copId),runner=byId.get(runnerId),room=api.rooms.get(ja.code);
  async function attack(){send(cop,{type:'move',x:0,y:50,z:0,facing:0});send(runner,{type:'move',x:0,y:50,z:2,facing:0});await sleep(60);send(cop,{type:'attack',kind:'punch',facing:0});return wait(runner,e=>e.type==='hit-check');}
  const ignored=await attack();await sleep(750);assert.equal(room.players.get(runnerId).health,100);
  const refused=await attack();send(runner,{type:'hit-confirm',hitId:refused.hitId,clear:false});await sleep(80);assert.equal(room.players.get(runnerId).health,100);
  await sleep(600);const accepted=await attack();send(runner,{type:'hit-confirm',hitId:accepted.hitId,clear:true});const hit=await wait(runner,e=>e.type==='hit');assert.equal(hit.health,75);
  console.log(JSON.stringify({status:'FAIL',severity:'P1',id:'SEC-01',finding:'Hong Kong competitive damage is controlled by the defender client',
    evidence:{ignoredHitHealth:100,refusedHitHealth:100,acceptedHitHealth:hit.health,transport:'local WebSocket',mode:'enhanced tag',graceMs:MATCH.graceMs},
    impact:'A modified defender can ignore or reject every hit-check and avoid damage. The server does not independently verify Hong Kong visibility.',
    remediation:'Use authoritative server-side Hong Kong collision/visibility and authenticated damage resolution; a timeout default alone would create through-wall hits.',
    scope:'Local reproduction only. Supabase branch reviewed separately; no production attack or mutation performed.'},null,2));
  process.exitCode=1;
}finally{for(const ws of sockets)ws.terminate();await new Promise(r=>server.close(r));}
