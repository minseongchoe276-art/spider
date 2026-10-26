// Authenticated gameplay through a fresh local server. The terrain fixture is
// supplied by the server publisher, never by the attacker or defender payload.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import * as THREE from 'three';
import {attachRooms} from './rooms.mjs';
import {MATCH} from '../src/MatchRules.js';
import {TrustedTerrain} from './lib/trusted-terrain.mjs';
const wall=new THREE.Mesh(new THREE.BoxGeometry(8,10,.1),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));wall.position.set(0,51,1);
const oracle=new TrustedTerrain([wall],{complete:true,radius:450,version:'fixture-v1'});
const server=createServer(),api=attachRooms(server,{terrain:oracle}),sockets=[];
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),send=(ws,data)=>ws.send(JSON.stringify(data));
async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);ws.events=[];sockets.push(ws);ws.on('message',raw=>ws.events.push(JSON.parse(raw)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return ws;}
async function wait(ws,predicate){const end=Date.now()+2500;while(Date.now()<end){const i=ws.events.findIndex(predicate);if(i>=0)return ws.events.splice(i,1)[0];await sleep(10);}throw Error('Expected server event absent');}
try{
 MATCH.graceMs=0;const a=await connect(),b=await connect();send(a,{type:'create',mode:'tag',city:'hong-kong',capacity:2,enhanced:true});const ja=await wait(a,e=>e.type==='joined');send(b,{type:'join',code:ja.code,city:'hong-kong'});const jb=await wait(b,e=>e.type==='joined');
 send(a,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:50,z:0},roofs:[{x:70,y:50,z:0},{x:-70,y:50,z:0}]});send(b,{type:'ready',ready:true,terrainReady:true});await wait(a,e=>e.type==='room'&&e.players.every(p=>p.ready));send(a,{type:'start'});const started=await wait(a,e=>e.type==='room'&&e.room.phase==='playing');const byId=new Map([[ja.id,a],[jb.id,b]]),room=api.rooms.get(ja.code),police=room.players.get(started.players.find(p=>p.team==='police').id),runner=room.players.get(started.players.find(p=>p.team==='runner').id),cop=byId.get(police.id),victim=byId.get(runner.id);
 const attack=async()=>{send(cop,{type:'move',x:0,y:50,z:0,facing:0});send(victim,{type:'move',x:0,y:50,z:2,facing:0});await sleep(60);send(cop,{type:'attack',kind:'punch',facing:0});};
 await attack();send(victim,{type:'hit-confirm',hitId:'forged',clear:true});await sleep(180);assert.equal(runner.health,100,'Client forced a through-wall hit');assert(!victim.events.some(e=>e.type==='hit-check'));
 oracle.meshes=[];await sleep(600);await attack();send(victim,{type:'hit-confirm',hitId:'forged',clear:false});const hit=await wait(victim,e=>e.type==='hit');assert.equal(hit.health,75,'Defender suppressed the independent hit');
 oracle.complete=false;await sleep(600);await attack();await sleep(160);assert.equal(runner.health,75,'Missing coverage became damage');
 console.log(JSON.stringify({status:'PASS',id:'SEC-01',scope:'Independent Node server with an explicitly isolated trusted wall fixture; official map and operating Edge/DB tests are separate',wallHitHealth:100,clearHitHealth:hit.health,unknownTerrainHealth:runner.health,defenderClaimsIgnored:true},null,2));
}finally{for(const ws of sockets)ws.terminate();await new Promise(r=>server.close(r));wall.geometry.dispose();wall.material.dispose();}
