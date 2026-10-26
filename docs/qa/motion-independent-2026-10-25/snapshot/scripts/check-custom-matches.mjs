import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from './rooms.mjs';
import {MATCH} from '../src/MatchRules.js';
import {attackGate} from '../src/AttackRules.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer(),api=attachRooms(server,{terrain:{visibility:async()=>({status:'CLEAR',version:'test'})}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const sockets=[];
const connect=()=>new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);ws.events=[];ws.on('message',raw=>ws.events.push(JSON.parse(raw)));ws.once('open',()=>{sockets.push(ws);resolve(ws);});ws.once('error',reject);});
const send=(ws,data)=>ws.send(JSON.stringify(data));
async function event(ws,fn){for(let i=0;i<300;i++){const index=ws.events.findIndex(fn);if(index>=0)return ws.events.splice(index,1)[0];await sleep(10);}throw Error('Missing event '+JSON.stringify(ws.events.slice(-4)));}
const grace=MATCH.graceMs,punchCooldown=MATCH.punch.cooldown,webCooldown=MATCH.web.cooldown;
try{
 MATCH.graceMs=0;MATCH.punch.cooldown=0;MATCH.web.cooldown=0;
 const clients=await Promise.all(Array.from({length:9},connect));
 async function setup(format,count){
  for(const ws of clients){ws.events.length=0;send(ws,{type:'leave'});}await sleep(80);for(const ws of clients)ws.events.length=0;
  send(clients[0],{type:'create',mode:'custom',format,capacity:count,city:'hong-kong'});
  const joined=await event(clients[0],e=>e.type==='joined');
  const ids=[joined.id];
  for(let i=1;i<count;i++){send(clients[i],{type:'join',code:joined.code,city:'hong-kong'});ids.push((await event(clients[i],e=>e.type==='joined')).id);}
  await event(clients[0],e=>e.type==='room'&&e.players.length===count);
  return {ids,code:joined.code,room:api.rooms.get(joined.code)};
 }
 async function start(count){for(const ws of clients.slice(0,count))send(ws,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:100,z:0}});await event(clients[0],e=>e.type==='room'&&e.players.length===count&&e.players.every(p=>p.ready));send(clients[0],{type:'start'});return event(clients[0],e=>e.type==='room'&&e.room.phase==='playing');}
 async function place(ids){await sleep(60);for(let i=0;i<ids.length;i++)send(clients[i],{type:'move',x:0,y:100,z:i*.3,facing:0});await event(clients[0],e=>e.type==='move'&&e.id===ids.at(-1));}
 async function attack(attacker,target,kind='punch'){const idsForAttack=[...api.rooms.values()].find(r=>r.players.has(target))?.players;const attackerId=[...idsForAttack.keys()][attacker];send(clients[attacker],{type:'attack',kind,facing:0,targetId:target});return event(clients[attacker],e=>e.type==='attack-result'||(e.type==='hit'&&e.attacker===attackerId&&e.target===target));}
 let {ids,code,room}=await setup('teams',8);
 assert.equal([...room.players.values()].filter(p=>p.team==='red').length,4);
 send(clients[8],{type:'join',code,city:'hong-kong'});assert.match((await event(clients[8],e=>e.type==='error')).message,/가득/);
 send(clients[0],{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:100,z:0}});await event(clients[0],e=>e.type==='room'&&e.players[0].ready);
 send(clients[0],{type:'team',team:'blue'});await event(clients[0],e=>e.type==='room'&&e.players[0].team==='blue'&&e.players.every(p=>!p.ready));
 send(clients[0],{type:'team',team:'red'});await event(clients[0],e=>e.type==='room'&&e.players[0].team==='red');
 await start(8);await place(ids);
 assert.equal((await attack(0,ids[2])).reason,'target','Friendly fire accepted');
 assert.equal((await attack(0,ids[3],'web')).health,85);
 assert.equal(room.players.get(ids[1]).health,100,'Named attack switched to another target');
 assert.equal((await attack(1,ids[0])).health,75,'Blue team could not attack red');
 for(const target of ids.filter(id=>room.players.get(id).team==='blue')){
  while(!room.players.get(target).eliminated)assert.equal((await attack(0,target)).type,'hit');
 }
 assert.equal(room.phase,'finished');assert.equal(room.winner,'red');
 send(clients[0],{type:'rematch'});await event(clients[0],e=>e.type==='room'&&e.room.phase==='waiting'&&e.players.every(p=>p.health===100&&!p.eliminated&&!p.ready));
 ({ids,room}=await setup('ffa',3));await start(3);await place(ids);
 for(const target of ids.slice(1))for(let i=0;i<4;i++)assert.equal((await attack(0,target)).type,'hit');
 assert.equal(room.winner,ids[0]);assert.equal(room.phase,'finished');
 ({ids,room}=await setup('teams',2));
 send(clients[1],{type:'team',team:'red'});await event(clients[0],e=>e.type==='room'&&e.players.every(p=>p.team==='red'));
 for(const ws of clients.slice(0,2))send(ws,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:100,z:0}});await event(clients[0],e=>e.type==='room'&&e.players.every(p=>p.ready));send(clients[0],{type:'start'});assert.match((await event(clients[0],e=>e.type==='error')).message,/양쪽/);
 send(clients[1],{type:'team',team:'blue'});await event(clients[0],e=>e.type==='room'&&e.players[1]?.team==='blue');await start(2);await place(ids);
 const victim=room.players.get(ids[1]);victim.z=23;
 assert.equal((await attack(0,ids[1],'web')).reason,'range');victim.z=1;victim.y=109;
 assert.equal((await attack(0,ids[1],'web')).reason,'height');victim.y=100;victim.z=-1;
 assert.equal((await attack(0,ids[1],'web')).reason,'aim');
 send(clients[1],{type:'leave'});await event(clients[0],e=>e.type==='room'&&e.room.phase==='finished');assert.equal(room.winner,'red');
 for(const kind of ['web','punch']){const rule=MATCH[kind],from={x:0,y:0,z:0};assert.equal(attackGate(from,{x:0,y:rule.vertical,z:rule.reach},kind,0),null);assert.equal(attackGate(from,{x:0,y:0,z:rule.reach+.001},kind,0),'range');assert.equal(attackGate(from,{x:0,y:rule.vertical+.001,z:1},kind,0),'height');}
 console.log('PASS custom: 8-player cap, teams, ready reset, friendly fire, exact named target, mutual combat, HP, elimination, victory, rematch, FFA, 1v1, empty-team guard, miss reasons, disconnect win, inclusive boundaries');
}finally{MATCH.graceMs=grace;MATCH.punch.cooldown=punchCooldown;MATCH.web.cooldown=webCooldown;for(const ws of sockets)ws.terminate();await new Promise(r=>server.close(r));}
