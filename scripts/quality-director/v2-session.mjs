// V2 live session. Reuses the dev probe and the real key/mouse path.
// Pointer lock is recorded from both an ungestured call and a real click.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'shots');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const report = { started: new Date().toISOString(), seed: 20261028, phases: {} };
const pageErrors = [];

function save() {
  fs.writeFileSync(path.join(outDir, 'v2-session.json'), JSON.stringify(report, null, 2));
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', error => pageErrors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });

async function shot(name) {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(root, file);
}

async function playing() {
  return page.evaluate(() => !!globalThis.__shadowPulseQuality?.playing?.());
}

async function waitGrounded(target) {
  await target.waitForFunction(() => {
    const snap = globalThis.__shadowPulseQuality.snapshot();
    return !!snap?.grounded && snap.speed < 8;
  }, null, { timeout: 8000 }).catch(() => {});
}

async function resume() {
  if (await playing()) return 'already';
  const drag = page.locator('#btn-start-drag');
  if (await drag.isVisible().catch(() => false)) await drag.click();
  await page.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 8000 });
  return 'drag';
}

try {
  const t0 = Date.now();
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 90000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 20000 });
  const boot = await page.evaluate(() => globalThis.__shadowPulseQuality.dump());
  report.phases.boot = {
    status: boot.ready && boot.latest?.playing ? 'PASS' : 'FAIL',
    loadMs: Date.now() - t0,
    build: boot.build,
    map: boot.map,
    state: boot.latest?.state,
    errors: boot.errors,
  };
  await shot('v2-boot');

  const panel = await page.evaluate(() => {
    const node = document.getElementById('quality-director-panel');
    const vitals = document.getElementById('combat-status');
    const rect = node?.getBoundingClientRect();
    const vitalsRect = vitals?.getBoundingClientRect();
    const overlap = rect && vitalsRect && !(rect.right < vitalsRect.left || rect.left > vitalsRect.right || rect.bottom < vitalsRect.top || rect.top > vitalsRect.bottom);
    return {
      text: node?.textContent || null,
      top: rect ? Math.round(rect.top) : null,
      right: rect ? Math.round(innerWidth - rect.right) : null,
      width: rect ? Math.round(rect.width) : null,
      vitalsHidden: vitals?.classList.contains('hidden') ?? null,
      overlapsVitals: !!overlap,
    };
  });
  report.phases.panel = { ...panel, shot: await shot('v2-panel'), status: panel.top >= 40 && panel.top <= 56 && panel.right >= 4 && panel.right <= 16 && !panel.overlapsVitals ? 'PASS' : 'FAIL' };

  report.phases.pointerLock = await page.evaluate(async () => {
    const canvas = document.getElementById('webgl-canvas');
    const canvases = [...document.querySelectorAll('canvas')].map(node => ({
      id: node.id || null,
      connected: node.isConnected,
      sameDocument: node.ownerDocument === document,
      width: node.width,
      height: node.height,
    }));
    const env = {
      hasFocus: document.hasFocus(),
      visibility: document.visibilityState,
      webdriver: navigator.webdriver,
      secure: window.isSecureContext,
      protocol: location.protocol,
    };
    let ungestured = null;
    try {
      await canvas.requestPointerLock();
      ungestured = { granted: document.pointerLockElement === canvas };
    } catch (error) {
      ungestured = { granted: false, name: error.name, message: error.message };
    }
    if (document.pointerLockElement) document.exitPointerLock();
    return { canvases, env, ungestured };
  });

  await page.evaluate(() => {
    const canvas = document.getElementById('webgl-canvas');
    canvas.addEventListener('pointerdown', async () => {
      try {
        await canvas.requestPointerLock();
        globalThis.__lockFromGesture = { granted: document.pointerLockElement === canvas, via: 'pointerdown' };
      } catch (error) {
        globalThis.__lockFromGesture = { granted: false, name: error.name, message: error.message, via: 'pointerdown' };
      }
    }, { once: true, capture: true });
  });
  await page.locator('#webgl-canvas').click({ position: { x: 240, y: 220 } });
  await page.waitForTimeout(400);
  report.phases.pointerLock.gesture = await page.evaluate(() => globalThis.__lockFromGesture || { granted: false, message: 'listener did not run' });
  report.phases.pointerLock.afterGesture = await page.evaluate(() => ({
    locked: document.pointerLockElement?.id || null,
    paused: !globalThis.__shadowPulseQuality.playing(),
  }));
  if (report.phases.pointerLock.afterGesture.locked) {
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForTimeout(250);
  }
  await resume();

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const startVisible = await page.locator('#btn-start-game').isVisible().catch(() => false);
  if (startVisible) await page.locator('#btn-start-game').click();
  await page.waitForTimeout(400);
  report.phases.pointerLock.gameButton = {
    startVisible,
    locked: await page.evaluate(() => document.pointerLockElement?.id || null),
    playing: await playing(),
  };
  if (report.phases.pointerLock.gameButton.locked) {
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForTimeout(250);
  }
  await resume();
  const gestureGranted = !!report.phases.pointerLock.gesture?.granted || !!report.phases.pointerLock.gameButton.locked;
  report.phases.pointerLock.status = gestureGranted ? 'PASS' : 'UNVERIFIED';
  await shot('v2-pointer');

  const seek = await page.evaluate(() => globalThis.__shadowPulseQuality.seekWebTarget());
  report.phases.seek = { ...seek, shot: await shot('v2-seek'), status: seek.ok && seek.anchor ? 'PASS' : 'FAIL' };

  await page.evaluate(() => globalThis.__shadowPulseQuality.aim(0, -0.9));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const rays = await page.evaluate(() => globalThis.__shadowPulseQuality.webRays());
  await page.evaluate(() => globalThis.__shadowPulseQuality.begin('dual-web'));
  await page.evaluate(() => {
    globalThis.__shadowPulseQuality.mouse(0, true);
    globalThis.__shadowPulseQuality.mouse(2, true);
  });
  await page.waitForTimeout(800);
  const dualMid = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  const dualShot = await shot('v2-dual-web');
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(2, false));
  await page.waitForTimeout(280);
  const oneHand = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  await page.waitForTimeout(450);
  const dualEnd = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
  const hands = [...new Set((dualMid.webs || []).map(web => web.hand))];
  report.phases.dualWeb = {
    status: dualMid.webs?.length === 2 && hands.length === 2 ? 'PASS' : 'FAIL',
    rays: { anchor: rays.anchor, pitch: rays.pitch, reason: rays.reason, first: rays.hits?.[0] || null },
    mid: { state: dualMid.state, webs: dualMid.webs, speed: dualMid.speed, animation: dualMid.animation, combatMode: dualMid.combatMode },
    afterRightRelease: { state: oneHand.state, webs: oneHand.webs, speed: oneHand.speed },
    summary: dualEnd.summary,
    shot: dualShot,
  };

  await page.evaluate(() => globalThis.__shadowPulseQuality.aim(0, -0.9));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => globalThis.__shadowPulseQuality.begin('second-swing'));
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  await page.waitForTimeout(500);
  const second = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  await page.waitForTimeout(350);
  const secondEnd = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
  report.phases.secondSwing = {
    status: (second.webs?.length || 0) >= 1 ? 'PASS' : 'FAIL',
    webs: second.webs,
    state: second.state,
    speed: second.speed,
    summary: secondEnd.summary,
    shot: await shot('v2-second-swing'),
  };

  const beforeLook = await page.evaluate(() => globalThis.__shadowPulseQuality.cameraClearance());
  await page.evaluate(yaw => globalThis.__shadowPulseQuality.aim(yaw, -0.35), (beforeLook.rigYaw || 0) + 1.4);
  const lookSamples = [await page.evaluate(() => globalThis.__shadowPulseQuality.cameraClearance())];
  await page.waitForTimeout(200);
  lookSamples.push(await page.evaluate(() => globalThis.__shadowPulseQuality.cameraClearance()));
  await page.waitForTimeout(400);
  lookSamples.push(await page.evaluate(() => globalThis.__shadowPulseQuality.cameraClearance()));
  report.phases.cameraLag = { before: beforeLook, samples: lookSamples, shot: await shot('v2-camera-yaw') };

  await waitGrounded(page);
  await page.evaluate(() => globalThis.__shadowPulseQuality.begin('jump-frame'));
  await page.keyboard.down('Space');
  await page.waitForTimeout(80);
  await page.keyboard.up('Space');
  await page.waitForTimeout(1400);
  const jump = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
  report.phases.jump = {
    status: jump.summary.states?.includes('JUMPING') || jump.summary.states?.includes('FALLING') ? 'PASS' : 'FAIL',
    summary: jump.summary,
  };

  await waitGrounded(page);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', true));
  await page.waitForTimeout(200);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  const strikes = [];
  for (const [name, button, key, wait] of [
    ['jab', 0, null, 260],
    ['straight', 2, null, 320],
    ['heavy', null, 'KeyE', 420],
    ['special', null, 'KeyG', 500],
  ]) {
    await resume();
    await page.evaluate(() => globalThis.__shadowPulseQuality.begin(name));
    if (button === null) await page.keyboard.down(key);
    else await page.evaluate(value => globalThis.__shadowPulseQuality.mouse(value, true), button);
    await page.waitForTimeout(wait);
    const mid = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
    const file = await shot(`v2-${name}`);
    if (button === null) await page.keyboard.up(key);
    else await page.evaluate(value => globalThis.__shadowPulseQuality.mouse(value, false), button);
    await page.waitForTimeout(name === 'special' ? 900 : 500);
    const end = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
    strikes.push({ name, attack: mid.attack, animation: mid.animation, state: mid.state, speed: mid.speed, attacks: end.summary.attacks, shot: file });
  }
  report.phases.strikes = strikes;

  await resume();
  await page.evaluate(() => globalThis.__shadowPulseQuality.begin('run-jab'));
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  const runBefore = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  await page.waitForTimeout(220);
  const runJab = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  const runShot = await shot('v2-run-jab');
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  await page.keyboard.up('w');
  await page.waitForTimeout(400);
  const runEnd = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
  report.phases.runJab = {
    before: { speed: runBefore.speed, animation: runBefore.animation, state: runBefore.state },
    during: { speed: runJab.speed, animation: runJab.animation, attack: runJab.attack, state: runJab.state, feet: runJab.feet },
    summary: runEnd.summary,
    shot: runShot,
  };

  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(350);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(280);
  const sprintHook = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  await page.keyboard.up('KeyE');
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  report.phases.sprintHeavy = { attack: sprintHook.attack, animation: sprintHook.animation, speed: sprintHook.speed, state: sprintHook.state, shot: await shot('v2-sprint-heavy') };

  const clearance = [];
  await page.evaluate(() => globalThis.__shadowPulseQuality.aim(0.4, 0.15));
  await page.keyboard.down('w');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(400);
    clearance.push(await page.evaluate(() => {
      const snap = globalThis.__shadowPulseQuality.snapshot();
      return { position: snap.position, state: snap.state, camera: globalThis.__shadowPulseQuality.cameraClearance() };
    }));
  }
  await page.keyboard.up('w');
  report.phases.walkClearance = { samples: clearance, shot: await shot('v2-walk') };

  const rng = mulberry32(report.seed);
  const alphabet = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyQ', 'KeyE', 'KeyG', 'ShiftLeft', 'PageUp', 'PageDown', 'mouse0', 'mouse2'];
  const sequence = Array.from({ length: 36 }, () => alphabet[Math.floor(rng() * alphabet.length)]);
  report.phases.explore = { seed: report.seed, sequence };
  await resume();
  await page.evaluate(() => globalThis.__shadowPulseQuality.begin('explore'));
  for (const code of sequence) {
    if (code.startsWith('mouse')) await page.evaluate(button => globalThis.__shadowPulseQuality.mouse(button, true), code === 'mouse0' ? 0 : 2);
    else await page.keyboard.down(code);
    await page.waitForTimeout(90);
    if (code.startsWith('mouse')) await page.evaluate(button => globalThis.__shadowPulseQuality.mouse(button, false), code === 'mouse0' ? 0 : 2);
    else await page.keyboard.up(code);
  }
  await page.evaluate(() => globalThis.__shadowPulseQuality.release());
  const exploreEnd = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
  const exploreSnap = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  const finite = [exploreSnap.position, exploreSnap.velocity, exploreSnap.speed].flat().every(value => Number.isFinite(value));
  report.phases.explore.status = finite ? 'PASS' : 'FAIL';
  report.phases.explore.summary = exploreEnd.summary;
  report.phases.explore.errors = await page.evaluate(() => globalThis.__shadowPulseQuality.errors());
  report.phases.explore.shot = await shot('v2-explore');
  report.phases.explore.finite = finite;

  report.pageErrors = pageErrors;
  report.finished = new Date().toISOString();
  save();
  console.log(JSON.stringify({
    boot: report.phases.boot.status,
    panel: report.phases.panel.status,
    lock: report.phases.pointerLock.status,
    seek: report.phases.seek.status,
    dual: report.phases.dualWeb.status,
    second: report.phases.secondSwing.status,
    jump: report.phases.jump.status,
    explore: report.phases.explore.status,
    jumpMaxDt: report.phases.jump.summary?.maxDt,
    dualWebs: report.phases.dualWeb.mid?.webs?.length,
  }, null, 2));
} catch (error) {
  report.fatal = String(error?.stack || error);
  report.pageErrors = pageErrors;
  save();
  console.error(report.fatal);
  process.exitCode = 1;
} finally {
  await browser.close();
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
