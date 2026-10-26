import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from './rooms.mjs';
import {MATCH} from '../src/MatchRules.js';
import {guardedDamage} from '../src/AttackRules.js';
const folder=process.env.ONLINE_QA_DIR||'docs/qa/eight-player-2026-10-21';fs.mkdirSync(folder,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms)),peers=[],results=[];
let visibility=()=>Promise.resolve({status:'CLEAR',version:'test'});
const server=createServer(),api=attachRooms(server,{terrain:{visibility:(...args)=>visibility(...args)}});
const old=[MATCH.graceMs,MATCH.punch.cooldown,MATCH.web.cooldown];MATCH.graceMs=MATCH.punch.cooldown=MATCH.web.cooldown=0;
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const send=(ws,p)=>ws.send(JSON.stringify(p));
async function event(ws,fn){for(let i=0;i<500;i++){const index=ws.events.findIndex(fn);if(index>=0)return ws.events.splice(index,1)[0];await wait(4);}throw Error('Expected room event missing');}
const pose=(guard=false,{air=false,combat=true,state}={})=>({state:state||(air?'JUMPING':'IDLE'),velocity:{x:0,y:0,z:0},combatStance:combat,combat:guard?{key:'guard'}:null});
let ids,room;
async function setup(mode='custom',format='teams'){
 for(const p of peers)send(p,{type:'leave'});await wait(70);for(const p of peers)p.events=[];
 send(peers[0],{type:'create',mode,format,capacity:8,city:'hong-kong',name:'Isolated eight-client guard QA'});
 const host=await event(peers[0],e=>e.type==='joined');ids=[host.id];
 for(const p of peers.slice(1)){send(p,{type:'join',city:'hong-kong',code:host.code});ids.push((await event(p,e=>e.type==='joined')).id);}
 room=api.rooms.get(host.code);
 for(const p of peers)send(p,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:200,z:0}});
 await event(peers[0],e=>e.type==='room'&&e.players.length===8&&e.players.every(p=>p.ready));send(peers[0],{type:'start'});await event(peers[0],e=>e.type==='room'&&e.room.phase==='playing');
 for(let i=0;i<8;i++)await move(i,false,{z:i*.2});
}
async function move(i,guard=false,options={}){
 await wait(45);send(peers[i],{type:'move',x:0,y:200,z:options.z??.8,facing:options.facing??(i?Math.PI:0),pose:pose(guard,options)});
 await event(peers[0],e=>e.type==='move'&&e.id===ids[i]);
}
async function hit(i,j,kind,expected,extra={}){
 for(const p of peers)p.events=p.events.filter(e=>e.type!=='hit'&&e.type!=='attack-result');
 send(peers[i],{type:'attack',kind,facing:0,targetId:ids[j],...extra});
 const observed=await Promise.all(peers.map(p=>event(p,e=>e.type==='hit'&&e.attacker===ids[i]&&e.target===ids[j])));
 for(const h of observed){assert.equal(h.damage,expected);assert.deepEqual(h,observed[0]);}return observed[0];
}
try{
 for(let i=0;i<8;i++){
  const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);ws.events=[];ws.on('message',raw=>ws.events.push(JSON.parse(raw)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});peers.push(ws);
 }
 await setup();
 for(const [name,guard,options,expected] of [
  ['unguarded',false,{},[25,15]],['front guard',true,{},[10,6]],
  ['rear guard',true,{facing:0},[25,15]],['air guard rejected',true,{air:true},[25,15]],
  ['roll cannot claim invisible guard',true,{state:'ROLLING'},[25,15]],['turn cannot claim invisible guard',true,{state:'TURNING'},[25,15]],
  ['custom wire pose cannot claim guard',true,{combat:false},[25,15]],
 ]){
  for(const [index,kind] of ['punch','web'].entries()){
   room.players.get(ids[1]).health=100;await move(0,false,{z:0,facing:0,combat:false});await move(1,guard,options);
   const h=await hit(0,1,kind,expected[index]);assert.equal(h.health,100-expected[index]);assert.equal(h.blocked,expected[index]!==MATCH[kind].damage);
  }results.push({name,pass:true,damage:expected,observers:8});
 }
 room.players.get(ids[1]).health=100;await move(1,true);await wait(MATCH.guard.freshnessMs+30);await move(0,false,{z:0,combat:false});await hit(0,1,'punch',25);results.push({name:'Paused/stale guard expires',pass:true});
 await move(0,true,{z:0,facing:0});send(peers[0],{type:'attack',kind:'punch',facing:0,targetId:ids[1]});assert.equal((await event(peers[0],e=>e.type==='attack-result')).reason,'guarding');
 await move(0,false,{z:0,combat:true});send(peers[0],{type:'attack',kind:'web',facing:0,targetId:ids[1]});assert.equal((await event(peers[0],e=>e.type==='attack-result')).reason,'mode');
 room.players.get(ids[1]).health=100;await move(1,false);await hit(0,1,'web',15,{pose:pose(false,{combat:false})});
 results.push({name:'No attack while guarding; no human wire; immediate Q mode change uses fresh attack pose',pass:true});
 // Direction and exact height/range boundaries are independent from guard facing.
 for(const angle of [-Math.PI/3,Math.PI/3]){
  const p={x:0,y:0,z:0,facing:angle,lastMove:1000,pose:pose(true)};
  assert.equal(guardedDamage({x:0,y:0,z:1},p,'punch',1000).damage,10);
 }results.push({name:'Both 60 degree guard boundaries included',pass:true});
 // Visibility work may finish later; guard belongs to the accepted attack time.
 room.players.get(ids[1]).health=100;await move(0,false,{z:0,combat:false});await move(1,true);
 let release;visibility=()=>new Promise(r=>{release=r;});send(peers[0],{type:'attack',kind:'punch',facing:0,targetId:ids[1]});
 for(let i=0;i<100&&!release;i++)await wait(3);assert(release);await move(1,false);release({status:'CLEAR',version:'test'});
 for(const p of peers)assert.equal((await event(p,e=>e.type==='hit'&&e.target===ids[1])).damage,10);
 visibility=()=>Promise.resolve({status:'CLEAR',version:'test'});results.push({name:'Async terrain check preserves attack-time guard snapshot',pass:true});
 await setup('tag');const cop=[...room.players.values()].find(p=>p.team==='police'),runner=[...room.players.values()].find(p=>p.team==='runner');const i=ids.indexOf(cop.id),j=ids.indexOf(runner.id);
 await move(i,false,{z:0,facing:0,combat:false});await move(j,true,{combat:false,facing:Math.PI});assert.equal((await hit(i,j,'punch',10)).health,90);
 send(peers[j],{type:'attack',kind:'punch',facing:Math.PI,targetId:cop.id});await wait(60);assert.equal(cop.health,100);
 results.push({name:'Cops/runners: wire-mode runner can defend but cannot attack',pass:true,police:2,runners:6});
 const output={passed:results.length,total:results.length,clients:8,results};fs.writeFileSync(folder+'/online-guard.json',JSON.stringify(output,null,2)+'\n');console.log('PASS',results.length,'guard/rule cases; eight clients observe identical actual damage and HP');
}finally{[MATCH.graceMs,MATCH.punch.cooldown,MATCH.web.cooldown]=old;for(const p of peers)p.terminate();await new Promise(r=>server.close(r));}
