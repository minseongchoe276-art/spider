import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameApp } from '../src/main.js';
import { GamepadInput } from '../src/GamepadInput.js';
import { Multiplayer } from '../src/Multiplayer.js';
import { CombatPractice } from '../src/CombatPractice.js';
import { cleanSettings } from '../src/PlayerSettings.js';

let passed = 0, failed = 0;
function check(name, run) {
  try { run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
function element(hidden = false) {
  const node = new EventTarget(), classes = new Set(hidden ? ['hidden'] : []);
  Object.assign(node, { textContent: '', style: {}, disabled: false,
    classList: { contains: k => classes.has(k), add: k => classes.add(k), remove: k => classes.delete(k),
      toggle(k, force) { const add = force ?? !classes.has(k); add ? classes.add(k) : classes.delete(k); return add; } },
    focus() { document.activeElement = node; }, querySelector: () => null,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 800, height: 600 }),
  });
  return node;
}
function dom(run) {
  const names = ['window', 'document', 'navigator', 'KeyboardEvent', 'MouseEvent', 'setTimeout'];
  const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const nodes = new Map(['controls-guide', 'btn-close-guide', 'btn-start-game'].map(id => [id, element(id === 'controls-guide')]));
  const document = new EventTarget();
  Object.assign(document, { getElementById: id => nodes.get(id) || null, querySelector: () => null,
    body: element(), pointerLockElement: null, exitPointerLock() { this.pointerLockElement = null; this.dispatchEvent(new Event('pointerlockchange')); } });
  class InputEvent extends Event { constructor(type, options) { super(type, options); for (const [key, value] of Object.entries(options)) if (key !== 'bubbles') Object.defineProperty(this, key, { value }); } }
  for (const [name, value] of Object.entries({ window: new EventTarget(), document, navigator: {},
    KeyboardEvent: InputEvent, MouseEvent: InputEvent, setTimeout: callback => { callback(); return 0; } }))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  try { run(nodes); }
  finally { for (const [name, descriptor] of descriptors) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]; }
}
function app() {
  const game = Object.create(GameApp.prototype), scene = new THREE.Scene();
  const city = { playableHalfExtent: 160, colliders: [], getRooftopSpawn: () => new THREE.Vector3(0, 10, 0) };
  const audio = { ensureContext() {}, setWindSpeed() {}, playCheckpointChime() {} };
  Object.assign(game, { scene, city, audio, canvas: element(), isPlaying: true, isPaused: false, assetsReady: true,
    input: {}, heldKeys: new Set(), preferences: { values: { settings: cleanSettings(), bestTimes: {} } },
    physics: { position: new THREE.Vector3(5, 10, 0), state: 'IDLE', clearPendingInput() {},
      resetPosition() { game.resets++; this.position.copy(city.getRooftopSpawn()); } },
    combat: { mode: 'web', enemies: [], toggle() { this.mode = this.mode === 'web' ? 'combat' : 'web'; }, clearHeld() {}, cancel() { game.cancels++; }, clearEnemies() { this.enemies = []; } },
    tpsCamera: { handleMouseMove() { game.cameraMoves++; } },
    experience: {},
    resets: 0, cancels: 0, races: 0, cameraMoves: 0, resetCamera() {}, showNotice(message) { this.notice = message; },
  });
  const practice = Object.create(CombatPractice.prototype);
  Object.assign(practice, { game, active: true, projectiles: [] }); game.practice = practice;
  game.initInputListeners();
  return game;
}
function key(type, code) {
  const event = new Event(type, { cancelable: true }); Object.defineProperty(event, 'code', { value: code }); window.dispatchEvent(event);
}

check('Help cannot remain hidden beneath the lobby or pause menu', () => dom(nodes => {
  const game = app(); game.isPlaying = false; key('keydown', 'KeyH'); key('keyup', 'KeyH');
  assert(nodes.get('controls-guide').classList.contains('hidden'), 'Lobby shortcut opened an obscured help dialog');
  game.isPlaying = true; game.setPaused(true); key('keydown', 'KeyH');
  assert(nodes.get('controls-guide').classList.contains('hidden'), 'Pause shortcut opened an obscured help dialog');
}));
check('Background pause closes solo help so resume really restores gameplay', () => dom(nodes => {
  const game = app(); game.toggleHelp(); assert(game.gameplaySuspended);
  window.dispatchEvent(new Event('blur')); assert(game.isPaused);
  game.setPaused(false); assert(!game.gameplaySuspended, 'Resume left the solo simulation suspended');
  assert(nodes.get('controls-guide').classList.contains('hidden'));
}));
check('Solo and online session entry retire a help dialog from the previous activity', () => dom(nodes => {
  const game = app(), multiplayer = Object.create(Multiplayer.prototype);
  game.experience.restorePosition = () => false; game.applyPreferences = () => {};
  game.character = { group: new THREE.Group() };
  Object.assign(multiplayer, { game, solo: true, players: [], setSpectating() {}, render() {}, placeMatchSpawn() {} });
  game.toggleHelp(); multiplayer.beginSoloReady();
  assert(!game.gameplaySuspended); assert(nodes.get('controls-guide').classList.contains('hidden'));
  game.toggleHelp(); assert(game.helpOpen);
  multiplayer.room = { phase: 'playing', mode: 'free' }; multiplayer.begin();
  assert(!game.helpOpen); assert(nodes.get('controls-guide').classList.contains('hidden'));
}));
check('Opening help unlocks the cursor without pausing; closing restores game focus', () => dom(nodes => {
  const game = app(); game.hadPointerLock = true; game.pointerLockWanted = true; document.pointerLockElement = game.canvas;
  game.toggleHelp(); assert.equal(document.pointerLockElement, null, 'Help close button is inaccessible while cursor is locked');
  assert(!game.isPaused); assert.equal(document.activeElement, nodes.get('btn-close-guide'));
  nodes.get('btn-close-guide').focus(); game.toggleHelp(); assert.equal(document.activeElement, game.canvas);
}));
check('Repeated Escape closes help only once before opening the pause menu', () => dom(() => {
  const game = app(); game.toggleHelp(); key('keydown', 'Escape');
  const repeat = new Event('keydown', { cancelable: true }); Object.defineProperties(repeat, { code: { value: 'Escape' }, repeat: { value: true } });
  window.dispatchEvent(repeat); assert(!game.helpOpen); assert(!game.isPaused);
}));



check('Pad Start does not reintroduce stick movement or camera look in the pause frame', () => dom(() => {
  const game = app(), pad = new GamepadInput(game);
  navigator.getGamepads = () => [{ index: 0, mapping: 'standard', axes: [1, -1, 1, 1],
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 9 || i === 14 })) }];
  let cameraCycles = 0; game.tpsCamera.cycleMode = () => { cameraCycles++; return 'follow'; };
  game.character = {};
  pad.update(1 / 60); assert(game.isPaused); assert(!game.input.forward && !game.input.right);
  assert.equal(game.cameraMoves, 0); assert.equal(cameraCycles, 0, 'A button after Start changed the paused view');
}));
check('Pad resume defers sticks until the next frame and does not use paused look time', () => dom(() => {
  const game = app(), pad = new GamepadInput(game); game.isPaused = true;
  const buttons = Array.from({ length: 16 }, (_, i) => ({ pressed: i === 9 }));
  navigator.getGamepads = () => [{ index: 0, mapping: 'standard', axes: [1, -1, 1, 1], buttons }];
  pad.update(.1); assert(!game.isPaused); assert(!game.input.forward); assert.equal(game.cameraMoves, 0);
  buttons[9].pressed = false; pad.update(1 / 60); assert(game.input.forward && game.input.right); assert.equal(game.cameraMoves, 1);
}));

console.log(`Session flow review: ${passed} passed, ${failed} failed.`);
if (failed) process.exitCode = 1;
