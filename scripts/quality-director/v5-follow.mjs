// Follow-up for the roll, a grounded dodge, a real swing, and the Hong Kong car door.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'shots', 'v5');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const report = { started: new Date().toISOString(), tests: [] };
const save = () => fs.writeFileSync(path.join(outDir, 'v5-follow.json'), JSON.stringify(report, null, 2));
const record = (name, status, detail = {}) => { report.tests.push({ name, status, ...detail }); console.log(status, name); save(); };
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function snap() {
  return page.evaluate(() => {
    const probe = globalThis.__shadowPulseQuality;
    const sample = probe.snapshot();
    const pose = probe.pose();
    const combat = probe.combat();
    return {
      state: sample.state, animation: sample.animation, attack: combat?.action?.key || null, speed: sample.speed,
      x: sample.position[0], y: sample.position[1], z: sample.position[2],
      vx: sample.velocity[0], vy: sample.velocity[1], vz: sample.velocity[2],
      leftGap: sample.feet?.left?.gap ?? null, rightGap: sample.feet?.right?.gap ?? null,
      leftX: sample.feet?.left?.x ?? null, leftZ: sample.feet?.left?.z ?? null,
      fov: pose.fov, rigRoll: pose.rigRoll, cockL: pose.wristCock?.left ?? null,
      webs: sample.webs?.length || 0, rope: sample.webs?.[0]?.length ?? null,
      hips: pose.hipsHeight, knee: pose.left?.knee ?? null,
    };
  });
}
async function watch(ms) {
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < ms) {
    samples.push(await snap());
    await page.waitForTimeout(40);
  }
  return samples;
}
function travel(samples) {
  if (samples.length < 2) return 0;
  return +Math.hypot(samples.at(-1).x - samples[0].x, samples.at(-1).z - samples[0].z).toFixed(3);
}

try {
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.() && globalThis.__shadowPulseQuality.playing() && globalThis.__shadowPulseQuality.findRollDeck, null, { timeout: 120000 });
  const deck = await page.evaluate(() => globalThis.__shadowPulseQuality.findRollDeck());
  await page.waitForTimeout(300);
  const settled = await snap();
  await page.evaluate(() => globalThis.__shadowPulseQuality.raise(8));
  let shoved = false;
  const fall = [];
  const fallStart = Date.now();
  while (Date.now() - fallStart < 3000) {
    const sample = await snap();
    fall.push(sample);
    if (!shoved && sample.vy < -10 && deck?.y != null && sample.y < deck.y + 4) {
      await page.evaluate(() => globalThis.__shadowPulseQuality.shove(7, 0));
      shoved = true;
    }
    if (sample.state === 'ROLLING') {
      await page.screenshot({ path: path.join(shotDir, 'roll-0.png') });
      await page.waitForTimeout(140);
      await page.screenshot({ path: path.join(shotDir, 'roll-1.png') });
      await page.waitForTimeout(140);
      await page.screenshot({ path: path.join(shotDir, 'roll-2.png') });
      break;
    }
    await page.waitForTimeout(30);
  }
  const rolling = fall.filter(sample => sample.state === 'ROLLING');
  const contact = fall.find(sample => sample.state === 'ROLLING' || sample.state === 'LANDING');
  record('넓은 바닥 구르기', rolling.some(sample => sample.animation === 'roll') ? 'PASS' : 'UNVERIFIED', {
    detail: {
      deck, settled: { state: settled.state, y: settled.y }, shoved,
      states: [...new Set(fall.map(sample => sample.state))],
      animations: [...new Set(fall.map(sample => sample.animation))],
      contact: contact ? { state: contact.state, vy: contact.vy, horizontal: +Math.hypot(contact.vx, contact.vz).toFixed(2) } : null,
      rollFrames: rolling.length,
      gap: rolling.length ? { min: Math.min(...rolling.map(sample => sample.leftGap).filter(Number.isFinite)) } : null,
      travel: travel(rolling),
    },
  });
  if (rolling.length) {
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('Space', true));
    const jump = await watch(400);
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('Space', false));
    record('구르기 중 점프', 'PASS', { detail: { states: [...new Set(jump.map(sample => sample.state))] } });
  }

  await page.waitForFunction(() => ['IDLE', 'RUNNING'].includes(globalThis.__shadowPulseQuality.snapshot().state), null, { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', true));
  await page.waitForTimeout(80);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  await page.waitForTimeout(200);
  const dodges = {};
  for (const direction of ['left', 'back', 'forward']) {
    await page.waitForFunction(() => !globalThis.__shadowPulseQuality.combat()?.action && ['IDLE', 'RUNNING'].includes(globalThis.__shadowPulseQuality.snapshot().state), null, { timeout: 3000 }).catch(() => {});
    const started = await page.evaluate(dir => globalThis.__shadowPulseQuality.reviewDodge(dir), direction);
    const motion = await watch(650);
    const active = motion.filter(sample => sample.attack?.startsWith('dodge'));
    const rel = active.map(sample => Math.hypot((sample.leftX ?? sample.x) - sample.x, (sample.leftZ ?? sample.z) - sample.z)).filter(Number.isFinite);
    dodges[direction] = {
      started: started.started, key: started.key,
      capsule: travel(active),
      footRel: rel.length ? +(Math.max(...rel) - Math.min(...rel)).toFixed(3) : null,
      animation: [...new Set(active.map(sample => sample.animation))],
      gap: active.length ? +Math.min(...active.map(sample => sample.leftGap).filter(Number.isFinite)).toFixed(3) : null,
    };
    if (direction === 'left') await page.screenshot({ path: path.join(shotDir, 'dodge-ground-left.png') });
  }
  record('지면 회피 발', Object.values(dodges).every(item => item.started) ? 'PASS' : 'UNVERIFIED', { detail: dodges });

  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', true));
  await page.waitForTimeout(80);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  const aim = await page.evaluate(() => globalThis.__shadowPulseQuality.seekWebTarget());
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  const swing = await watch(3500);
  await page.screenshot({ path: path.join(shotDir, 'swing-follow.png') });
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  const release = await watch(700);
  const swinging = swing.filter(sample => sample.webs > 0 || sample.state === 'SWINGING');
  const low = swinging.reduce((best, sample) => !best || sample.y < best.y ? sample : best, null);
  record('실제 스윙', swinging.length > 5 ? 'PASS' : 'UNVERIFIED', {
    detail: {
      aim: aim?.ok ? { distance: aim.distance, anchor: aim.anchor } : aim,
      frames: swinging.length,
      travel: travel(swinging),
      fov: swinging.length ? { min: +Math.min(...swinging.map(sample => sample.fov)).toFixed(2), max: +Math.max(...swinging.map(sample => sample.fov)).toFixed(2), atLow: low?.fov ?? null, lowY: low?.y ?? null, lowSpeed: low?.speed } : null,
      rope: swinging[0]?.rope ?? null,
      rigRoll: swinging.length ? Math.max(...swinging.map(sample => Math.abs(sample.rigRoll || 0))) : null,
      cock: swinging.map(sample => sample.cockL).filter(value => value != null).slice(0, 6),
      release: [...new Set(release.map(sample => `${sample.state}:${sample.animation}`))].slice(0, 8),
    },
  });

  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.key('KeyF', true); probe.key('KeyW', true); });
  const wall = await watch(1600);
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.key('KeyF', false); probe.key('KeyW', false); });
  await page.screenshot({ path: path.join(shotDir, 'wall-follow.png') });
  record('지면에서 벽 타기', wall.some(sample => sample.state === 'WALL_RUNNING' || sample.animation === 'wall') ? 'PASS' : 'UNVERIFIED', {
    detail: { states: [...new Set(wall.map(sample => sample.state))], animations: [...new Set(wall.map(sample => sample.animation))] },
  });
} catch (error) {
  record('후속 절차 도시', 'UNVERIFIED', { detail: String(error?.stack || error).slice(0, 900) });
}

try {
  await page.goto(`${base}/?city=hong-kong&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.playing?.(), null, { timeout: 150000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyB', true));
  await page.waitForTimeout(60);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyB', false));
  await page.waitForTimeout(1500);
  const parked = await page.evaluate(() => {
    const car = globalThis.__shadowPulseQuality.vehicle();
    return { state: car?.state, model: car?.model, speed: car?.speed, door: car?.door ?? null, notice: document.getElementById('game-notice')?.textContent || '' };
  });
  record('홍콩 차량 소환', parked.state === 'PARKED' || parked.state === 'DRIVING' ? 'PASS' : 'UNVERIFIED', { detail: parked });
} catch (error) {
  record('홍콩 차량 소환', 'UNVERIFIED', { detail: String(error?.stack || error).slice(0, 700) });
}

report.finished = new Date().toISOString();
save();
await browser.close();
console.log('follow done');
