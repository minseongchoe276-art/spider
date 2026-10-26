import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');

const clients = [0, 1].map(() => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}));
const call = async (client, name, args = {}) => {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
};
const cmd = (client, action, data = {}) => call(client, 'game_command', {
  p_action: action, p_data: data,
});

let roomCode;
try {
  for (const client of clients) {
    const { error } = await client.auth.signInAnonymously();
    if (error) throw error;
  }
  const [host, guest] = clients;
  const created = await cmd(host, 'create', {
    name: 'Supabase 점검', playerName: '호스트', capacity: 2, mode: 'tag', city: 'procedural',
  });
  roomCode = created.room.code;
  assert.match(roomCode, /^[A-F0-9]{6}$/);
  assert.equal(created.room.count, 1);
  const joined = await cmd(guest, 'join', { code: roomCode, playerName: '손님', city: 'procedural' });
  assert.equal(joined.room.count, 2);
  assert.equal((await call(host, 'game_state', { p_code: roomCode })).players.length, 2);
  await assert.rejects(() => call(guest, 'game_state', { p_code: '000000' }));
  const events=[[],[]],channels=[];
  const waitEvent=async(index,predicate)=>{
    const end=Date.now()+6000;
    while(Date.now()<end){const event=events[index].find(predicate);if(event)return event;await new Promise(r=>setTimeout(r,20));}
    throw new Error(`Realtime event did not arrive for client ${index}`);
  };
  for (const [index,client] of clients.entries()) {
    await client.realtime.setAuth((await client.auth.getSession()).data.session.access_token);
    const channel=client.channel(`game:${roomCode}`,{config:{private:true}});
    for(const event of ['state','move','pose','hit'])channel.on('broadcast',{event},({payload})=>events[index].push(payload));
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Realtime subscription timed out')),8000);
      channel.subscribe((status,error)=>{
        if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}
        if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(error || new Error('Realtime authorization failed'));}
      });
    });
    channels.push(channel);
  }
  await assert.rejects(()=>cmd(host,'start'),'Unready players were allowed to start');
  await assert.rejects(()=>cmd(guest,'start'),'Guest was allowed to start');
  await cmd(host, 'ready', { ready: true });
  await waitEvent(1,p=>p.type==='room' && p.players?.some(player=>player.ready));
  await cmd(guest, 'ready', { ready: true });
  const started = await cmd(host, 'start');
  assert.equal(started.room.phase, 'playing');
  assert.equal(started.players.filter(player => player.team === 'police').length, 1);
  const hostId = (await host.auth.getUser()).data.user.id;
  const police = started.players.find(player => player.team === 'police').id === hostId ? host : guest;
  const runner = police === host ? guest : host;
  const pose={state:'SWINGING',velocity:{x:0,y:-2,z:8},anchor:{x:0,y:25,z:12},
    webs:[{hand:'left',anchor:{x:0,y:25,z:12}}]};
  await call(police,'game_move_pose',{p_data:{x:0,y:0,z:0,facing:0,pose,id:'forged-player'}});
  await call(runner,'game_move_pose',{p_data:{x:0,y:0,z:2,facing:0,pose:{...pose,state:'IDLE'}}});
  const policeId=started.players.find(p=>p.team==='police').id;
  const runnerId=started.players.find(p=>p.team==='runner').id;
  const remotePose=await waitEvent(police===host?1:0,p=>p.type==='pose' && p.id===policeId);
  assert.equal(remotePose.pose.state,'SWINGING');assert.equal(remotePose.pose.webs[0].hand,'left');
  await waitEvent(runner===host?1:0,p=>p.type==='move' && p.id===runnerId);
  const snapshot = await call(host, 'game_state', { p_code: roomCode });
  assert(snapshot.players.every(player => player.seen));
  assert.equal((await call(guest,'game_resume')).room.code,roomCode,'Session resume lost room');
  assert.equal(await cmd(police, 'attack', { kind: 'punch', facing: 0 }), null,
    'Opening grace must prevent damage');
  await new Promise(resolve => setTimeout(resolve, 8200));
  const hit = await cmd(police, 'attack', { kind: 'punch', facing: 0 });
  assert.equal(hit.health, 75);
  assert.equal(hit.kind, 'punch');
  const receivedHit=await waitEvent(runner===host?0:1,p=>p.type==='hit' && p.target===runnerId);
  assert.equal(receivedHit.health,75,'Other client did not receive damage');
  await cmd(host,'leave');
  const remaining=await call(guest,'game_state',{p_code:roomCode});
  assert.equal(remaining.room.count,1);assert.equal(remaining.host,(await guest.auth.getUser()).data.user.id);
  assert.equal(remaining.room.phase,'finished');
  await cmd(guest,'rematch');assert.equal((await call(guest,'game_resume')).room.phase,'waiting');
  await cmd(guest,'leave');
  for(const [i,channel] of channels.entries())await clients[i].removeChannel(channel);
  const free=await cmd(host,'create',{name:'자유 플레이 검증',capacity:2,mode:'free',city:'procedural'});
  await cmd(guest,'join',{code:free.room.code,city:'procedural'});
  await cmd(host,'ready',{ready:true});await cmd(guest,'ready',{ready:true});
  const freeStart=await cmd(host,'start');assert.equal(freeStart.room.phase,'playing');
  assert(freeStart.players.every(p=>p.team==='free'));
  assert.equal(await cmd(host,'attack',{kind:'punch',facing:0}),null,'Free play caused damage');
  console.log('PASS live Supabase: independent users, private channels, ready/host gates, start, bidirectional movement, authenticated pose/web, grace, hit broadcast, resume, host leave, rematch, free play');
} finally {
  for (const client of clients) {
    try { await cmd(client, 'leave'); } catch { /* A failed setup may not have joined. */ }
    await client.removeAllChannels();
    await client.auth.signOut();
    client.realtime.disconnect();
  }
}
