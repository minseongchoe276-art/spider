import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {localGameDb} from './lib/local-game-db.mjs';
import {arenaFrom} from '../src/PursuitRules.js';

const db=await localGameDb();
const results=[];
const check=async(name,run)=>{await run();results.push({name,status:'PASS'});console.log('PASS POSTGRES: '+name);};
try{
  const actors=[];for(let i=0;i<8;i++)actors.push(await db.actor());
  const [host,peer]=actors;
  const room=await host.command('create',{mode:'tag',city:'procedural',capacity:8,enhanced:true});
  const code=room.room.code;
  for(const actor of actors.slice(1))await actor.command('join',{code,city:'procedural'});
  await check('8 authenticated players join, prepare, and start with two police',async()=>{
    for(const actor of actors)await actor.command('ready',{code,ready:true,terrainReady:true,
      spawn:{x:0,y:50,z:0},roofs:[{x:70,y:50,z:0},{x:-70,y:50,z:0}]});
    const started=await host.command('start',{code});
    assert.equal(started.players.length,8);assert.equal(started.players.filter(p=>p.team==='police').length,2);
    assert.equal(started.arena.radius,300);
  });
  const command=async(actor,action,data={})=>actor.command(action,{code,...data});
  const seed=async(actor,position={x:0,y:50,z:0},age=60,budget=20)=>db.admin.query(`
    update public.game_players set x=$2,y=$3,z=$4,facing=0,seen=true,
      last_move_ms=game.now_ms()-$5,move_budget=$6,last_seen=clock_timestamp(),punch_ms=0,web_ms=0 where user_id=$1`,
    [actor.id,position.x,position.y,position.z,age,budget]);
  const move=(actor,x)=>command(actor,'move',{x,y:50,z:0,facing:0});
  await check('One jitter allowance cannot finance repeated 18m teleports',async()=>{
    await seed(host);assert.equal((await move(host,18)).type,'move');
    await db.admin.query('update public.game_players set last_move_ms=game.now_ms()-60 where user_id=$1',[host.id]);
    const correction=await move(host,36);assert.equal(correction.type,'correction');assert.equal(correction.x,18);
    const before=(await db.admin.query('select move_budget,last_move_ms from public.game_players where user_id=$1',[host.id])).rows[0];
    assert.equal((await move(host,1000)).type,'correction');
    const after=(await db.admin.query('select move_budget,last_move_ms from public.game_players where user_id=$1',[host.id])).rows[0];
    assert.deepEqual(after,before,'Rejected moves changed the accepted budget baseline');
  });
  await check('Normal 48m/s and a 500ms delayed move remain accepted',async()=>{
    await seed(host,{x:0,y:50,z:0},500,0);assert.equal((await move(host,24)).type,'move');
    const row=(await db.admin.query('select move_budget from public.game_players where user_id=$1',[host.id])).rows[0];
    assert(row.move_budget>=12&&row.move_budget<=20);
  });
  await check('Private tables/schema and anonymous RPC calls remain inaccessible',async()=>{
    await assert.rejects(()=>peer.client.query('select * from public.game_players'),/permission denied/);
    await assert.rejects(()=>peer.client.query('select * from game.city_solids'),/permission denied/);
    await db.admin.query('set role anon');
    try{await assert.rejects(()=>db.admin.query("select public.game_command('list','{}')"),/permission denied/);}
    finally{await db.admin.query('reset role');}
  });
  await check('A failed transaction rolls back its accepted move and budget',async()=>{
    await seed(host);const before=(await db.admin.query('select x,move_budget from public.game_players where user_id=$1',[host.id])).rows[0];
    await host.client.query('begin');await move(host,8);await host.client.query('rollback');
    const after=(await db.admin.query('select x,move_budget from public.game_players where user_id=$1',[host.id])).rows[0];
    assert.deepEqual(after,before);
  });
  await check('Parallel moves serialize their shared allowance',async()=>{
    await seed(host,{x:0,y:50,z:0},60,0);
    // A second real connection with the same auth identity.
    const client=db.admin.constructor;
    const connection=new client(db.admin.connectionParameters);
    await connection.connect();
    try{
      await connection.query('set role authenticated');
      await connection.query("select set_config('request.jwt.claim.sub',$1,false)",[host.id]);
      await connection.query("set statement_timeout='3s'");await host.client.query("set statement_timeout='3s'");
      const outputs=await Promise.all([move(host,4),connection.query("select public.game_command('move',$1::jsonb) as result",
        [JSON.stringify({code,x:8,y:50,z:0,facing:0})]).then(r=>r.rows[0].result)]);
      const row=(await db.admin.query('select x,move_budget from public.game_players where user_id=$1',[host.id])).rows[0];
      assert(row.x<=4,'Parallel requests each received an independent allowance');assert(row.move_budget>=0);
      assert(outputs.some(result=>result?.type==='correction'||result===null));
    }finally{await connection.end();}
  });
  await check('Continuous rescue restarts after a gap instead of completing from two packets',async()=>{
    const runners=(await db.admin.query("select user_id from public.game_players where room_code=$1 and team='runner' order by user_id",[code])).rows;
    const helper=actors.find(a=>a.id===runners[0].user_id),victim=actors.find(a=>a.id===runners[1].user_id);
    await seed(helper);await seed(victim,{x:0,y:50,z:2});
    await db.admin.query('update public.game_players set eliminated=true,health=0 where user_id=$1',[victim.id]);
    await move(helper,0);
    await db.admin.query('update public.game_players set rescue_since=game.now_ms()-3100,last_move_ms=game.now_ms()-3100 where user_id=$1',[helper.id]);
    await move(helper,0);
    assert.equal((await db.admin.query('select health from public.game_players where user_id=$1',[victim.id])).rows[0].health,0);
    await db.admin.query('update public.game_players set rescue_since=game.now_ms()-3100,last_move_ms=game.now_ms()-100 where user_id=$1',[helper.id]);
    await move(helper,0);
    assert.equal((await db.admin.query('select health from public.game_players where user_id=$1',[victim.id])).rows[0].health,50);
  });
  await check('Opposing attack and movement use real connection locks without deadlock',async()=>{
    const players=(await db.admin.query('select user_id,team from public.game_players where room_code=$1',[code])).rows;
    const cop=actors.find(a=>a.id===players.find(p=>p.team==='police').user_id);
    const runner=actors.find(a=>a.id===players.find(p=>p.team==='runner').user_id);
    await db.admin.query('update public.game_players set seen=false,eliminated=false,health=100 where room_code=$1',[code]);
    await seed(cop);await seed(runner,{x:0,y:50,z:2});
    await db.admin.query('update public.game_rooms set vulnerable_at=0 where code=$1',[code]);
    await Promise.all([command(cop,'attack',{kind:'punch',facing:0}),
      command(runner,'move',{x:0,y:50,z:2,facing:0})]);
    const health=(await db.admin.query('select health from public.game_players where user_id=$1',[runner.id])).rows[0].health;
    assert(health<100);
  });
  await check('Pausing a defender does not grant damage immunity at the last confirmed position',async()=>{
    const players=(await db.admin.query('select user_id,team from public.game_players where room_code=$1',[code])).rows;
    const cop=actors.find(a=>a.id===players.find(p=>p.team==='police').user_id);
    const runner=actors.find(a=>a.id===players.find(p=>p.team==='runner').user_id);
    await db.admin.query('update public.game_players set seen=false,eliminated=false,health=100 where room_code=$1',[code]);
    await seed(cop);await seed(runner,{x:0,y:50,z:2},5000);
    const hit=await command(cop,'attack',{kind:'punch',facing:0});
    assert.equal(hit.type,'hit');assert.equal(hit.health,75);
  });
  await check('SQL and JavaScript arena validation reject duplicate/nearby targets consistently',async()=>{
    const origin={x:0,y:50,z:0},roofs=[{x:70,y:50,z:0},{x:70,y:50,z:0},{x:72,y:50,z:1},{x:-70,y:50,z:0}];
    const sql=(await db.admin.query('select game.arena_points(0,50,0,300,$1::jsonb) as points',[JSON.stringify(roofs)])).rows[0].points;
    assert.deepEqual(sql,arenaFrom(origin,'procedural',roofs).points);assert.equal(sql.length,2);
    assert.equal(arenaFrom(origin,'procedural',roofs.slice(0,3)),null);
  });
  for(const actor of actors)await command(actor,'leave');
  for(let count=2;count<=7;count++)await check(`${count}-player SQL match uses the correct duration and police count`,async()=>{
    const group=actors.slice(0,count);
    const created=await host.command('create',{mode:'tag',city:'procedural',capacity:count,enhanced:true});
    const roomCode=created.room.code;
    for(const actor of group.slice(1))await actor.command('join',{code:roomCode,city:'procedural'});
    for(const actor of group)await actor.command('ready',{code:roomCode,ready:true,terrainReady:true,
      spawn:{x:0,y:50,z:0},roofs:[{x:70,y:50,z:0},{x:-70,y:50,z:0}]});
    const started=await host.command('start',{code:roomCode});
    assert.equal(started.players.filter(p=>p.team==='police').length,count>=7?2:1);
    assert(Math.abs(started.endsAt-started.serverNow-(count<=2?180000:count<=6?240000:300000))<1000);
    for(const actor of group)await actor.command('leave',{code:roomCode});
  });
  await fs.mkdir('docs/qa/acceptance-2026-10-13',{recursive:true});
  await fs.writeFile('docs/qa/acceptance-2026-10-13/postgres-results.json',JSON.stringify({
    engine:(await db.admin.query('select version()')).rows[0].version,migrations:db.applied,
    command_md5:(await db.admin.query("select md5(prosrc) as value from pg_proc where oid='public.game_command(text,jsonb)'::regprocedure")).rows[0].value,
    resolver_md5:(await db.admin.query("select md5(prosrc) as value from pg_proc where oid='public.game_resolve_terrain_hit(uuid,text,text)'::regprocedure")).rows[0].value,
    scope:'Real PostgreSQL roles, transactions and multiple connections; Auth identity and Realtime network delivery are local substitutes.',results},null,2)+'\n');
}finally{await db.close();}
