import assert from 'node:assert/strict';
import { SupabaseRooms, roomEntryRecovery } from '../src/SupabaseRooms.js';

const resumed = code => ({ type: 'room', room: { code, city: 'procedural', phase: 'waiting' }, players: [] });
const full = new Error('방이 가득 찼습니다.');
const stuck = new Error('먼저 현재 방에서 나가세요.');

assert.equal(roomEntryRecovery(full, 'join', { code: 'abc123' }, resumed('ABC123')).type, 'enter');
assert.equal(roomEntryRecovery(stuck, 'join', { code: 'ABC123' }, resumed('ABC123')).type, 'enter');
assert.equal(roomEntryRecovery(full, 'join', { code: 'OTHER1' }, resumed('ABC123')).type, 'fail');
assert.equal(roomEntryRecovery(stuck, 'join', { code: 'OTHER1' }, resumed('ABC123')).type, 'leave-retry');
assert.equal(roomEntryRecovery(stuck, 'create', {}, resumed('ABC123')).type, 'leave-retry');
assert.equal(roomEntryRecovery(new Error('참가 가능한 방이 없습니다.'), 'join', { code: 'ABC123' }, null).type, 'fail');
assert.equal(roomEntryRecovery(full, 'join', { code: 'ABC123', city: 'hong-kong' }, {
  type: 'room', room: { code: 'ABC123', city: 'procedural' },
}).type, 'switch-city');
console.log('PASS room entry recovery');

function client() {
  const room = Object.create(SupabaseRooms.prototype);
  room.readyState = 1;
  room.roomCode = null;
  room.userId = 'me';
  room.controlQueue = Promise.resolve();
  room.events = [];
  room.emit = data => { if (data) room.events.push(data); };
  room.fail = error => room.events.push({ type: 'error', message: error.message });
  return room;
}

const same = client();
same.rpc = async name => {
  assert.equal(name, 'game_resume');
  return resumed('ABC123');
};
same.command = async () => { throw new Error('game_command should not run for a room you already occupy'); };
const entered = await same.enter('join', { code: 'abc123', city: 'procedural' });
assert.equal(entered.room.code, 'ABC123');

const raced = client();
let resumes = 0;
raced.rpc = async name => {
  assert.equal(name, 'game_resume');
  resumes += 1;
  return resumes === 1 ? null : resumed('FULL11');
};
raced.command = async () => { throw full; };
assert.equal((await raced.enter('join', { code: 'full11', city: 'procedural' })).room.code, 'FULL11');

const blocked = client();
const calls = [];
blocked.rpc = async (name, args) => {
  calls.push(`${name}:${args?.p_action || ''}`);
  if (name === 'game_resume') return resumed('OLD111');
  if (args?.p_action === 'leave') return { type: 'left' };
  throw new Error(name);
};
blocked.command = async action => {
  calls.push(`command:${action}`);
  if (!calls.includes('game_command:leave')) throw stuck;
  return resumed('NEW222');
};
assert.equal((await blocked.enter('join', { code: 'NEW222', city: 'procedural' })).room.code, 'NEW222');
assert.equal(blocked.roomCode, null);

const occupied = client();
occupied.roomCode = 'KEEPME';
occupied.rpc = async () => resumed('KEEPME');
occupied.command = async () => { throw full; };
await assert.rejects(() => occupied.enter('join', { code: 'FULL22', city: 'procedural' }), /방이 가득/);
assert.equal(occupied.roomCode, 'KEEPME');
console.log('PASS enter: same room, raced membership, leave-once retry, full room stays');

const shown = client();
shown.subscribe = async () => { throw new Error('방 실시간 연결 시간이 초과되었습니다. 대기실 상태는 유지됩니다.'); };
shown.refreshState = async () => { throw new Error('refresh after a failed subscribe'); };
shown.enter = async () => resumed('ROOM01');
await shown.dispatch({ type: 'join', code: 'ROOM01', city: 'procedural' });
assert.deepEqual(shown.events.map(event => event.type), ['joined', 'room', 'error']);
assert.equal(shown.roomCode, 'ROOM01');
assert.notEqual(shown.fatal, true);

const clicks = client();
let started = 0;
clicks.dispatch = async () => { started += 1; await new Promise(resolve => setTimeout(resolve, 20)); };
clicks.send(JSON.stringify({ type: 'join', code: 'A' }));
clicks.send(JSON.stringify({ type: 'join', code: 'A' }));
clicks.send(JSON.stringify({ type: 'create' }));
await clicks.controlQueue;
clicks.send(JSON.stringify({ type: 'join', code: 'B' }));
await clicks.controlQueue;
assert.equal(started, 2);
console.log('PASS present room before realtime, ignore repeated join clicks');

const gone = client();
gone.roomCode = 'ABC123';
gone.channel = {};
let removed = 0;
gone.client = { removeChannel() { removed += 1; return Promise.resolve(); } };
gone.command = async () => { throw new Error('방에 참가하지 않았습니다.'); };
await gone.beat('ABC123');
assert.equal(gone.roomCode, null);
assert.equal(gone.events.at(-1).type, 'left');
assert.equal(removed, 1);
gone.roomCode = 'ABC123';
gone.rpc = async () => { throw new Error('방에 참가하지 않았습니다.'); };
await gone.dispatch({ type: 'move', x: 0, y: 0, z: 0, facing: 0 });
assert.equal(gone.roomCode, null);
console.log('PASS expired membership stops heartbeat and movement');
