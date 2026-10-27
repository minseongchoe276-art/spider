import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from './rooms.mjs';
import {MATCH} from '../src/MatchRules.js';
import {UPPERCUT} from '../src/DashingUppercut.js';
const server=createServer(),api=attachRooms(server,{terrain:{visibility:async()=>({status:'CLEAR',version:'qa'})}}),peers=[],old=MATCH.graceMs,results=[];MATCH.graceMs=0;
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const send=(ws,data)=>ws.send(JSON.stringify(data));
async function event(ws,fn){const until=Date.now()+3000;while(Date.now()<until){const i=ws.events.findIndex(fn);if(i>=0)return ws.events.splice(i,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error('Expected server event missing');}
const pose=(combat={key:'special',time:.48,duration:UPPERCUT.duration},state='IDLE')=>({state,velocity:{x:0,y:0,z:0},combatStance:true,combat});
try{
 for(let i=0;i<2;i++){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);ws.events=[];ws.on('message',raw=>ws.events.push(JSON.parse(raw)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});peers.push(ws);}
 send(peers[0],{type:'create',mode:'custom',format:'ffa',capacity:2,city:'hong-kong',name:'Uppercut isolated QA'});const host=await event(peers[0],e=>e.type==='joined');
 send(peers[1],{type:'join',city:'hong-kong',code:host.code});const guest=await event(peers[1],e=>e.type==='joined');
 const room=api.rooms.get(host.code),a=room.players.get(host.id),b=room.players.get(guest.id);
 for(const p of peers)send(p,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:200,z:0}});
 await event(peers[0],e=>e.type==='room'&&e.players?.length===2&&e.players.every(p=>p.ready));send(peers[0],{type:'start'});await event(peers[0],e=>e.type==='room'&&e.room.phase==='playing');room.vulnerableAt=0;
 async function check(name,{blocked=false,facing=Math.PI,time=.48,state='IDLE',distance=1.5,cooldown=false,variant='uppercut',expected=48,reason=null}={}){
  const now=Date.now();Object.assign(a,{seen:true,x:0,y:200,z:0,facing:0,lastMove:now,pose:pose(),cooldowns:{punch:0,web:0},lastUppercutAt:cooldown?now:0});Object.assign(b,{seen:true,x:0,y:200,z:distance,facing,lastMove:now,health:100,eliminated:false,pose:pose(blocked?{key:'guard'}:null)});
  for(const p of peers)p.events=[];
  send(peers[0],{type:'attack',kind:'punch',variant,targetId:guest.id,facing:0,pose:pose(variant?{key:'special',time,duration:UPPERCUT.duration}:null,state)});
  const response=await event(peers[0],e=>e.type===(reason?'attack-result':'hit'));
  if(reason){assert.equal(response.reason,reason,name);assert.equal(b.health,100);}else{assert.equal(response.damage,expected,name);assert.equal(response.blocked,blocked&&facing!==0);assert.equal(response.variant,variant||undefined);assert.equal(b.health,100-expected);}
  results.push({name,...response});
 }
 await check('uppercut server damage and variant');await check('front guard reduces uppercut',{blocked:true,expected:20});await check('rear guard does not block',{blocked:true,facing:0});await check('ordinary punch unchanged',{variant:null,expected:25});
 await check('early contact rejected',{time:.1,reason:'invalid'});await check('airborne uppercut rejected',{state:'FALLING',reason:'recovering'});await check('8 second server cooldown',{cooldown:true,reason:'cooldown'});await check('special reach is limited to 2m',{distance:2.3,reason:'range'});await check('unknown variant rejected',{variant:'invented',reason:'invalid'});
 fs.mkdirSync('docs/qa/dashing-uppercut-2026-10-27',{recursive:true});fs.writeFileSync('docs/qa/dashing-uppercut-2026-10-27/online.json',JSON.stringify(results,null,2)+'\n');console.log('PASS 9 WebSocket uppercut server cases: damage, guard, phase, airborne, cooldown, reach, invalid variant, ordinary punch regression');
}finally{MATCH.graceMs=old;for(const p of peers)p.terminate();await new Promise(r=>server.close(r));}
