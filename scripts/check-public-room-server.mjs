import assert from 'node:assert/strict';
import fs from 'node:fs';
import WebSocket from 'ws';
const base=process.env.ROOM_SERVER_URL;if(!base)throw Error('Set ROOM_SERVER_URL to the deployed service HTTPS origin');
const origin=new URL(base);if(origin.pathname!=='/'||origin.search||origin.hash||!['https:','http:'].includes(origin.protocol))throw Error('Use a service origin without path or query');
if(origin.protocol==='http:'&&!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('Public service checks require HTTPS');
const wsUrl=base.replace(/^http/,'ws').replace(/\/$/,'')+'/ws',sockets=[],results=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),send=(s,p)=>s.send(JSON.stringify(p));
let code;
async function connect(){const s=new WebSocket(wsUrl,{origin:process.env.ROOM_SERVER_ORIGIN||'https://minogame.site'});s.events=[];s.on('message',b=>s.events.push(JSON.parse(b)));s.on('error',()=>{});sockets.push(s);await new Promise((r,j)=>{s.once('open',r);s.once('error',j);});return s;}
async function event(s,p,timeout=20000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const i=s.events.findIndex(p);if(i>=0)return s.events.splice(i,1)[0];await sleep(5);}throw Error('Expected public server event absent');}
try{
 const response=await fetch(new URL('/healthz',base),{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);const health=await response.json();assert.equal(health.authority,'server-owned-rooms');
 const peers=await Promise.all(Array.from({length:8},connect));send(peers[0],{type:'create',name:'public authority acceptance',mode:'tag',city:'hong-kong',capacity:8,enhanced:true});
 const joined=[await event(peers[0],e=>e.type==='joined')];code=joined[0].code;
 for(const s of peers.slice(1)){send(s,{type:'join',code,city:'hong-kong'});joined.push(await event(s,e=>e.type==='joined'));}
 for(const s of peers)send(s,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:18,z:0},roofs:[{x:70,y:18,z:0},{x:-70,y:18,z:0}]});
 await event(peers[0],e=>e.type==='room'&&e.players.every(p=>p.ready));send(peers[0],{type:'start'});
 const started=await event(peers[0],e=>e.type==='room'&&e.room.phase==='playing');assert.equal(started.players.length,8);assert.equal(started.players.filter(p=>p.team==='police').length,2);
 const copId=started.players.find(p=>p.team==='police').id,victimId=started.players.find(p=>p.team==='runner').id,cop=peers[joined.findIndex(p=>p.id===copId)],victim=peers[joined.findIndex(p=>p.id===victimId)];
 await sleep(Math.max(0,started.vulnerableAt-started.serverNow)+250);
 const move=async(from,to)=>{const facing=Math.atan2(to.x-from.x,to.z-from.z);send(cop,{type:'move',...from,facing});send(victim,{type:'move',...to,facing:0});const acceptedCop=await event(victim,e=>e.type==='move'&&e.id===copId);const acceptedVictim=await event(cop,e=>e.type==='move'&&e.id===victimId);assert.equal(acceptedCop.x,from.x);assert.equal(acceptedVictim.z,to.z);return facing;};
 const from={x:0,y:18,z:0},to={x:0,y:18,z:2},times=[];
 for(let i=0;i<3;i++){const facing=await move(from,to);send(victim,{type:'hit-confirm',hitId:'forged',clear:false});const t=performance.now();send(cop,{type:'attack',kind:'punch',facing});const hit=await event(victim,e=>e.type==='hit'&&e.target===victimId);times.push(performance.now()-t);assert.equal(hit.health,75-i*25);await sleep(650);}
 results.push({name:'Eight real public WebSocket clients, server roles, official-map hits independent of defender claims',status:'PASS',attackRoundTripMs:times});
 const wallFrom={x:11.997259613504008,y:12.954967295603236,z:9.49292698412102},wallTo={x:12.89044527246819,y:12.958305340883367,z:8.165445068585282};
 const facing=await move(wallFrom,wallTo);send(victim,{type:'hit-confirm',hitId:'forged',clear:true});send(cop,{type:'attack',kind:'punch',facing});
 // Exceeds both the 15s map fetch budget and 10s pending-hit deadline.
 await sleep(16000);assert(!victim.events.some(e=>e.type==='hit'&&e.target===victimId),'Through-wall damage applied');assert(!cop.events.some(e=>e.type==='error'),'Official wall check fell back to unavailable terrain');
 results.push({name:'Actual official wall rejects forged client approval without a timeout-default hit',status:'PASS'});
 const nextFacing=await move(from,to);send(cop,{type:'attack',kind:'punch',facing:nextFacing});const finalHit=await event(victim,e=>e.type==='hit'&&e.target===victimId);assert.equal(finalHit.health,0);assert.equal(finalHit.eliminated,true);
 const old=joined.find(p=>p.id===victimId);victim.close();await sleep(150);const resumed=await connect();send(resumed,{type:'resume',code,token:old.resumeToken});assert.equal((await event(resumed,e=>e.type==='joined')).id,victimId);
 const restored=await event(resumed,e=>e.type==='room'&&e.room.phase==='playing');assert.equal(restored.players.find(p=>p.id===victimId).health,0);assert.equal(restored.players.find(p=>p.id===victimId).eliminated,true);
 results.push({name:'Reconnect preserves the same identity and eliminated state',status:'PASS'});
 for(const s of sockets)if(s.readyState===WebSocket.OPEN)send(s,{type:'leave'});await sleep(200);
 const probe=await connect();send(probe,{type:'list'});const listed=await event(probe,e=>e.type==='rooms'&&!e.rooms.some(r=>r.code===code));assert(!listed.rooms.some(r=>r.code===code));
 assert.equal((await fetch(new URL('/healthz',base))).status,200);
 results.push({name:'Only the temporary test room is removed; service remains healthy',status:'PASS'});
 const proof={status:'PASS',checked_at:new Date().toISOString(),service:origin.origin,scope:'Real HTTP/WebSocket round trips from the verification machine, official Hong Kong geometry, eight temporary participants, actual server grace and cooldown. No existing room mutated.',results};
 const evidence=origin.protocol==='https:'?'public-results.json':'protocol-local-results.json';
 fs.writeFileSync(`docs/qa/dedicated-room-server-2026-10-13/${evidence}`,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));
}finally{for(const s of sockets){if(s.readyState===WebSocket.OPEN)send(s,{type:'leave'});s.close();}await sleep(100);for(const s of sockets)s.terminate();}
