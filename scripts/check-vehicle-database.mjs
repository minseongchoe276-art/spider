import assert from 'node:assert/strict';import fs from 'node:fs';import {localGameDb} from './lib/local-game-db.mjs';
const db=await localGameDb();
const snapshot=(sequence,phase='PARKED',model='bmw',position={x:0,y:.02,z:7})=>({sequence,phase,model,position,yaw:0,pitch:0,roll:0,speed:0,steering:0,spin:0,elapsed:0,start:{x:1.65,y:.1,z:7.15},startYaw:0,exit:{x:1.65,y:.1,z:7.15}});
try{
 const a=await db.actor(),b=await db.actor(),room=await a.command('create',{mode:'free',city:'procedural',capacity:2});await b.command('join',{code:room.room.code,city:'procedural'});for(const p of [a,b])await p.command('ready',{ready:true});await a.command('start');
 const move=async(actor,v,p={x:0,y:.1,z:0})=>{await db.admin.query('update public.game_players set last_move_ms=game.now_ms()-100,vehicle_at=game.now_ms()-100 where user_id=$1',[actor.id]);return (await actor.client.query('select public.game_move_pose($1::jsonb) as result',[JSON.stringify({...p,facing:0,pose:{state:['ENTERING','DRIVING','EXITING'].includes(v?.phase)?'DRIVING':'IDLE',velocity:{x:0,y:0,z:0},vehicle:v}})])).rows[0].result;};
 assert.equal((await move(a,snapshot(1))).type,'move');assert.equal((await move(b,snapshot(1,'PARKED','corvette',{x:8,y:.02,z:7}))).type,'move');
 let state=await a.command('heartbeat');assert.equal(state.players.find(p=>p.id===a.id).vehicle.model,'bmw');assert.equal(state.players.find(p=>p.id===b.id).vehicle.model,'corvette');
 assert.equal((await move(a,snapshot(1))).type,'correction','Stale packet accepted');assert.equal((await move(a,{...snapshot(2),model:'forged'})).type,'correction');assert.equal((await move(a,{})).type,'correction');assert.equal((await move(a,{phase:'NONE'})).type,'correction');assert.equal((await move(a,{...snapshot(2),speed:100})).type,'correction');
 assert.equal((await move(a,snapshot(2,'PARKED','bmw',{x:8,y:.02,z:7}))).type,'correction','Cars overlapped');
 assert.equal((await move(a,snapshot(2,'PARKED','bmw',{x:20,y:.02,z:20}))).type,'correction','Car spawned inside building');
 await db.admin.query('update public.game_players set x=1.65,y=.1,z=7.15 where user_id=$1',[a.id]);
 assert.equal((await move(a,{...snapshot(2,'ENTERING'),elapsed:.1},{x:0,y:.12,z:7})).type,'move');
 assert.equal((await move(a,snapshot(3,'DRIVING'),{x:0,y:.12,z:7})).type,'move');
 assert.equal((await move(a,{...snapshot(4,'DRIVING'),position:{x:0,y:.02,z:35}},{x:0,y:.12,z:35})).type,'correction','Vehicle teleported');
 assert.equal((await move(a,snapshot(4,'DRIVING','corvette'),{x:0,y:.12,z:7})).type,'correction','Model changed while driving');
 assert.equal((await move(a,{phase:'NONE',sequence:4},{x:0,y:.12,z:7})).type,'correction','Driver skipped exit');
 assert.equal((await move(a,snapshot(4,'EXITING'),{x:0,y:.12,z:7})).type,'move');assert.equal((await move(a,snapshot(5),{x:1.65,y:.1,z:7.15})).type,'move');
 const broadcasts=(await db.admin.query("select payload from qa.broadcasts where event='pose' order by ctid")).rows;assert(broadcasts.some(row=>row.payload.id===a.id&&row.payload.pose.vehicle.phase==='ENTERING'));assert(broadcasts.some(row=>row.payload.id===a.id&&row.payload.pose.vehicle.phase==='EXITING'));
 await db.admin.query('update public.game_players set life_epoch=life_epoch+1 where user_id=$1',[a.id]);state=await a.command('heartbeat');assert.equal(state.players.find(p=>p.id===a.id).vehicle,null,'Previous life restored a car');
 await assert.rejects(a.client.query('update public.game_players set vehicle_state=\'{}\''));await db.admin.query('set role anon');await assert.rejects(db.admin.query("select public.game_move_pose('{}')"));await db.admin.query('reset role');
 fs.mkdirSync('docs/qa/online-vehicles-2026-10-28',{recursive:true});fs.writeFileSync('docs/qa/online-vehicles-2026-10-28/database.json',JSON.stringify({status:'PASS',checks:['two model snapshots','persistent reconnect state','sequence/schema/speed rejection','car-car overlap','whole-body building obstruction','enter/drive/exit broadcasts','no model swaps or skipped exits','life reset','RLS and anon denial']},null,2)+'\n');console.log('PASS real PostgreSQL online vehicles: persistence, broadcasts, collisions, forged packets, transitions and privileges');
}finally{await db.close();}
