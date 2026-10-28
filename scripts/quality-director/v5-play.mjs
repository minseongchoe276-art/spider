// V5 Chrome play. Seed 20261028. Does not change combat numbers or dodge speeds.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'shots', 'v5');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const report = { started: new Date().toISOString(), seed: 20261028, build: null, tests: [] };
const save = () => fs.writeFileSync(path.join(outDir, 'v5-live.json'), JSON.stringify(report, null, 2));
const record = (name, status, detail = {}) => {
  report.tests.push({ name, status, ...detail });
  console.log(status, name);
  save();
};

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function snap() {
  return page.evaluate(() => {
    const probe = globalThis.__shadowPulseQuality;
    const sample = probe.snapshot();
    const pose = probe.pose();
    const combat = probe.combat();
    return {
      state: sample.state,
      animation: sample.animation,
      blends: sample.blends?.map(item => item.key),
      attack: combat?.action?.key || null,
      speed: sample.speed,
      vx: sample.velocity[0], vy: sample.velocity[1], vz: sample.velocity[2],
      x: sample.position[0], y: sample.position[1], z: sample.position[2],
      support: sample.support,
      leftX: sample.feet?.left?.x ?? null, leftY: sample.feet?.left?.y ?? null, leftZ: sample.feet?.left?.z ?? null,
      rightX: sample.feet?.right?.x ?? null, rightY: sample.feet?.right?.y ?? null, rightZ: sample.feet?.right?.z ?? null,
      leftGap: sample.feet?.left?.gap ?? null, rightGap: sample.feet?.right?.gap ?? null,
      hips: pose.hipsHeight, knee: pose.left?.knee ?? null,
      fov: pose.fov, rigRoll: pose.rigRoll, eulerRoll: pose.roll,
      cockL: pose.wristCock?.left ?? null, cockR: pose.wristCock?.right ?? null,
      webs: sample.webs?.length || 0,
      rope: sample.webs?.[0]?.length ?? null,
      anchor: sample.webs?.[0]?.anchor ?? null,
      camDist: sample.camera ? Math.hypot(sample.camera.position[0] - sample.position[0], sample.camera.position[1] - sample.position[1], sample.camera.position[2] - sample.position[2]) : null,
      yaw: sample.camera?.yaw ?? null,
      pitch: sample.camera?.pitch ?? null,
    };
  });
}
async function watch(ms, shotName = null) {
  const samples = [];
  const start = Date.now();
  let shots = 0;
  while (Date.now() - start < ms) {
    const sample = await snap();
    samples.push(sample);
    if (shotName && sample.state === 'ROLLING' && shots < 4) {
      await page.screenshot({ path: path.join(shotDir, `${shotName}-${shots}.png`) });
      shots += 1;
    }
    await page.waitForTimeout(45);
  }
  return samples;
}
function span(samples, key) {
  const values = samples.map(sample => sample[key]).filter(value => Number.isFinite(value));
  if (!values.length) return null;
  return { min: +Math.min(...values).toFixed(3), max: +Math.max(...values).toFixed(3) };
}
function travel(samples) {
  if (samples.length < 2) return 0;
  const a = samples[0];
  const b = samples.at(-1);
  return +Math.hypot(b.x - a.x, b.z - a.z).toFixed(3);
}
function footSlide(samples) {
  const moved = travel(samples);
  const rel = samples.map(sample => Math.hypot((sample.leftX ?? sample.x) - sample.x, (sample.leftZ ?? sample.z) - sample.z));
  const finite = rel.filter(value => Number.isFinite(value));
  const range = finite.length ? Math.max(...finite) - Math.min(...finite) : null;
  return {
    capsule: moved,
    footRel: range === null ? null : +range.toFixed(3),
    gap: span(samples, 'leftGap'),
    animations: [...new Set(samples.map(sample => sample.animation))],
    attacks: [...new Set(samples.map(sample => sample.attack).filter(Boolean))],
  };
}
async function combatMode(on) {
  const mode = await page.evaluate(() => globalThis.__shadowPulseQuality.combat()?.mode);
  if ((mode === 'combat') === on) return;
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', true));
  await page.waitForTimeout(80);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  await page.waitForTimeout(180);
}
async function clearAction() {
  await page.waitForFunction(() => !globalThis.__shadowPulseQuality.combat()?.action, null, { timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(120);
}

try {
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.() && globalThis.__shadowPulseQuality.playing(), null, { timeout: 120000 });
  report.build = await page.evaluate(() => globalThis.__shadowPulseQuality.build);
  const motions = await page.evaluate(() => globalThis.__shadowPulseQuality.motions());
  record('모션 카탈로그', motions.roll && !motions.dodgeLeft ? 'PASS' : 'UNVERIFIED', {
    detail: {
      roll: motions.roll, dodgeLeft: motions.dodgeLeft, dodgeForward: motions.dodgeForward,
      fallVariant: motions.fallVariant, land: motions.land,
    },
  });

  await combatMode(false);
  await page.evaluate(() => globalThis.__shadowPulseQuality.raise(16));
  await page.waitForTimeout(140);
  await page.evaluate(() => globalThis.__shadowPulseQuality.shove(8, 0));
  const roll = await watch(2600, 'roll');
  const rolling = roll.filter(sample => sample.state === 'ROLLING');
  const landed = roll.find(sample => sample.state === 'LANDING' || sample.state === 'ROLLING');
  record('빠른 수평 착지 구르기', rolling.length && rolling.some(sample => sample.animation === 'roll') ? 'PASS' : 'UNVERIFIED', {
    detail: {
      frames: rolling.length,
      animations: [...new Set(roll.map(sample => sample.animation))],
      states: [...new Set(roll.map(sample => sample.state))],
      impactVy: landed ? landed.vy : null,
      horizontal: landed ? +Math.hypot(landed.vx, landed.vz).toFixed(2) : null,
      gap: span(rolling, 'leftGap'),
      hips: span(rolling, 'hips'),
      travel: travel(rolling),
    },
  });

  if (rolling.length) {
    await page.evaluate(() => globalThis.__shadowPulseQuality.raise(16));
    await page.waitForTimeout(140);
    await page.evaluate(() => globalThis.__shadowPulseQuality.shove(8, 0));
    await page.waitForFunction(() => globalThis.__shadowPulseQuality.snapshot().state === 'ROLLING', null, { timeout: 2500 }).catch(() => {});
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', true));
    const during = await watch(700);
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', false));
    const cancelled = during.some(sample => sample.state !== 'ROLLING' && during[0]?.state === 'ROLLING');
    record('구르기 중 이동 입력', during.some(sample => sample.state === 'ROLLING') ? 'PASS' : 'UNVERIFIED', {
      detail: { states: [...new Set(during.map(sample => sample.state))], leftEarly: cancelled },
    });
  } else record('구르기 중 이동 입력', 'UNVERIFIED', { detail: 'roll did not start' });

  await page.evaluate(() => { globalThis.__shadowPulseQuality.release(); });
  await combatMode(true);
  await clearAction();
  const dodges = {};
  for (const direction of ['left', 'right', 'back', 'forward']) {
    await clearAction();
    const started = await page.evaluate(dir => globalThis.__shadowPulseQuality.reviewDodge(dir), direction);
    const motion = await watch(700);
    if (direction === 'left') await page.screenshot({ path: path.join(shotDir, 'dodge-left.png') });
    dodges[direction] = { started, slide: footSlide(motion.filter(sample => sample.attack?.startsWith('dodge') || sample.animation === 'combatIdle')), states: [...new Set(motion.map(sample => sample.state))] };
  }
  record('회피 발과 이동', Object.values(dodges).every(item => item.started?.started) ? 'PASS' : 'UNVERIFIED', { detail: dodges });

  await clearAction();
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  const jab = await watch(650);
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  await page.screenshot({ path: path.join(shotDir, 'jab-idle.png') });
  record('정지 잽 발', jab.some(sample => sample.attack === 'jab') ? 'PASS' : 'UNVERIFIED', { detail: footSlide(jab) });

  await clearAction();
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', true));
  await page.waitForTimeout(280);
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  const runJab = await watch(700);
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.mouse(0, false); probe.key('KeyW', false); });
  record('달리기 잽 발', runJab.some(sample => sample.attack === 'jab') ? 'PASS' : 'UNVERIFIED', { detail: footSlide(runJab) });

  await clearAction();
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('ShiftLeft', true));
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', true));
  await page.waitForTimeout(280);
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  const sprint = await watch(700);
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.mouse(0, false); probe.key('KeyW', false); probe.key('ShiftLeft', false); });
  record('질주 잽', sprint.some(sample => sample.attack === 'jab') ? 'PASS' : 'UNVERIFIED', { detail: footSlide(sprint) });

  await clearAction();
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', true));
  await page.waitForTimeout(240);
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(2, true));
  const cross = await watch(700);
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.mouse(2, false); probe.key('KeyW', false); });
  record('달리기 크로스', cross.some(sample => sample.attack === 'cross') ? 'PASS' : 'UNVERIFIED', { detail: footSlide(cross) });

  await clearAction();
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', true));
  await page.waitForTimeout(240);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyE', true));
  const heavy = await watch(800);
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.key('KeyE', false); probe.key('KeyW', false); });
  record('달리기 헤비', heavy.some(sample => sample.attack === 'heavy') ? 'PASS' : 'UNVERIFIED', { detail: footSlide(heavy) });

  await combatMode(false);
  const far = await page.evaluate(() => globalThis.__shadowPulseQuality.seekFarAnchor());
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  const swing = await watch(4000);
  await page.screenshot({ path: path.join(shotDir, 'swing-arc.png') });
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  const release = await watch(900);
  const swinging = swing.filter(sample => sample.state === 'SWINGING' || sample.webs > 0);
  const low = swinging.reduce((best, sample) => sample.y < best.y ? sample : best, swinging[0] || null);
  record('스윙 궤적과 FOV', swinging.length > 8 ? 'PASS' : 'UNVERIFIED', {
    detail: {
      far,
      frames: swinging.length,
      travel: travel(swinging),
      fov: span(swinging, 'fov'),
      fovAtLow: low ? { y: low.y, fov: low.fov, speed: low.speed } : null,
      rope: span(swinging, 'rope'),
      rigRoll: span(swinging, 'rigRoll'),
      cock: span(swinging, 'cockL'),
      cam: span(swinging, 'camDist'),
      release: [...new Set(release.map(sample => `${sample.state}:${sample.animation}`))].slice(0, 8),
    },
  });

  await page.evaluate(() => globalThis.__shadowPulseQuality.key('Space', true));
  await page.waitForTimeout(40);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('Space', false));
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  const jumpWeb = await watch(500);
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  record('점프 후 와이어 첫 구간', jumpWeb.some(sample => sample.state === 'JUMPING' || sample.webs > 0) ? 'PASS' : 'UNVERIFIED', {
    detail: { states: [...new Set(jumpWeb.map(sample => sample.state))], animations: [...new Set(jumpWeb.map(sample => sample.animation))], cock: span(jumpWeb, 'cockL') },
  });

  const wallAim = await page.evaluate(() => globalThis.__shadowPulseQuality.seekWebTarget());
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.key('KeyF', true); probe.key('KeyW', true); });
  const wall = await watch(900);
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.key('KeyF', false); probe.key('KeyW', false); });
  await page.screenshot({ path: path.join(shotDir, 'wall.png') });
  record('벽 타기 전환', wall.some(sample => sample.state === 'WALL_RUNNING') ? 'PASS' : 'UNVERIFIED', {
    detail: { aim: wallAim?.ok ?? false, states: [...new Set(wall.map(sample => sample.state))], animations: [...new Set(wall.map(sample => sample.animation))] },
  });

  const seed = 20261028;
  const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE', 'KeyF', 'KeyG'];
  let value = seed;
  const sequence = [];
  for (let step = 0; step < 24; step++) {
    value = (value * 1664525 + 1013904223) >>> 0;
    const code = keys[value % keys.length];
    sequence.push(code);
    await page.evaluate(name => globalThis.__shadowPulseQuality.key(name, true), code);
    await page.waitForTimeout(60);
    await page.evaluate(name => globalThis.__shadowPulseQuality.key(name, false), code);
  }
  const after = await snap();
  const finite = [after.x, after.y, after.z].every(Number.isFinite);
  record('시드 입력', finite ? 'PASS' : 'FAIL', { detail: { seed, sequence, position: [after.x, after.y, after.z], state: after.state } });
  const counts = await page.evaluate(() => globalThis.__shadowPulseQuality.dump());
  record('사운드·VFX 호출', 'UNVERIFIED', { detail: { audio: counts.audioCounts, vfx: counts.vfxCounts, note: 'counts only; timbre was not heard' } });
} catch (error) {
  record('절차 도시 플레이', 'UNVERIFIED', { detail: String(error?.stack || error).slice(0, 900) });
}

try {
  await page.goto(`${base}/?city=hong-kong&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.() && globalThis.__shadowPulseQuality.playing(), null, { timeout: 150000 });
  await page.waitForFunction(() => (globalThis.__shadowPulseQuality.citizens()?.count || 0) > 0, null, { timeout: 20000 }).catch(() => {});
  const before = await page.evaluate(() => globalThis.__shadowPulseQuality.citizens());
  const approached = await page.evaluate(() => globalThis.__shadowPulseQuality.approachCitizen());
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, 'hong-kong-citizen.png') });
  const visible = approached?.ok === true;
  record('홍콩 시민 접근', before?.count > 0 && visible ? 'PASS' : 'UNVERIFIED', { detail: { count: before?.count || 0, approached } });

  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyB', true));
  await page.waitForTimeout(80);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyB', false));
  await page.waitForTimeout(1200);
  const parked = await page.evaluate(() => globalThis.__shadowPulseQuality.vehicle());
  await page.screenshot({ path: path.join(shotDir, 'hong-kong-vehicle.png') });
  if (parked?.state === 'PARKED' || parked?.state === 'DRIVING') {
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyB', true));
    await page.waitForTimeout(80);
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyB', false));
    await page.waitForTimeout(500);
    const spinBefore = await page.evaluate(() => globalThis.__shadowPulseQuality.vehicle()?.wheels?.map(wheel => wheel.spin) || []);
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', true));
    await page.waitForTimeout(900);
    const driving = await page.evaluate(() => globalThis.__shadowPulseQuality.vehicle());
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', false));
    await page.screenshot({ path: path.join(shotDir, 'hong-kong-drive.png') });
    record('홍콩 차량', driving?.state === 'DRIVING' || (driving?.speed || 0) > 0.2 ? 'PASS' : 'UNVERIFIED', {
      detail: { parked: parked.state, model: parked.model, driving: driving?.state, speed: driving?.speed, spinBefore, spin: driving?.wheels?.map(wheel => wheel.spin), contact: driving?.wheels?.map(wheel => wheel.contactY) },
    });
  } else {
    record('홍콩 차량', 'UNVERIFIED', { detail: { state: parked?.state || null, model: parked?.model || null, reason: 'summon did not park' } });
  }
} catch (error) {
  record('홍콩 시민·차량', 'UNVERIFIED', { detail: String(error?.stack || error).slice(0, 900) });
}

try {
  const host = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const guest = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  async function boot(target, name) {
    await target.goto(`${base}/?city=procedural&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await target.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 120000 });
    await target.evaluate(player => {
      document.getElementById('player-name').value = player;
      document.querySelector('[data-mode="custom"]')?.click();
      document.getElementById('room-capacity').value = '2';
    }, name);
  }
  await boot(host, 'V5Host');
  await boot(guest, 'V5Guest');
  await host.evaluate(() => document.getElementById('create-room').click());
  await host.waitForFunction(() => (document.getElementById('room-code-display')?.textContent || '').trim().length >= 4, null, { timeout: 15000 });
  const code = (await host.locator('#room-code-display').innerText()).trim();
  await guest.evaluate(value => { document.getElementById('room-code').value = value; document.getElementById('join-code').click(); }, code);
  await guest.waitForFunction(() => !document.getElementById('room-panel').classList.contains('hidden'), null, { timeout: 15000 });
  await host.evaluate(() => document.getElementById('room-ready').click());
  await guest.evaluate(() => document.getElementById('room-ready').click());
  await host.waitForTimeout(500);
  await host.evaluate(() => document.getElementById('room-start').click());
  await host.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 20000 });
  await guest.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 20000 });
  for (const target of [host, guest]) {
    await target.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', true));
    await target.waitForTimeout(60);
    await target.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  }
  await host.waitForTimeout(250);
  const hostPos = await host.evaluate(() => globalThis.__shadowPulseQuality.snapshot().position);
  const guestPos = await guest.evaluate(() => globalThis.__shadowPulseQuality.snapshot().position);
  const apart = Math.hypot(hostPos[0] - guestPos[0], hostPos[2] - guestPos[2]);
  await host.evaluate(() => globalThis.__shadowPulseQuality.key('KeyG', true));
  await host.waitForTimeout(80);
  await host.evaluate(() => globalThis.__shadowPulseQuality.key('KeyG', false));
  await host.waitForTimeout(700);
  const peers = await guest.evaluate(() => globalThis.__shadowPulseQuality.peers());
  const room = await guest.evaluate(() => globalThis.__shadowPulseQuality.room());
  const hostRoom = await host.evaluate(() => globalThis.__shadowPulseQuality.room());
  const synced = peers.some(peer => peer.combat?.key === 'special' || peer.network?.key === 'special');
  record('로컬 2인 어퍼컷 모션', synced ? 'PASS' : 'UNVERIFIED', {
    detail: { code, apart: +apart.toFixed(2), peers, guestRoom: room, hostNotice: hostRoom?.notice || '', hostHealth: hostRoom?.health, guestHealth: room?.health },
  });
  await host.close();
  await guest.close();
} catch (error) {
  record('로컬 2인 전투', 'UNVERIFIED', { detail: String(error?.stack || error).slice(0, 900) });
}

report.finished = new Date().toISOString();
save();
await browser.close();
console.log('V5 play finished', report.tests.length);
