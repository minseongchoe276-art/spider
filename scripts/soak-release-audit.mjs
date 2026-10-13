import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import * as THREE from 'three';
import {attachRooms} from './rooms.mjs';
import {SwingPhysics} from '../src/SwingPhysics.js';

const duration=Number(process.argv[2]||1800000),started=Date.now();
const server=createServer(),api=attachRooms(server),sockets=[],samples=[];
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let movesReceived=0,rounds=0,steps=0,reconnects=0,maxRooms=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(ws,data)=>ws.send(JSON.stringify(data));
async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);sockets.push(ws);ws.events=[];
  ws.on('message',raw=>{const event=JSON.parse(raw);if(event.type==='move'){movesReceived++;return;}ws.events.push(event);if(ws.events.length>100)ws.events.shift();});
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return ws;}
async function wait(ws,predicate){const end=Date.now()+3000;while(Date.now()<end){const i=ws.events.findIndex(predicate);if(i>=0)return ws.events.splice(i,1)[0];await sleep(10);}throw new Error('Soak event timeout');}
const silent=new Proxy({},{get:()=>()=>{}}),camera=new THREE.PerspectiveCamera();
const p=new SwingPhysics(new THREE.Scene(),{buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false}),getRooftopSpawn:()=>new THREE.Vector3(-12,44,0)},
  {group:new THREE.Group(),update(){},fireWeb(){},stopAnimation(){}},silent);
p.findBestAnchor=()=>new THREE.Vector3(0,60,0);
function resetPhysics(){p.clearWebAnchor();p.position.set(-12,44,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.velocity.set(0,0,0);p.state='FALLING';p.startSwing(camera);}
let players=await Promise.all(Array.from({length:8},connect)),room;
async function newRound(){
  if(room){for(const ws of players)send(ws,{type:'leave'});await wait(players[0],e=>e.type==='left');await sleep(30);assert.equal(api.rooms.size,0,'Room leaked after last player left');}
  for(const ws of players)ws.events=[];
  send(players[0],{type:'create',mode:'free',capacity:8,city:'procedural'});
  const joined=await wait(players[0],e=>e.type==='joined');room=api.rooms.get(joined.code);
  for(const ws of players.slice(1))send(ws,{type:'join',code:room.code,city:'procedural'});
  await wait(players[0],e=>e.type==='room'&&e.room.count===8);
  for(const ws of players)send(ws,{type:'ready',ready:true});
  await wait(players[0],e=>e.type==='room'&&e.players.every(p=>p.ready));send(players[0],{type:'start'});
  await wait(players[0],e=>e.type==='room'&&e.room.phase==='playing');rounds++;resetPhysics();
}
try{
  await newRound();let nextRound=Date.now()+60000,nextSample=Date.now()+60000,lastMove=0;
  while(Date.now()-started<duration){
    const now=Date.now(),tick=performance.now();
    if(now>=nextRound){
      // Recreate one disconnected peer before the next full room cycle.
      players[7].terminate();await sleep(30);players[7]=await connect();reconnects++;
      await newRound();nextRound=now+60000;
    }
    const seconds=(now-started)/1000;
    if(seconds%15<.04)resetPhysics();
    const input={webHold:true,webFireHeld:true,forward:false,strafe:0};
    for(let i=0;i<3;i++){p.update(1/120,input,camera);steps++;assert(p.position.toArray().every(Number.isFinite));assert(p.velocity.toArray().every(Number.isFinite));if(p.isSwinging)assert(p.position.distanceTo(p.anchorPoint)<=p.ropeLength+1e-5);}
    if(now-lastMove>=50){lastMove=now;for(const [i,ws]of players.entries())send(ws,{type:'move',x:Math.sin(seconds*.2+i)*10,y:200,z:Math.cos(seconds*.2+i)*10,facing:seconds*.2+i});}
    maxRooms=Math.max(maxRooms,api.rooms.size);
    if(now>=nextSample){const memory=process.memoryUsage(),sample={elapsedSeconds:+((now-started)/1000).toFixed(1),rooms:api.rooms.size,clients:api.wss.clients.size,rounds,reconnects,steps,movesReceived,heapMB:+(memory.heapUsed/1048576).toFixed(2),rssMB:+(memory.rss/1048576).toFixed(2),lastTickMs:+(performance.now()-tick).toFixed(3)};samples.push(sample);console.log(JSON.stringify(sample));nextSample=now+60000;}
    await sleep(25);
  }
  assert(movesReceived>1000);assert.equal(api.rooms.size,1);assert.equal(api.wss.clients.size,8);
  for(const ws of players)send(ws,{type:'leave'});await sleep(100);assert.equal(api.rooms.size,0);
  console.log(JSON.stringify({status:'PASS',scope:'30-minute real-time Node physics + 8 WebSocket clients; not 8 human players or browser/GPU soak',elapsedSeconds:(Date.now()-started)/1000,rounds,reconnects,steps,movesReceived,maxRooms,samples},null,2));
}finally{for(const ws of sockets)ws.terminate();await new Promise(r=>server.close(r));}
