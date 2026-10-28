// Local room-server guard freshness. Does not call production and does not change rules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { attachRooms } from '../rooms.mjs';
import { MATCH } from '../../src/MatchRules.js';

const folder = 'docs/qa/quality-director-2026-10-28/guard-v5';
fs.mkdirSync(folder, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const peers = [];
const results = [];
const server = createServer();
const api = attachRooms(server, { terrain: { visibility: () => Promise.resolve({ status: 'CLEAR', version: 'v5' }) } });
const saved = [MATCH.graceMs, MATCH.punch.cooldown, MATCH.web.cooldown];
MATCH.graceMs = MATCH.punch.cooldown = MATCH.web.cooldown = 0;
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const send = (ws, payload) => ws.send(JSON.stringify(payload));
async function event(ws, fn) {
  for (let i = 0; i < 800; i++) {
    const index = ws.events.findIndex(fn);
    if (index >= 0) return ws.events.splice(index, 1)[0];
    await wait(4);
  }
  throw Error('Expected room event missing');
}
const pose = (guard, { air = false, combat = true, state } = {}) => ({
  state: state || (air ? 'JUMPING' : 'IDLE'),
  velocity: { x: 0, y: 0, z: 0 },
  combatStance: combat,
  combat: guard ? { key: 'guard' } : null,
});
let ids;
let room;
async function setup(mode = 'custom') {
  for (const peer of peers) send(peer, { type: 'leave' });
  await wait(80);
  for (const peer of peers) peer.events = [];
  send(peers[0], { type: 'create', mode, format: 'teams', capacity: 2, city: 'hong-kong', name: 'V5 guard delay' });
  const host = await event(peers[0], item => item.type === 'joined');
  ids = [host.id];
  send(peers[1], { type: 'join', city: 'hong-kong', code: host.code });
  ids.push((await event(peers[1], item => item.type === 'joined')).id);
  room = api.rooms.get(host.code);
  for (const peer of peers) send(peer, { type: 'ready', ready: true, terrainReady: true, spawn: { x: 0, y: 1, z: 0 } });
  await event(peers[0], item => item.type === 'room' && item.players?.every(player => player.ready));
  send(peers[0], { type: 'start' });
  await event(peers[0], item => item.type === 'room' && item.room.phase === 'playing');
}
async function move(index, guard, options = {}) {
  await wait(45);
  send(peers[index], {
    type: 'move', x: options.x ?? 0, y: 200, z: options.z ?? 0.8,
    facing: options.facing ?? (index ? Math.PI : 0),
    pose: pose(guard, options),
  });
  await event(peers[0], item => item.type === 'move' && item.id === ids[index]);
}
async function punch(expected) {
  for (const peer of peers) peer.events = peer.events.filter(item => item.type !== 'hit' && item.type !== 'attack-result');
  room.players.get(ids[1]).health = 100;
  send(peers[0], { type: 'attack', kind: 'punch', facing: 0, targetId: ids[1] });
  const hit = await event(peers[0], item => (item.type === 'hit' && item.target === ids[1]) || item.type === 'attack-result');
  if (hit.type === 'attack-result') throw Error(`attack rejected: ${hit.reason}`);
  assert.equal(hit.damage, expected);
  return hit.damage;
}

try {
  for (let i = 0; i < 2; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
    ws.events = [];
    ws.on('message', raw => ws.events.push(JSON.parse(raw)));
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    peers.push(ws);
  }
  await setup();
  await move(0, false, { z: 0, facing: 0, combat: false });
  await move(1, true, { facing: Math.PI });
  const attacker = room.players.get(ids[0]);
  console.log('pre-punch', { seen: attacker.seen, age: Date.now() - attacker.lastMove, mode: room.mode, city: room.city, pose: attacker.pose?.state, y: attacker.y, z: attacker.z });
  await wait(100);
  results.push({ name: '100ms after a guard packet', damage: await punch(10), expected: 10 });
  await move(1, true, { facing: Math.PI });
  await wait(250);
  results.push({ name: '250ms after a guard packet', damage: await punch(10), expected: 10 });
  await move(1, true, { facing: Math.PI });
  await wait(MATCH.guard.freshnessMs + 40);
  results.push({ name: 'packet stopped past 350ms', damage: await punch(25), expected: 25 });
  await move(1, true, { facing: Math.PI });
  results.push({ name: 'guard packet resumed', damage: await punch(10), expected: 10 });
  const started = Date.now();
  while (Date.now() - started < 500) await move(1, true, { facing: Math.PI });
  results.push({ name: 'standing still while packets continue', damage: await punch(10), expected: 10 });
  await setup('tag');
  const cop = [...room.players.values()].find(player => player.team === 'police');
  const runner = [...room.players.values()].find(player => player.team === 'runner');
  const copIndex = ids.indexOf(cop.id);
  const runnerIndex = ids.indexOf(runner.id);
  await move(copIndex, false, { z: 0, facing: 0, combat: false });
  await move(runnerIndex, true, { combat: false, facing: Math.PI });
  room.players.get(runner.id).health = 100;
  for (const peer of peers) peer.events = peer.events.filter(item => item.type !== 'hit');
  send(peers[copIndex], { type: 'attack', kind: 'punch', facing: 0, targetId: runner.id });
  const forged = await event(peers[0], item => item.type === 'hit' && item.target === runner.id);
  results.push({
    name: 'SP-V4-GUARD runner forged pose still reduces damage',
    damage: forged.damage,
    expected: 10,
    changed: false,
  });
  assert.equal(forged.damage, 10);
  const output = { passed: results.length, total: results.length, freshnessMs: MATCH.guard.freshnessMs, results };
  fs.writeFileSync(`${folder}/delays.json`, JSON.stringify(output, null, 2) + '\n');
  console.log('PASS', results.length, 'guard delay cases');
} finally {
  [MATCH.graceMs, MATCH.punch.cooldown, MATCH.web.cooldown] = saved;
  for (const peer of peers) peer.terminate();
  await new Promise(resolve => server.close(resolve));
}
