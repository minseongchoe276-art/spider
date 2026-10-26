import assert from 'node:assert/strict';
import fs from 'node:fs';
import WebSocket from 'ws';
const base=process.env.ROOM_SERVER_URL||'http://127.0.0.1:4181';
const service=new URL(base);assert.equal(service.pathname,'/');
assert(service.protocol==='https:'||['localhost','127.0.0.1'].includes(service.hostname));
const peers=[],results=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(ws,data)=>ws.send(JSON.stringify(data));
async function event(ws,predicate,timeout=20000){const until=Date.now()+timeout;while(Date.now()<until){const i=ws.events.findIndex(predicate);if(i>=0)return ws.events.splice(i,1)[0];await sleep(10);}throw Error(`Missing public event: ${JSON.stringify(ws.events.slice(-3))}`);}
async function connect(){const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws',{origin:'https://minogame.site',handshakeTimeout:20000});ws.events=[];ws.on('message',raw=>ws.events.push(JSON.parse(raw)));ws.on('error',()=>{});peers.push(ws);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});assert((await event(ws,e=>e.type==='welcome')).features.includes('custom-matches'));return ws;}
let active=[],ids=[],code,city;
async function setup(format,count,map){
 for(const ws of active)send(ws,{type:'leave'});await sleep(150);
 active=peers.slice(0,count);for(const ws of peers)ws.events=[];city=map;
 send(active[0],{type:'create',mode:'custom',format,city,capacity:count,name:'Release verification only'});
 const host=await event(active[0],e=>e.type==='joined');code=host.code;ids=[host.id];
 for(const ws of active.slice(1)){send(ws,{type:'join',code,city});ids.push((await event(ws,e=>e.type==='joined')).id);}
 const joined=await event(active[0],e=>e.type==='room'&&e.room.code===code&&e.players.length===count);assert.equal(joined.room.mode,'custom');assert.equal(joined.room.format,format);return joined;
}
const position=i=>({x:0,y:city==='hong-kong'?18:200,z:i*.2,facing:0});
async function move(i){send(active[i],{type:'move',...position(i)});await event(active[i],e=>e.type==='move'&&e.id===ids[i]);}
async function begin(){
 for(const ws of active)send(ws,{type:'ready',ready:true,terrainReady:true,spawn:position(0)});
 await event(active[0],e=>e.type==='room'&&e.room.code===code&&e.players.length===active.length&&e.players.every(p=>p.ready));
 send(active[0],{type:'start'});const started=await event(active[0],e=>e.type==='room'&&e.room.code===code&&e.room.phase==='playing');
 for(let i=0;i<active.length;i++)await move(i);
 send(active[0],{type:'attack',kind:'web',facing:0,targetId:ids[1]});assert.equal((await event(active[0],e=>e.type==='attack-result')).reason,'protected');
 await sleep(Math.max(0,started.vulnerableAt-started.serverNow)+300);await move(0);return started;
}
const times=[];
async function strike(i,j,kind='punch'){
 await sleep(kind==='punch'?620:1650);await move(i);
 const stamp=performance.now();send(active[i],{type:'attack',kind,facing:0,targetId:ids[j]});
 const hit=await event(active[i],e=>e.type==='hit'&&e.attacker===ids[i]&&e.target===ids[j]);times.push(performance.now()-stamp);return hit;
}
try{
 const response=await fetch(new URL('/healthz',base),{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const health=await response.json();assert(health.features.includes('custom-matches'));
 for(let i=0;i<9;i++)await connect();
 let state=await setup('teams',8,'hong-kong');assert.equal(state.players.filter(p=>p.team==='red').length,4);
 send(peers[8],{type:'join',code,city});assert.match((await event(peers[8],e=>e.type==='error')).message,/가득/);
 await begin();
 send(active[0],{type:'attack',kind:'web',facing:0,targetId:ids[2]});assert.equal((await event(active[0],e=>e.type==='attack-result')).reason,'target');
 assert.equal((await strike(0,7,'web')).health,85);
 assert.equal((await strike(1,0)).health,75);
 send(active[1],{type:'attack',kind:'punch',facing:0,targetId:ids[0]});assert.equal((await event(active[1],e=>e.type==='attack-result')).reason,'cooldown');
 const livingBlue=new Set([1,3,5,7]);
 for(const j of livingBlue)for(let n=0;n<4;n++){const hit=await strike(0,j);assert.equal(hit.health,Math.max(0,(j===7?85:100)-(n+1)*25));assert.equal(hit.eliminated,n===3);}
 state=await event(active[0],e=>e.type==='room'&&e.room.code===code&&e.room.phase==='finished');assert.equal(state.winner,'red');assert.equal(state.players.find(p=>p.id===ids[0]).health,75);assert.equal(state.players.find(p=>p.id===ids[2]).health,100);
 send(active[0],{type:'rematch'});state=await event(active[0],e=>e.type==='room'&&e.room.code===code&&e.room.phase==='waiting');assert(state.players.every(p=>p.health===100&&!p.eliminated&&!p.ready));
 results.push({name:'Eight real internet clients: capacity, 4v4, grace, named non-nearest target, friendly-fire rejection, mutual attacks, cooldown, elimination, team win and rematch',status:'PASS'});
 await setup('ffa',3,'procedural');await begin();
 for(const j of [1,2])for(let n=0;n<4;n++)assert.equal((await strike(0,j)).health,100-(n+1)*25);
 state=await event(active[0],e=>e.type==='room'&&e.room.code===code&&e.room.phase==='finished');assert.equal(state.winner,ids[0]);
 results.push({name:'Three-player FFA: each participant is an opponent; last survivor wins',status:'PASS'});
 const proof={status:'PASS',checkedAt:new Date().toISOString(),service:service.origin,revision:health.revision,attackRoundTripMs:times,results};
 const output='docs/qa/custom-release-2026-10-20/public-custom.json';fs.mkdirSync('docs/qa/custom-release-2026-10-20',{recursive:true});fs.writeFileSync(output,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));
}finally{for(const ws of peers)if(ws.readyState===WebSocket.OPEN)send(ws,{type:'leave'});await sleep(200);for(const ws of peers)ws.terminate();}
