import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'node:http';
import WebSocket,{WebSocketServer} from 'ws';
import {attachRooms} from './rooms.mjs';
// Deterministic application-message impairment over real local WebSockets.
// TCP packet loss and public-internet routing are deliberately outside this test.
const server=createServer(),api=attachRooms(server),proxy=createServer(),gateway=new WebSocketServer({server:proxy});
const sockets=new Set(),timers=new Set(),clients=[];let dropped=0,forwarded=0;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
gateway.on('connection',front=>{
 const back=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);sockets.add(front);sockets.add(back);
 const pending=[];let up=0,down=0,serial=0;
 const relay=(destination,raw,direction)=>{
  const parsed=JSON.parse(String(raw));serial++;
  if(parsed.type==='move'&&serial%7===0){dropped++;return;}
  const now=Date.now(),jitter=(serial*17)%61;
  const due=Math.max(now+90+jitter,(direction==='up'?up:down)+1);
  if(direction==='up')up=due;else down=due;
  const timer=setTimeout(()=>{timers.delete(timer);if(destination.readyState===1){destination.send(raw.toString());forwarded++;}},due-now);timers.add(timer);
 };
 front.on('message',raw=>back.readyState===1?relay(back,raw,'up'):pending.push(raw));
 back.on('open',()=>{for(const raw of pending)relay(back,raw,'up');pending.length=0;});
 back.on('message',raw=>relay(front,raw,'down'));
 front.on('close',()=>back.terminate());back.on('close',()=>{if(front.readyState===1)front.close();});
 front.on('error',()=>{});back.on('error',()=>{});
});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const send=(ws,data)=>ws.send(JSON.stringify(data));
async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${proxy.address().port}`);ws.events=[];
 ws.on('message',raw=>{ws.events.push(JSON.parse(String(raw)));if(ws.events.length>1000)ws.events.shift();});ws.on('error',()=>{});
 clients.push(ws);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return ws;}
async function wait(ws,predicate){const end=Date.now()+7000;while(Date.now()<end){const i=ws.events.findIndex(predicate);if(i>=0)return ws.events.splice(i,1)[0];await pause(10);}throw Error('Delayed room event timed out');}
const report={environment:'isolated-local-websocket-proxy',oneWayDelayMs:[90,150],droppedApplicationUpdates:0,players:8,cases:[]};
try{
 const peers=await Promise.all(Array.from({length:8},connect));
 send(peers[0],{type:'create',mode:'free',capacity:8,city:'procedural',playerName:'QA-0'});
 const owner=await wait(peers[0],e=>e.type==='joined'),members=[owner];
 for(let i=1;i<8;i++){send(peers[i],{type:'join',code:owner.code,city:'procedural',playerName:`QA-${i}`});members.push(await wait(peers[i],e=>e.type==='joined'));}
 const room=api.rooms.get(owner.code);assert.equal(room.players.size,8);
 peers.forEach(ws=>send(ws,{type:'ready',ready:true}));
 await wait(peers[0],e=>e.type==='room'&&e.players.length===8&&e.players.every(p=>p.ready));
 send(peers[0],{type:'start'});await Promise.all(peers.map(ws=>wait(ws,e=>e.type==='room'&&e.room.phase==='playing')));
 report.cases.push('eight clients join, ready and start under delay/jitter');
 for(let frame=0;frame<15;frame++){
  peers.forEach((ws,i)=>send(ws,{type:'move',x:i*3,y:30,z:frame*.3,facing:0,pose:{state:'RUNNING',velocity:{x:0,y:0,z:3},webs:[]}}));await pause(100);
 }
 await pause(600);
 for(const member of members){const p=room.players.get(member.id);assert(p.seen);assert(Number.isFinite(p.x));}
 assert(dropped>0);assert(peers.every(ws=>ws.events.some(e=>e.type==='move')));
 report.cases.push('all eight maintain finite accepted movement despite dropped application updates');
 const stamp=performance.now();send(peers[0],{type:'ping',stamp});await wait(peers[0],e=>e.type==='pong'&&e.stamp===stamp);
 report.roundTripMs=Math.round(performance.now()-stamp);assert(report.roundTripMs>=180);
 peers[7].close();await new Promise(r=>peers[7].once('close',r));await pause(350);
 const replacement=await connect();send(replacement,{type:'resume',code:owner.code,token:members[7].resumeToken});
 const resumed=await wait(replacement,e=>e.type==='joined');assert.equal(resumed.id,members[7].id);assert.equal(room.players.size,8);
 await wait(replacement,e=>e.type==='room'&&e.room.phase==='playing');
 report.cases.push('disconnected eighth player resumes the same seat and running round');
 send(peers[0],{type:'leave'});await wait(peers[1],e=>e.type==='room'&&e.host!==owner.id);
 assert.notEqual(room.host,owner.id);report.cases.push('host departure transfers ownership under impaired delivery');
 report.status='PASS';report.droppedApplicationUpdates=dropped;report.forwardedMessages=forwarded;
 console.log(`PASS eight-player impairment: ${report.cases.length} cases, RTT ${report.roundTripMs}ms, ${dropped} application updates dropped`);
}finally{
 for(const t of timers)clearTimeout(t);for(const ws of clients)ws.terminate();for(const ws of sockets)ws.terminate();
 gateway.close();await new Promise(r=>proxy.close(r));await new Promise(r=>server.close(r));
 const folder='docs/qa/player-completion-2026-10-25';fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/network-conditions.json',JSON.stringify(report,null,2)+'\n');
}
