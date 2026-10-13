import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from './rooms.mjs';
import {MATCH} from '../src/MatchRules.js';
const server=createServer((q,r)=>r.end('ok'));const api=attachRooms(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));
const sockets=[];const open=()=>new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);ws.events=[];ws.on('message',b=>ws.events.push(JSON.parse(b)));ws.once('error',reject);ws.once('open',()=>{sockets.push(ws);resolve(ws);});});
const send=(ws,d)=>ws.send(JSON.stringify(d));const sleep=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(ws,p)=>{for(let i=0;i<200;i++){const index=ws.events.findIndex(p);if(index>=0)return ws.events.splice(index,1)[0];await sleep(10);}throw Error('Missing event '+JSON.stringify(ws.events));};
try {
 MATCH.graceMs=0;const a=await open(),b=await open();send(a,{type:'create',name:'upgrade regression',city:'hong-kong',mode:'tag',capacity:2,enhanced:true});const joinedA=await wait(a,e=>e.type==='joined');const state=await wait(a,e=>e.type==='room');const code=state.room.code;send(b,{type:'join',code,city:'hong-kong'});const joinedB=await wait(b,e=>e.type==='joined');await wait(a,e=>e.type==='room'&&e.room.count===2);
 send(a,{type:'ready',ready:true,terrainReady:false});await wait(a,e=>e.type==='error');
 send(a,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:50,z:0},roofs:[]});await wait(a,e=>e.type==='error');
 const spawn={x:0,y:50,z:0},roofs=[{x:40,y:50,z:0},{x:-40,y:50,z:0}];send(a,{type:'ready',ready:true,terrainReady:true,spawn,roofs});send(b,{type:'ready',ready:true,terrainReady:true,spawn,roofs});await wait(a,e=>e.type==='room'&&e.players.every(p=>p.ready));send(a,{type:'start'});const started=await wait(a,e=>e.type==='room'&&e.room.phase==='playing');assert.equal(started.arena.radius,450);assert(started.endsAt-started.serverNow<=180000);
 const byId=new Map([[joinedA.id,a],[joinedB.id,b]]),police=byId.get(started.players.find(p=>p.team==='police').id),runner=byId.get(started.players.find(p=>p.team==='runner').id);
 send(police,{type:'move',x:0,y:50,z:0,facing:0});send(runner,{type:'move',x:0,y:50,z:2,facing:0});await wait(police,e=>e.type==='move'&&e.z===2);
 send(police,{type:'attack',kind:'punch',facing:0});const check=await wait(runner,e=>e.type==='hit-check');send(police,{type:'hit-confirm',hitId:check.hitId,clear:true});await sleep(40);assert(!runner.events.some(e=>e.type==='hit'));
 send(runner,{type:'hit-confirm',hitId:check.hitId,clear:false});await sleep(40);assert(!runner.events.some(e=>e.type==='hit'));
 await sleep(570);send(police,{type:'move',x:0,y:50,z:0,facing:0});send(runner,{type:'move',x:0,y:50,z:2,facing:0});await sleep(40);send(police,{type:'attack',kind:'punch',facing:0});const clear=await wait(runner,e=>e.type==='hit-check');send(runner,{type:'hit-confirm',hitId:clear.hitId,clear:true});const hit=await wait(runner,e=>e.type==='hit');assert.equal(hit.health,75);
 send(runner,{type:'hit-confirm',hitId:clear.hitId,clear:true});await sleep(40);assert(!runner.events.some(e=>e.type==='hit'));
 send(runner,{type:'move',x:1000,y:50,z:0,facing:0});await wait(runner,e=>e.type==='correction');
 const closedId=runner===a?joinedA:joinedB;runner.close();await sleep(50);assert.equal(api.rooms.get(code).players.size,2);const resumed=await open();send(resumed,{type:'resume',code,token:closedId.resumeToken});const restored=await wait(resumed,e=>e.type==='joined');assert.equal(restored.id,closedId.id);
 const room=api.rooms.get(code),originalPolice=started.players.find(p=>p.team==='police').id;
 room.phase='finished';send(byId.get(joinedA.id)||resumed,{type:'rematch'}); // host may be disconnected; use resumed if host was runner.
 const hostSocket=closedId.id===joinedA.id?resumed:a;
 if(hostSocket!==a)send(hostSocket,{type:'rematch'});
 await wait(hostSocket,e=>e.type==='room'&&e.room.phase==='waiting'&&e.round===2);for(const p of room.players.values())p.ready=true;
 send(hostSocket,{type:'start'});const rotated=await wait(hostSocket,e=>e.type==='room'&&e.room.phase==='playing'&&e.round===2);assert.notEqual(rotated.players.find(p=>p.team==='police').id,originalPolice);
 // Exercise movement objectives using accepted updates, including the goal cooldown.
 const newRunner=rotated.players.find(p=>p.team==='runner').id,activeSockets=new Map([[joinedA.id,joinedA.id===closedId.id?resumed:a],[joinedB.id,joinedB.id===closedId.id?resumed:b]]),goalSocket=activeSockets.get(newRunner);
 for(const x of [0,10,20,30,40]){send(goalSocket,{type:'move',x,y:50,z:0,facing:0});await sleep(160);}
 await wait(goalSocket,e=>e.type==='room'&&e.round===2&&e.players.find(p=>p.id===newRunner)?.progress===1);
 await sleep(1250);
 for(const x of [30,20,10,0,-10,-20,-30,-40]){send(goalSocket,{type:'move',x,y:50,z:0,facing:0});await sleep(160);}
 await wait(goalSocket,e=>e.type==='room'&&e.round===2&&e.players.find(p=>p.id===newRunner)?.progress===2);
 await sleep(1250);
 for(const x of [-30,-20,-10,0,10,20,30,40]){send(goalSocket,{type:'move',x,y:50,z:0,facing:0});await sleep(160);}
 const escaped=await wait(goalSocket,e=>e.type==='room'&&e.room.phase==='finished'&&e.round===2);assert.equal(escaped.winner,'runner');

 const trio=await Promise.all([open(),open(),open()]);send(trio[0],{type:'create',name:'rescue regression',city:'hong-kong',mode:'tag',capacity:3,enhanced:true});const host=await wait(trio[0],e=>e.type==='joined');const created=await wait(trio[0],e=>e.type==='room');const ids=new Map([[host.id,trio[0]]]);
 for(const ws of trio.slice(1)){send(ws,{type:'join',code:created.room.code,city:'hong-kong'});const joined=await wait(ws,e=>e.type==='joined');ids.set(joined.id,ws);}
 await wait(trio[0],e=>e.type==='room'&&e.room.count===3);for(const ws of trio)send(ws,{type:'ready',ready:true,terrainReady:true,spawn,roofs});await wait(trio[0],e=>e.type==='room'&&e.room.count===3&&e.players.every(p=>p.ready));send(trio[0],{type:'start'});const rescueRound=await wait(trio[0],e=>e.type==='room'&&e.room.phase==='playing');
 const copId=rescueRound.players.find(p=>p.team==='police').id,runners=rescueRound.players.filter(p=>p.team==='runner'),victimId=runners[0].id,helperId=runners[1].id,cop=ids.get(copId),victim=ids.get(victimId),helper=ids.get(helperId);
 send(helper,{type:'move',x:0,y:50,z:3,facing:0});
 for(let i=0;i<4;i++){send(cop,{type:'move',x:0,y:50,z:0,facing:0});send(victim,{type:'move',x:0,y:50,z:2,facing:0});await sleep(60);send(cop,{type:'attack',kind:'punch',facing:0});const request=await wait(victim,e=>e.type==='hit-check');send(victim,{type:'hit-confirm',hitId:request.hitId,clear:true});const hit=await wait(victim,e=>e.type==='hit');assert.equal(hit.health,75-i*25);await sleep(580);}
 await wait(helper,e=>e.type==='hit'&&e.target===victimId&&e.eliminated===true);
 for(let i=0;i<23;i++){send(helper,{type:'move',x:0,y:50,z:3,facing:0});await sleep(150);}
 const rescued=await wait(helper,e=>e.type==='room'&&e.players.find(p=>p.id===victimId)?.health===50);assert.equal(rescued.players.find(p=>p.id===victimId).eliminated,false);assert.equal(rescued.room.phase,'playing');
 console.log('PASS teammate rescue: verified attacks down a runner, three seconds nearby restore HP 50 while match continues');
 console.log('PASS movement objectives: ordered positions, cooldown, three objectives end match with runner victory');
 console.log('PASS enhanced online: terrain readiness, arena/time, defender-authenticated visibility, blocked hit, replay prevention, boundary correction, reconnection identity, role rotation');
}finally{for(const s of sockets)s.close();await sleep(30);api.wss.close();await new Promise(r=>server.close(r));}
