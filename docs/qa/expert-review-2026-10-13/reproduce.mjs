import { createServer } from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/$/,'');
const req=createRequire(root+'/package.json');const {default:WebSocket}=await import(req.resolve('ws'));const THREE=await import(req.resolve('three'));
const {attachRooms}=await import(root+'/scripts/rooms.mjs');
const {StuntSystem}=await import(root+'/src/StuntSystem.js');const {CombatSystem}=await import(root+'/src/Combat.js');const {Multiplayer}=await import(root+'/src/Multiplayer.js');
const {TimeTrialSystem}=await import(root+'/src/TimeTrial.js');const {arenaFrom}=await import(root+'/src/PursuitRules.js');
const out=[];const record=(name,evidence)=>out.push({name,evidence});
const scene=new THREE.Scene();const physics={state:'IDLE',position:new THREE.Vector3(),velocity:new THREE.Vector3(),facingAngle:0,city:{},clearPendingInput(){},clearWebAnchor(){}};
const combat=new CombatSystem(scene,physics,{group:new THREE.Group()});const mp=Object.create(Multiplayer.prototype);
mp.id='cop';mp.players=[{id:'cop',team:'police'}];mp.room={phase:'playing'};mp.game={combat,physics,isPlaying:true,isPaused:false};mp.sendAttack=()=>{mp.sent=(mp.sent||0)+1};mp.renderHud=()=>{};mp.avatars=new Map();mp.lastSend=performance.now()+1e6;mp.lastPing=performance.now();mp.lastHud=performance.now();
combat.attack();mp.attack('punch');combat.action.time=.15;mp.update(0);combat.action.time=.44;combat.action.previous=.43;
combat.attack();combat.before(.1);combat.before(.03);const newAction=combat.action;combat.before(.1);combat.before(.1);mp.update(0);
record('Queued punch has no multiplayer attack registration',{newAction:newAction?.key,actionId:combat.action?.id,packetsSent:mp.sent,pendingPunch:mp.pendingPunch});
const stunts=new StuntSystem();for(let i=0;i<7;i++)stunts.add('action'+i,100);record('Actual stunt multiplier differs from README',{multiplier:stunts.multiplier,documented:2.5});
const trial=new TimeTrialSystem(scene,{},{playCheckpointChime(){}});trial.isActive=true;trial.checkpoints=[{position:new THREE.Vector3(),normal:new THREE.Vector3(1,0,0),radius:3.2,mesh:new THREE.Object3D()}];trial.previousPosition=new THREE.Vector3(-1,0,0);trial.elapsedTime=10;
const finish=trial.update(new THREE.Vector3(3,0,0),.1);record('Finish time ignores final plane crossing fraction',{finish:finish.totalTime,split:trial.splitTimes[0]});
record('Duplicate escape destinations accepted',arenaFrom({x:0,y:200,z:0},'procedural',[{x:70,y:200,z:0},{x:70,y:200,z:0}]));
const server=createServer();const api=attachRooms(server);const sockets=[];await new Promise(r=>server.listen(0,'127.0.0.1',r));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(){const w=new WebSocket('ws://127.0.0.1:'+server.address().port+'/ws');w.events=[];w.on('message',raw=>w.events.push(JSON.parse(raw)));sockets.push(w);await new Promise(r=>w.once('open',r));return w;}
const send=(w,d)=>w.send(JSON.stringify(d));
try{
 const a=await connect(),b=await connect(),c=await connect();send(a,{type:'create',capacity:3,city:'procedural',mode:'tag',enhanced:true});await sleep(40);const room=[...api.rooms.values()][0];
 for(const w of [b,c])send(w,{type:'join',code:room.code,city:'procedural'});await sleep(40);
 send(a,{type:'ready',ready:true,terrainReady:true,spawn:{x:0,y:200,z:0},roofs:[{x:70,y:200,z:0},{x:-70,y:200,z:0}]});for(const w of [b,c])send(w,{type:'ready',ready:true,terrainReady:true});await sleep(40);send(a,{type:'start'});await sleep(40);room.vulnerableAt=0;
 const cop=[...room.players.values()].find(p=>p.team==='police'),runners=[...room.players.values()].filter(p=>p.team==='runner'),runner=runners[0],ally=runners[1];const sw=p=>sockets.find(w=>w.events.some(e=>e.type==='joined'&&e.id===p.id));
 send(sw(cop),{type:'move',x:0,y:200,z:0,facing:0});send(sw(runner),{type:'move',x:0,y:200,z:2,facing:0});await sleep(60);
 runner.lastMove=Date.now()-1600;send(sw(cop),{type:'attack',kind:'punch',facing:0});await sleep(40);record('Paused target becomes immune after stale movement',{health:runner.health,lastMoveAge:Date.now()-runner.lastMove});
 runner.eliminated=true;runner.health=0;send(sw(ally),{type:'move',x:0,y:200,z:3,facing:0});await sleep(60);const began=ally.rescue?.since;
 await sleep(3100);send(sw(ally),{type:'move',x:0,y:200,z:3,facing:0});await sleep(40);record('Rescue completes despite a 3s gap with no movement heartbeat',{began:!!began,health:runner.health,eliminated:runner.eliminated});
}finally{for(const w of sockets)w.terminate();await new Promise(r=>server.close(r));}
console.log(JSON.stringify(out,null,2));
