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
  const token = (await host.auth.getSession()).data.session.access_token;
  await host.realtime.setAuth(token);
  let receivedReady;
  const readyBroadcast = new Promise((resolve, reject) => {
    receivedReady = resolve;
    setTimeout(() => reject(new Error('Realtime room state did not arrive')), 5000);
  });
  const channel = host.channel(`game:${roomCode}`, { config: { private: true } })
    .on('broadcast', { event: 'state' }, ({ payload }) => {
      if (payload.players?.some(player => player.ready)) receivedReady(payload);
    });
  await new Promise((resolve, reject) => channel.subscribe((status, error) => {
    if (status === 'SUBSCRIBED') resolve();
    if (status === 'CHANNEL_ERROR') reject(error || new Error('Realtime authorization failed'));
  }));
  await cmd(host, 'ready', { ready: true });
  await readyBroadcast;
  await cmd(guest, 'ready', { ready: true });
  const started = await cmd(host, 'start');
  assert.equal(started.room.phase, 'playing');
  assert.equal(started.players.filter(player => player.team === 'police').length, 1);
  const hostId = (await host.auth.getUser()).data.user.id;
  const police = started.players.find(player => player.team === 'police').id === hostId ? host : guest;
  const runner = police === host ? guest : host;
  await cmd(police, 'move', { x: 0, y: 0, z: 0, facing: 0 });
  await cmd(runner, 'move', { x: 0, y: 0, z: 2, facing: 0 });
  const snapshot = await call(host, 'game_state', { p_code: roomCode });
  assert(snapshot.players.every(player => player.seen));
  assert.equal(await cmd(police, 'attack', { kind: 'punch', facing: 0 }), null,
    'Opening grace must prevent damage');
  await new Promise(resolve => setTimeout(resolve, 8200));
  const hit = await cmd(police, 'attack', { kind: 'punch', facing: 0 });
  assert.equal(hit.health, 75);
  assert.equal(hit.kind, 'punch');
  await host.removeChannel(channel);
  console.log('PASS Supabase: two guests, private Realtime, match start, movement, and server damage');
} finally {
  for (const client of clients) {
    try { await cmd(client, 'leave'); } catch { /* A failed setup may not have joined. */ }
    await client.removeAllChannels();
    await client.auth.signOut();
    client.realtime.disconnect();
  }
}
