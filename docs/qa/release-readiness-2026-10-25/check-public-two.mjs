import fs from 'node:fs';
import assert from 'node:assert/strict';
import WebSocket from '../../../node_modules/ws/wrapper.mjs';
const base='https://minogame-room-authority.onrender.com',sockets=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
const send=(s,p)=>s.send(JSON.stringify(p));
async function event(s,p){const until=Date.now()+15000;while(Date.now()<until){const i=s.events.findIndex(p);if(i>=0)return s.events.splice(i,1)[0];await pause(10);}throw Error('Expected temporary two-player room event absent');}
async function connect(){const s=new WebSocket(base.replace('https:','wss:')+'/ws',{origin:'https://minogame.site',handshakeTimeout:20000});s.events=[];sockets.push(s);s.on('message',b=>s.events.push(JSON.parse(b)));s.on('error',()=>{});await new Promise((r,j)=>{s.once('open',r);s.once('error',j);});await event(s,e=>e.type==='welcome');return s;}
let code;
try{
 const a=await connect();let b=await connect();send(a,{type:'create',city:'procedural',mode:'custom',format:'ffa',capacity:2,name:'Release verification only'});
 const owner=await event(a,e=>e.type==='joined');code=owner.code;send(b,{type:'join',code,city:'procedural'});const peer=await event(b,e=>e.type==='joined');
 for(const s of [a,b])send(s,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:200,z:0}});
 await event(a,e=>e.type==='room'&&e.players.length===2&&e.players.every(p=>p.ready));send(a,{type:'start'});
 const started=await event(a,e=>e.type==='room'&&e.room.phase==='playing');await pause(Math.max(0,started.vulnerableAt-started.serverNow)+300);
 const move=async()=>{send(a,{type:'move',x:0,y:200,z:0,facing:0});send(b,{type:'move',x:0,y:200,z:.4,facing:0});await event(a,e=>e.type==='move'&&e.id===peer.id);};
 const strike=async health=>{await pause(650);await move();send(a,{type:'attack',kind:'punch',facing:0,targetId:peer.id});const hit=await event(a,e=>e.type==='hit'&&e.target===peer.id);assert.equal(hit.health,health);return hit;};
 await strike(75);await strike(50);b.close();await new Promise(r=>b.once('close',r));b=await connect();send(b,{type:'resume',code,token:peer.resumeToken});assert.equal((await event(b,e=>e.type==='joined')).id,peer.id);
 const restored=await event(b,e=>e.type==='room'&&e.room.phase==='playing');assert.equal(restored.players.find(p=>p.id===peer.id).health,50);
 await strike(25);assert.equal((await strike(0)).eliminated,true);const finished=await event(b,e=>e.type==='room'&&e.room.phase==='finished');assert.equal(finished.winner,owner.id);assert(finished.players.find(p=>p.id===peer.id).eliminated);
 for(const s of [a,b])send(s,{type:'leave'});await pause(200);send(a,{type:'list'});assert(!(await event(a,e=>e.type==='rooms')).rooms.some(r=>r.code===code));
 const proof={status:'PASS',checkedAt:new Date().toISOString(),scope:'Two actual public WebSocket clients from one verification machine; not two humans or real browser spectator cameras',cases:['two-player FFA start','HP persists across resume to same identity','elimination and winner propagated to both clients','temporary room cleaned up']};
 fs.writeFileSync(new URL('./public-two.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));
}finally{for(const s of sockets){if(s.readyState===1)send(s,{type:'leave'});s.close();}await pause(200);for(const s of sockets)s.terminate();}
