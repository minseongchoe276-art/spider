import assert from 'node:assert/strict';
import fs from 'node:fs';
import WebSocket from 'ws';
import {createRoomServer} from './room-server.mjs';
import {MATCH} from '../src/MatchRules.js';
const service=createRoomServer(),sockets=[],results=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),send=(s,p)=>s.send(JSON.stringify(p));
const grace=MATCH.graceMs;MATCH.graceMs=0;
await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${service.server.address().port}`;
async function connect(){const s=new WebSocket(url.replace('http:','ws:')+'/ws',{origin:'https://minogame.site'});s.events=[];s.on('message',b=>s.events.push(JSON.parse(b)));s.on('error',()=>{});sockets.push(s);await new Promise((r,j)=>{s.once('open',r);s.once('error',j);});return s;}
async function event(s,p){const deadline=Date.now()+4000;while(Date.now()<deadline){const i=s.events.findIndex(p);if(i>=0)return s.events.splice(i,1)[0];await sleep(2);}throw Error('Expected server event absent');}
try{
 await service.warmup;
 const health=await (await fetch(url+'/healthz')).json();assert.equal(health.status,'ready');assert.equal(health.terrainSeedWarm,true);
 assert.equal((await fetch(url+'/healthz',{method:'POST'})).status,405);
 const originCode=await new Promise(resolve=>{const s=new WebSocket(url.replace('http:','ws:')+'/ws',{origin:'https://untrusted.example'});s.on('error',()=>{});s.once('unexpected-response',(_r,res)=>{res.resume();s.terminate();resolve(res.statusCode);});s.once('open',()=>{s.terminate();resolve(101);});});assert.equal(originCode,403);
 results.push({name:'Health, warmup, method restriction and browser origin rejection',status:'PASS'});
 const peers=await Promise.all(Array.from({length:8},connect));
 send(peers[0],{type:'create',name:'dedicated authority acceptance',mode:'tag',city:'hong-kong',capacity:8,enhanced:true});const host=await event(peers[0],e=>e.type==='joined'),ids=[host.id];
 for(const p of peers.slice(1)){send(p,{type:'join',code:host.code,city:'hong-kong'});ids.push((await event(p,e=>e.type==='joined')).id);}
 await event(peers[0],e=>e.type==='room'&&e.room.count===8);
 for(const p of peers)send(p,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:18,z:0},roofs:[{x:70,y:18,z:0},{x:-70,y:18,z:0}]});
 await event(peers[0],e=>e.type==='room'&&e.players.every(p=>p.ready));send(peers[0],{type:'start'});
 const started=await event(peers[0],e=>e.type==='room'&&e.room.phase==='playing');assert.equal(started.players.filter(p=>p.team==='police').length,2);
 const room=service.api.rooms.get(host.code),police=started.players.find(p=>p.team==='police'),runner=started.players.find(p=>p.team==='runner');
 const cop=peers[ids.indexOf(police.id)],victim=peers[ids.indexOf(runner.id)];
 const move=async(from,to)=>{const f=Math.atan2(to.x-from.x,to.z-from.z);send(cop,{type:'move',...from,facing:f});send(victim,{type:'move',...to,facing:0});await event(cop,e=>e.type==='move'&&e.id===runner.id);return f;};
 const from={x:0,y:18,z:0},to={x:0,y:18,z:2};
 let facing=await move(from,to);send(victim,{type:'hit-confirm',hitId:'forged',clear:false});
 const t=performance.now();send(cop,{type:'attack',kind:'punch',facing});const hit=await event(victim,e=>e.type==='hit'&&e.target===runner.id);const firstMs=performance.now()-t;assert.equal(hit.health,75);
 const times=[firstMs];
 for(let i=0;i<2;i++){await sleep(600);facing=await move(from,to);const before=performance.now();send(cop,{type:'attack',kind:'punch',facing});const result=await event(victim,e=>e.type==='hit'&&e.target===runner.id);assert.equal(result.health,50-i*25);times.push(performance.now()-before);}
 results.push({name:'Eight-player game with server-owned roles and real official-map clear-path hits',status:'PASS',roundTripMs:times,maxWarmLocalMs:Math.max(...times)});
 await sleep(650);
 const wallFrom={x:11.997259613504008,y:12.954967295603236,z:9.49292698412102},wallTo={x:12.89044527246819,y:12.958305340883367,z:8.165445068585282};
 const copRow=room.players.get(police.id),victimRow=room.players.get(runner.id);
 const wallProof=await service.terrain.visibility(wallFrom,wallTo);assert.equal(wallProof.status,'BLOCKED');
 facing=await move(wallFrom,wallTo);assert.equal(copRow.x,wallFrom.x);assert.equal(victimRow.x,wallTo.x);send(victim,{type:'hit-confirm',hitId:'forged',clear:true});send(cop,{type:'attack',kind:'punch',facing});
 await sleep(250);assert.equal(victimRow.health,25);results.push({name:'Actual official wall rejects a forged client approval',status:'PASS',health:25});
 for(const s of peers)s.close();await service.close();assert.equal(service.api.wss.clients.size,0);
 results.push({name:'Service shutdown closes clients and cleans up listeners',status:'PASS'});
 const out={status:'PASS',checked_at:new Date().toISOString(),scope:'Real localhost HTTP/WebSocket, eight participants, trusted official map; local round-trip timing excludes internet and host cold starts.',results};
 fs.mkdirSync('docs/qa/dedicated-room-server-2026-10-13',{recursive:true});fs.writeFileSync('docs/qa/dedicated-room-server-2026-10-13/results.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
}finally{MATCH.graceMs=grace;for(const s of sockets)s.terminate();await service.close();}
