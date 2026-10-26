import assert from 'node:assert/strict';
import {localGameDb} from './lib/local-game-db.mjs';

const db=await localGameDb();
try{
  assert.equal((await db.admin.query('select count(*)::int as count from game.admin_credential')).rows[0].count,0);
  const unconfigured=await db.actor();
  assert.equal((await unconfigured.client.query(`select public.game_admin_overview('alalal1010') as result`)).rows[0].result.ok,false);
  await db.admin.query(`insert into game.admin_credential(token_sha256) values(encode(digest(convert_to('alalal1010','UTF8'),'sha256'),'hex'))`);
  // Keep the unconfigured probe out of the presence count assertions below.
  const lobby=await db.actor();
  const solo=await db.actor();
  const host=await db.actor();
  const friend=await db.actor();
  await lobby.client.query(`select public.game_presence_ping('hong-kong','lobby')`);
  await solo.client.query(`select public.game_presence_ping('procedural','solo')`);
  const created=await host.command('create',{name:'운영 방',mode:'tag',capacity:4,city:'procedural',playerName:'호스트'});
  await friend.command('join',{code:created.room.code,playerName:'친구',city:'procedural'});
  const read=async(actor,token)=> (await actor.client.query('select public.game_admin_overview($1) as result',[token])).rows[0].result;
  const overview=await read(host,'alalal1010');
  assert.equal(overview.ok,true);
  assert.equal(overview.transport,'supabase');
  assert.equal(overview.online.connected,4);
  assert.equal(overview.online.lobby,1);
  assert.equal(overview.online.solo,1);
  assert.equal(overview.online.waiting,2);
  assert.equal(overview.online.playing,0);
  assert.equal(overview.matches[0].code,created.room.code);
  assert.equal(overview.matches[0].hostName,'호스트');
  assert.equal(overview.matches[0].players.length,2);
  assert(!JSON.stringify(overview).match(/"x"|"y"|"z"|"facing"|"user_id"/),'Overview exposed a private field');
  await assert.rejects(lobby.client.query('select * from public.game_presence'));
  await assert.rejects(lobby.client.query('select token_sha256 from game.admin_credential'));
  await db.admin.query('set role anon');
  await assert.rejects(db.admin.query(`select public.game_admin_overview('alalal1010')`));
  await db.admin.query('reset role');
  const denied=await read(friend,'wrong-admin-key');
  assert.equal(denied.ok,false);
  assert.equal(denied.matches,undefined);
  for(let attempt=0;attempt<7;attempt++) assert.equal((await read(friend,'wrong-admin-key')).ok,false);
  const locked=await read(friend,'alalal1010');
  assert.equal(locked.ok,false);
  assert.match(locked.message,/잠시 후/);
  assert.equal((await read(host,'alalal1010')).ok,true);
  console.log('PASS admin database: presence counts, hidden tables, key lockout');
}finally{
  await db.admin.query('reset role').catch(()=>{});
  await db.close();
}
