import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { attachRooms } from './rooms.mjs';

const server=createServer((req,res)=>res.end('ok'));
attachRooms(server);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`ws://127.0.0.1:${server.address().port}/ws`;
const sockets=[];
const connect=()=>new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.events=[];ws.on('message',raw=>ws.events.push(JSON.parse(raw)));ws.once('open',()=>{sockets.push(ws);resolve(ws);});ws.once('error',reject);});
const send=(ws,data)=>ws.send(JSON.stringify(data));
const wait=async(ws,predicate)=>{const end=Date.now()+2500;while(Date.now()<end){const i=ws.events.findIndex(predicate);if(i>=0)return ws.events.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error(`Timed out: ${JSON.stringify(ws.events)}`);};
try {
  const players=await Promise.all(Array.from({length:4},connect));
  send(players[0],{type:'create',name:'테스트 방',mode:'tag',capacity:4,city:'procedural',playerName:'호스트'});
  const first=await wait(players[0],v=>v.type==='room'&&v.room.count===1);
  assert.match(first.room.code,/^[A-F0-9]{6}$/);
  const code=first.room.code;
  for(let i=1;i<4;i++)send(players[i],{type:'join',code,city:'procedural',playerName:`친구${i}`});
  await wait(players[0],v=>v.type==='room'&&v.room.count===4);
  for(const ws of players)send(ws,{type:'ready',ready:true});
  await wait(players[0],v=>v.type==='room'&&v.players.every(p=>p.ready));
  send(players[0],{type:'start'});
  const started=await wait(players[0],v=>v.type==='room'&&v.room.phase==='playing');
  assert.equal(started.players.filter(p=>p.team==='police').length,1);
  assert.equal(started.players.filter(p=>p.team==='runner').length,3);
  const ids=await Promise.all(players.map(ws=>wait(ws,v=>v.type==='joined').then(v=>v.id)));
  const police=players[ids.indexOf(started.players.find(p=>p.team==='police').id)];
  const runner=players[ids.indexOf(started.players.find(p=>p.team==='runner').id)];
  send(police,{type:'move',x:0,y:0,z:0,facing:0});send(runner,{type:'move',x:0,y:0,z:2,facing:0});
  await wait(police,v=>v.type==='move'&&v.id===ids[players.indexOf(runner)]);
  send(police,{type:'attack',kind:'punch',facing:0});
  const hit=await wait(runner,v=>v.type==='hit');
  assert.equal(hit.health,75);
  send(players[3],{type:'join',code,city:'procedural',playerName:'늦은 참가자'});
  await wait(players[3],v=>v.type==='error');
  console.log('PASS multiplayer: 4-player room, ready gate, teams, server damage, late join rejection');
} finally {for(const ws of sockets)ws.close();await new Promise(resolve=>server.close(resolve));}
