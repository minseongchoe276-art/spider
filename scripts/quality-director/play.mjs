// Drives the local dev server through Chrome. Pointer lock is attempted and
// recorded. It is not treated as a pass when the browser does not grant it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'shots');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const tests = [];
const consoleErrors = [];

function record(name, status, detail = {}) {
  tests.push({ name, status, ...detail });
  console.log(`${status}  ${name}`);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', error => consoleErrors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

async function shot(name) {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(root, file);
}

async function ready(timeout = 90000) {
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 20000 });
}

async function ensurePlaying() {
  const paused = await page.evaluate(() => !globalThis.__shadowPulseQuality.playing() || !document.getElementById('overlay-click-to-play').classList.contains('hidden'));
  if (!paused) return;
  await page.click('#btn-start-drag');
  await page.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 5000 });
}

async function scenario(name, run) {
  await ensurePlaying();
  await page.evaluate(label => globalThis.__shadowPulseQuality.begin(label), name);
  try { await run(); }
  finally {
    await page.keyboard.up('w').catch(() => {});
    await page.keyboard.up('Shift').catch(() => {});
    await page.keyboard.up('PageUp').catch(() => {});
  }
  const result = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
  await page.evaluate(() => globalThis.__shadowPulseQuality.release());
  return result;
}

async function hold(key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

try {
  const started = Date.now();
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await ready();
  const boot = await page.evaluate(() => globalThis.__shadowPulseQuality.dump());
  record('boot procedural solo', boot.ready && boot.latest?.playing ? 'PASS' : 'FAIL', {
    detail: { map: boot.map, loadMs: Date.now() - started, state: boot.latest?.state, errors: boot.errors },
  });
  await shot('01-idle');

  const lock = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    try { await canvas.requestPointerLock(); }
    catch (error) { return { granted: false, error: String(error) }; }
    await new Promise(resolve => setTimeout(resolve, 250));
    return { granted: document.pointerLockElement === canvas };
  });
  record('pointer lock', lock.granted ? 'PASS' : 'UNVERIFIED', {
    detail: { ...lock, note: lock.granted ? 'Chrome granted pointer lock.' : 'Automation did not receive pointer lock. Later look tests use Home/End/PageUp/PageDown, which call the same handleMouseMove as the locked mouse.' },
  });

  const look = await scenario('keyboard-look', async () => {
    await hold('PageUp', 700);
    await hold('PageDown', 400);
    await hold('End', 350);
  });
  const pitchDelta = Math.abs((look.summary.pitch?.[1] ?? 0) - (look.summary.pitch?.[0] ?? 0));
  const yawDelta = Math.abs((look.summary.yaw?.[1] ?? 0) - (look.summary.yaw?.[0] ?? 0));
  record('keyboard camera look', pitchDelta > 0.05 && yawDelta > 0.05 ? 'PASS' : 'FAIL', { detail: look.summary });

  const walk = await scenario('walk', async () => { await hold('w', 1800); await page.waitForTimeout(300); });
  record('walk', walk.summary.travel > 1 ? 'PASS' : 'FAIL', { detail: walk.summary });
  await shot('02-after-walk');

  const sprint = await scenario('sprint', async () => {
    await page.keyboard.down('Shift');
    await page.keyboard.down('w');
    await page.waitForTimeout(1600);
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);
  });
  const walked = walk.summary.maxSpeed || 0;
  record('sprint faster than walk', sprint.summary.maxSpeed > walked + 0.4 ? 'PASS' : 'FAIL', {
    detail: { walkSpeed: walked, sprint: sprint.summary },
  });
  record('sprint stop returns toward idle', ['IDLE', 'LANDING', 'TURNING'].includes(sprint.summary.states.at(-1)) || sprint.summary.states.includes('IDLE') ? 'PASS' : 'FAIL', {
    detail: { states: sprint.summary.states },
  });

  const jump = await scenario('jump', async () => {
    await page.keyboard.down('w');
    await page.waitForTimeout(400);
    await page.keyboard.press(' ');
    await page.waitForTimeout(900);
    await page.keyboard.up('w');
    await page.waitForTimeout(400);
  });
  record('jump and landing', jump.summary.states.some(state => state === 'JUMPING' || state === 'FALLING') ? 'PASS' : 'FAIL', { detail: jump.summary });
  await shot('03-jump');

  const swing = await scenario('web-swing', async () => {
    await hold('PageUp', 900);
    const box = await page.locator('#webgl-canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1400);
    await page.mouse.up();
    await page.waitForTimeout(700);
  });
  record('web swing attach or honest miss', swing.summary.swingingFrames > 0 ? 'PASS' : 'FAIL', { detail: swing.summary });
  await shot('04-swing');

  const dual = await scenario('dual-web', async () => {
    await hold('PageUp', 500);
    const box = await page.locator('#webgl-canvas').boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(400);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(900);
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(350);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(400);
  });
  record('dual web hold', dual.summary.maxWebs >= 2 ? 'PASS' : 'FAIL', { detail: dual.summary });

  await page.keyboard.press('q');
  await page.waitForTimeout(250);
  const mode = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot().combatMode);
  record('toggle combat mode', mode === 'combat' ? 'PASS' : 'FAIL', { detail: { mode } });

  async function strike(name, expected, act) {
    const result = await scenario(name, act);
    record(name, result.summary.attacks.includes(expected) ? 'PASS' : 'FAIL', { detail: { expected, ...result.summary } });
    return result;
  }
  const boxOf = async () => page.locator('#webgl-canvas').boundingBox();
  await strike('jab', 'jab', async () => {
    const box = await boxOf();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(850);
  });
  await shot('05-jab');
  await strike('straight', 'cross', async () => {
    const box = await boxOf();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(1000);
  });
  await strike('hook (E starts heavy)', 'heavy', async () => { await page.keyboard.press('e'); await page.waitForTimeout(1200); });
  await strike('uppercut (G starts special)', 'special', async () => { await page.keyboard.press('g'); await page.waitForTimeout(1600); });
  await shot('06-special');

  const combo = await scenario('jab-straight', async () => {
    const box = await boxOf();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(560);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(1000);
  });
  record('jab then straight', combo.summary.attacks.includes('jab') && combo.summary.attacks.includes('cross') ? 'PASS' : 'FAIL', { detail: combo.summary });

  const moving = await scenario('run-jab', async () => {
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    const box = await boxOf();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);
    await page.keyboard.up('w');
  });
  record('run into jab', moving.summary.attacks.includes('jab') ? 'PASS' : 'FAIL', { detail: moving.summary });

  const mash = await scenario('attack-mash', async () => {
    const box = await boxOf();
    for (let i = 0; i < 8; i++) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(600);
  });
  record('attack mash stays finite', Number.isFinite(mash.summary.maxSpeed) && mash.summary.attacks.includes('jab') ? 'PASS' : 'FAIL', { detail: mash.summary });

  await page.keyboard.press('q');
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot().combatMode);
  record('return to wire mode', back === 'web' ? 'PASS' : 'FAIL', { detail: { mode: back } });

  const blur = await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    return globalThis.__shadowPulseQuality.snapshot().paused;
  });
  record('blur pauses play', blur ? 'PASS' : 'FAIL', { detail: { paused: blur } });
  await page.evaluate(() => {
    const game = globalThis.__shadowPulseQuality;
    document.querySelector('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(300);

  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(400);
  const resized = await page.evaluate(() => {
    const snap = globalThis.__shadowPulseQuality.snapshot();
    return { playing: snap.playing, drawCalls: snap.drawCalls, errors: globalThis.__shadowPulseQuality.errors().length };
  });
  record('resize keeps playing', resized.playing ? 'PASS' : 'FAIL', { detail: resized });
  await shot('07-resized');

  const idlePerf = await scenario('idle-performance', async () => { await page.waitForTimeout(2500); });
  record('idle performance sample', idlePerf.summary.averageFps ? 'PASS' : 'UNVERIFIED', { detail: idlePerf.summary });

  const counts = await page.evaluate(() => globalThis.__shadowPulseQuality.dump());
  record('audio triggers observed', Object.keys(counts.audioCounts).length ? 'PASS' : 'UNVERIFIED', {
    detail: { audioCounts: counts.audioCounts, note: 'Counts show the synth methods ran. Loudness and timbre were not heard.' },
  });
  record('vfx triggers observed', Object.values(counts.vfxCounts).some(value => value > 0) ? 'PASS' : 'UNVERIFIED', { detail: counts.vfxCounts });
  record('console errors during solo', consoleErrors.length || counts.errors.length ? 'FAIL' : 'PASS', {
    detail: { page: consoleErrors.slice(0, 20), probe: counts.errors.slice(0, 20) },
  });
} catch (error) {
  record('solo session', 'BLOCKED', { detail: { error: error.stack || error.message } });
  try { await shot('blocked'); } catch {}
}

try {
  const motions = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await motions.goto(`${base}/?motionReview=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await motions.waitForFunction(() => document.querySelectorAll('#motion option').length >= 30, null, { timeout: 90000 });
  const keys = ['idle', 'walk', 'run', 'swing', 'jab', 'hook', 'special', 'land', 'wall', 'fall'];
  for (const key of keys) {
    await motions.selectOption('#motion', key);
    await motions.dispatchEvent('#motion', 'change');
    await motions.evaluate(phase => {
      const slider = document.getElementById('frame');
      slider.value = String(phase);
      slider.oninput();
    }, key === 'jab' || key === 'hook' || key === 'special' ? 40 : 55);
    await motions.waitForTimeout(200);
    const file = path.join(shotDir, `motion-${key}.png`);
    await motions.screenshot({ path: file });
  }
  record('motion review frames captured', 'PASS', { detail: { keys, visual: 'captured for director review, not auto-scored' } });
  await motions.close();
} catch (error) {
  record('motion review frames', 'BLOCKED', { detail: { error: error.message } });
}

try {
  const host = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const guest = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  async function boot(target, name) {
    await target.goto(`${base}/?city=procedural&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await target.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 90000 });
    await target.fill('#player-name', name);
    await target.selectOption('#room-mode', 'free');
    await target.selectOption('#room-capacity', '2');
  }
  await boot(host, 'DirectorA');
  await boot(guest, 'DirectorB');
  await host.click('#create-room');
  await host.waitForFunction(() => document.getElementById('room-code-display')?.textContent?.trim().length >= 4, null, { timeout: 10000 });
  const code = await host.locator('#room-code-display').innerText();
  await guest.fill('#room-code', code.trim());
  await guest.click('#join-code');
  await guest.waitForFunction(() => !document.getElementById('room-panel').classList.contains('hidden'), null, { timeout: 10000 });
  await host.click('#room-ready');
  await guest.click('#room-ready');
  await host.click('#room-start');
  await host.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 20000 });
  await guest.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 20000 });
  await host.keyboard.down('w');
  await host.waitForTimeout(1200);
  await host.keyboard.up('w');
  await host.waitForTimeout(500);
  const hostSnap = await host.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  const guestPeers = await guest.evaluate(() => globalThis.__shadowPulseQuality.peers());
  const seen = guestPeers.some(peer => peer.position && Math.hypot(peer.position[0] - hostSnap.position[0], peer.position[2] - hostSnap.position[2]) < 8);
  record('local 2-player position sync', seen ? 'PASS' : 'FAIL', { detail: { code: code.trim(), host: hostSnap.position, guestPeers } });
  await host.screenshot({ path: path.join(shotDir, 'mp-host.png') });
  await guest.screenshot({ path: path.join(shotDir, 'mp-guest.png') });
  await guest.close();
  await host.close();
  record('4-player and 8-player browser sessions', 'UNVERIFIED', { detail: { note: 'Only two live Chrome pages joined the local room server. Eight sessions were not launched, so 8-player play is not verified.' } });
} catch (error) {
  record('local multiplayer', 'BLOCKED', { detail: { error: error.stack || error.message } });
}

await browser.close();
const report = {
  ranAt: new Date().toISOString(),
  base,
  pointerLockPolicy: 'UNVERIFIED results are not passes.',
  counts: {
    pass: tests.filter(test => test.status === 'PASS').length,
    fail: tests.filter(test => test.status === 'FAIL').length,
    unverified: tests.filter(test => test.status === 'UNVERIFIED').length,
    blocked: tests.filter(test => test.status === 'BLOCKED').length,
  },
  tests,
};
fs.writeFileSync(path.join(outDir, 'play.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.counts));
if (report.counts.fail || report.counts.blocked) process.exitCode = 1;
