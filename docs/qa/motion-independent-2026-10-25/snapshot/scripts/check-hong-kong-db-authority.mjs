import assert from 'node:assert/strict';
import {localGameDb} from './lib/local-game-db.mjs';
const db=await localGameDb();const results=[];
const check=async(name,run)=>{await run();results.push({name,status:'PASS'});};
const proof='a'.repeat(64);
try{
 const actors=[];for(let i=0;i<3;i++)actors.push(await db.actor());
 const created=await actors[0].command('create',{mode:'tag',city:'hong-kong',capacity:3,enhanced:true}),code=created.room.code;
 for(const a of actors.slice(1))await a.command('join',{code,city:'hong-kong'});
 for(const a of actors)await a.command('ready',{code,ready:true,terrainReady:true,spawn:{x:0,y:18,z:0},roofs:[{x:70,y:18,z:0},{x:-70,y:18,z:0}]});
 const started=await actors[0].command('start',{code});const police=actors.find(a=>a.id===started.players.find(p=>p.team==='police').id),runner=actors.find(a=>a.id===started.players.find(p=>p.team==='runner').id);
 const seed=async()=>{await db.admin.query('update public.game_rooms set vulnerable_at=0 where code=$1',[code]);await db.admin.query('update public.game_players set x=0,y=18,z=case when user_id=$1 then 0 when user_id=$2 then 2 else 50 end,seen=true,health=100,eliminated=false,punch_ms=0,last_move_ms=game.now_ms(),last_seen=clock_timestamp() where room_code=$3',[police.id,runner.id,code]);};
 const attack=()=>police.command('attack',{code,kind:'punch',facing:0});
 const health=async()=>(await db.admin.query('select health from public.game_players where user_id=$1',[runner.id])).rows[0].health;
 const resolve=async(id,status='CLEAR',version=proof)=>(await db.admin.query('select public.game_resolve_terrain_hit($1,$2,$3) as result',[id,status,version])).rows[0].result;
 await check('Client claims cannot finalize or delete a pending hit',async()=>{await seed();const p=await attack();assert.equal(p.type,'terrain-check');assert.deepEqual(p.from,{x:0,y:18,z:0});assert.deepEqual(p.to,{x:0,y:18,z:2});await runner.command('hit-confirm',{code,hitId:p.hitId,clear:false});await runner.command('hit-confirm',{code,hitId:p.hitId,clear:true});assert.equal(await health(),100);await assert.rejects(()=>runner.client.query('select public.game_resolve_terrain_hit($1,$2,$3)',[p.hitId,'CLEAR',proof]),/permission denied/);const result=await resolve(p.hitId);assert.equal(result.health,75);assert.equal(await health(),75);assert.equal(await resolve(p.hitId),null);});
 for(const status of ['BLOCKED','UNKNOWN'])await check(status+' terrain decisions never cause damage',async()=>{await seed();const p=await attack();await resolve(p.hitId,status);assert.equal(await health(),100);assert.equal(await resolve(p.hitId),null);});
 await check('Missing terrain provenance never causes damage',async()=>{await seed();const p=await attack();await resolve(p.hitId,'CLEAR',null);assert.equal(await health(),100);});
 await check('Expired requests cannot hit',async()=>{await seed();const p=await attack();await db.admin.query('update game.hit_checks set expires=0 where id=$1',[p.hitId]);assert.equal(await resolve(p.hitId),null);assert.equal(await health(),100);});
 await check('A revived life cannot inherit a delayed hit',async()=>{await seed();const p=await attack();await db.admin.query('update public.game_players set life_epoch=life_epoch+1 where user_id=$1',[runner.id]);assert.equal(await resolve(p.hitId),null);assert.equal(await health(),100);});
 await check('A subsequent round cannot inherit a delayed hit',async()=>{await seed();const p=await attack();await db.admin.query('update public.game_rooms set round=round+1 where code=$1',[code]);assert.equal(await resolve(p.hitId),null);assert.equal(await health(),100);});
 await check('Parallel damage resolution is applied exactly once',async()=>{await seed();const p=await attack();const workers=await Promise.all([db.worker(),db.worker()]);const r=await Promise.all(workers.map(c=>c.query('select public.game_resolve_terrain_hit($1,$2,$3) as result',[p.hitId,'CLEAR',proof])));assert.equal(r.filter(x=>x.rows[0].result?.type==='hit').length,1);assert.equal(await health(),75);});
 await check('Service role can execute resolver but authenticated clients cannot',async()=>{const grants=(await db.admin.query("select has_function_privilege('service_role','public.game_resolve_terrain_hit(uuid,text,text)','EXECUTE') as worker,has_function_privilege('authenticated','public.game_resolve_terrain_hit(uuid,text,text)','EXECUTE') as player,has_function_privilege('anon','public.game_resolve_terrain_hit(uuid,text,text)','EXECUTE') as anon")).rows[0];assert.deepEqual(grants,{worker:true,player:false,anon:false});});
 console.log(JSON.stringify({status:'PASS',results,scope:'Real PostgreSQL rows, role restrictions, room locks, claim consumption, replay and life/round checks; auth identity and realtime network are local substitutes'},null,2));
}finally{await db.close();}
