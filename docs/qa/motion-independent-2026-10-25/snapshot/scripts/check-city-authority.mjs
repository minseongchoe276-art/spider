import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from './rooms.mjs';
import {localGameDb} from './lib/local-game-db.mjs';
import {proceduralCollision} from './city-collision.mjs';

const root='docs/qa/full-game-audit-2026-10-14';
const city=proceduralCollision(),migration='20261013235542_compact_city_authority.sql';
const expected=city.colliders.map(c=>[c.minX,c.minY,c.minZ,c.maxX,c.maxY,c.maxZ]);
const db=await localGameDb({migrations:false});
try{
  for(const name of (await fs.readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')&&n!==migration).sort())await db.admin.query(await fs.readFile(`supabase/migrations/${name}`,'utf8'));
  const prior=(await db.admin.query('select bounds from game.city_solids order by id')).rows.map(r=>r.bounds);
  assert.notDeepEqual(prior,expected,'Missing reproduction: old SQL already matches the compact map');
  await fs.mkdir(root,{recursive:true});await fs.writeFile(`${root}/authority-before.json`,JSON.stringify({expectedSolids:expected.length,previousSqlSolids:prior.length,matches:false},null,2)+'\n');
  await db.admin.query(await fs.readFile(`supabase/migrations/${migration}`,'utf8'));
  assert.deepEqual((await db.admin.query('select bounds from game.city_solids order by id')).rows.map(r=>r.bounds),expected);
  console.log(`PASS PostgreSQL authority exactly matches all ${expected.length} rendered/Node collision boxes`);
  const a=await db.actor(),b=await db.actor();
  const created=await a.command('create',{city:'procedural',capacity:2,mode:'tag',enhanced:true}),code=created.room.code;
  await b.command('join',{city:'procedural',code});
  await assert.rejects(()=>a.command('ready',{ready:true,terrainReady:true,spawn:{x:200,y:50,z:0},roofs:[{x:120,y:50,z:0},{x:280,y:50,z:0}]}),/구역/);
  const roofs=[...Array.from({length:12},(_,i)=>({x:170+i*5,y:50,z:0})),{x:70,y:50,z:0},{x:-70,y:50,z:0}];
  const ready=await a.command('ready',{ready:true,terrainReady:true,spawn:{x:0,y:50,z:0},roofs});
  assert.equal(ready.arena.points.length,2);assert(ready.arena.points.every(p=>Math.abs(p.x)<160));
  await b.command('ready',{ready:true,terrainReady:true});await a.command('start');
  const blocked=await a.command('move',{x:200,y:50,z:0,facing:0});assert.equal(blocked.type,'correction');
  const stored=(await db.admin.query('select x,last_move_ms,move_budget from public.game_players where user_id=$1',[a.id])).rows[0];
  assert.equal(stored.x,0);assert.equal(Number(stored.last_move_ms),0);assert.equal(stored.move_budget,20);
  const good=await a.command('move',{x:0,y:50,z:0,facing:0});assert.equal(good.type,'move');
  console.log('PASS authenticated SQL rejects off-map spawns, filters objectives before selection, corrects even a first off-map move and preserves its movement budget');
  await assert.rejects(()=>b.client.query('select * from game.city_solids'),/permission denied/);
  const permissions=(await db.admin.query(`select
    has_function_privilege('anon','public.game_command(text,jsonb)','execute') anon_command,
    has_function_privilege('authenticated','public.game_command(text,jsonb)','execute') player_command,
    has_function_privilege('authenticated','public.game_resolve_terrain_hit(uuid,text,text)','execute') player_damage,
    has_function_privilege('service_role','public.game_resolve_terrain_hit(uuid,text,text)','execute') worker_damage,
    (select bool_and(relrowsecurity) from pg_class where oid in ('public.game_rooms'::regclass,'public.game_players'::regclass)) rls,
    (select proconfig @> array['search_path=""'] from pg_proc where oid='public.game_command(text,jsonb)'::regprocedure) pinned_path`)).rows[0];
  assert.deepEqual(permissions,{anon_command:false,player_command:true,player_damage:false,worker_damage:true,rls:true,pinned_path:true});
  for(const actor of [a,b])await actor.command('leave');
  const hk=await a.command('create',{city:'hong-kong',capacity:2,mode:'free'});await b.command('join',{city:'hong-kong',code:hk.room.code});
  for(const actor of [a,b])await actor.command('ready',{ready:true});await a.command('start');
  assert.equal((await a.command('move',{x:200,y:50,z:0,facing:0})).type,'move','Hong Kong inherited the compact local limit');
  assert.equal((await a.command('move',{x:2400,y:50,z:0,facing:0})).type,'correction');
  console.log('PASS existing RLS, authenticated RPC, worker-only damage permissions and Hong Kong bounds are preserved');
}finally{await db.close();}

const server=createServer(),api=attachRooms(server),sockets=[];
await new Promise(r=>server.listen(0,'127.0.0.1',r));
async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);ws.events=[];ws.on('message',raw=>ws.events.push(JSON.parse(raw)));sockets.push(ws);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return ws;}
const send=(ws,data)=>ws.send(JSON.stringify(data));
async function event(ws,predicate){const until=Date.now()+2500;while(Date.now()<until){const index=ws.events.findIndex(predicate);if(index>=0)return ws.events.splice(index,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error('Expected room event not received');}
try{
  const a=await connect(),b=await connect();send(a,{type:'create',city:'procedural',capacity:2,mode:'free'});
  const joined=await event(a,e=>e.type==='joined');send(b,{type:'join',city:'procedural',code:joined.code});await event(b,e=>e.type==='joined');
  for(const ws of [a,b])send(ws,{type:'ready',ready:true});await event(a,e=>e.type==='room'&&e.players.length===2&&e.players.every(p=>p.ready));
  send(a,{type:'start'});await event(a,e=>e.type==='room'&&e.room.phase==='playing');
  send(a,{type:'move',x:200,y:50,z:0,facing:0});assert.equal((await event(a,e=>e.type==='correction')).x,0);
  assert.equal(api.rooms.get(joined.code).players.get(joined.id).lastMove,0);
  send(a,{type:'move',x:0,y:50,z:0,facing:0});assert.equal((await event(a,e=>e.type==='move'&&e.id===joined.id)).x,0);
  console.log('PASS real WebSocket clients receive off-map corrections and can still make the next valid move');
}finally{for(const ws of sockets)ws.terminate();await new Promise(r=>server.close(r));}
