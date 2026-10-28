// Drives the local dev server in Chrome and records vehicle and citizen evidence.
// Pointer lock is not required. Camera aim uses the same yaw the follow camera writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'vehicle-pedestrian');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const seed = 20261028;
const report = { seed, base, started: new Date().toISOString(), cities: {}, consoleErrors: [], shots: [] };

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: shotDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
page.on('pageerror', error => report.consoleErrors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });

async function keepPlaying() {
  try { await page.bringToFront(); } catch { /* window may already be front */ }
  const state = await pageState();
  if (!state.begin || state.playing) return state;
  const button = page.locator('#btn-start-game');
  if (await button.count()) await button.click({ timeout: 2000 }).catch(() => {});
  return pageState();
}
async function shot(name) {
  await keepPlaying();
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file });
  report.shots.push(path.relative(root, file));
  return file;
}
async function pageState() {
  return page.evaluate(() => {
    const quality = globalThis.__shadowPulseQuality;
    const loading = document.getElementById('loading-screen');
    const overlay = document.getElementById('overlay-click-to-play');
    return {
      href: location.href,
      begin: typeof quality?.begin === 'function',
      ready: !!quality?.ready?.(),
      playing: !!quality?.playing?.(),
      loadingHidden: !!loading?.classList.contains('hidden'),
      overlayHidden: !!overlay?.classList.contains('hidden'),
      build: quality?.build || null,
    };
  }).catch(error => ({ error: String(error) }));
}
async function ready(timeout = 90000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    last = await pageState();
    if (last.begin && last.ready && !last.playing) {
      try { await page.click('#btn-start-drag', { timeout: 1500 }); } catch { /* overlay may already be gone */ }
    }
    if (last.begin && last.ready && last.playing && last.loadingHidden) return last;
    await page.waitForTimeout(400);
  }
  throw new Error(`ready timeout ${JSON.stringify(last)}`);
}
async function ensurePlaying() {
  const state = await pageState();
  if (state.playing && state.overlayHidden && state.loadingHidden) return;
  await page.click('#btn-start-drag');
  await ready(20000);
}
const CODE = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', ' ': 'Space', b: 'KeyB' };
async function down(key) {
  const code = CODE[key] || key;
  await page.evaluate(code => {
    const quality = globalThis.__shadowPulseQuality;
    quality.key(code, false);
    quality.key(code, true);
  }, code);
}
async function up(key) {
  const code = CODE[key] || key;
  await page.evaluate(code => globalThis.__shadowPulseQuality.key(code, false), code);
}
async function tap(key) {
  await down(key);
  await page.waitForTimeout(50);
  await up(key);
}
async function hold(key, ms) {
  await down(key);
  await page.waitForTimeout(ms);
  await up(key);
}
async function vehicle() { return page.evaluate(() => globalThis.__shadowPulseQuality.vehicle()); }
async function citizens() { return page.evaluate(() => globalThis.__shadowPulseQuality.citizens()); }
async function release() { await page.evaluate(() => globalThis.__shadowPulseQuality.release()); }
async function sampleWhile(ms, every = 120, withCitizens = false) {
  const samples = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await keepPlaying();
    const state = await pageState();
    if (!state.begin || !state.playing || !state.loadingHidden) {
      samples.push({ t: Date.now(), api: false, href: state.href || null, error: state.error || null });
    } else {
      const row = { t: Date.now(), api: true, ...(await vehicle() || {}) };
      if (withCitizens) row.citizens = await citizens();
      samples.push(row);
    }
    await page.waitForTimeout(every);
  }
  return samples;
}
function pathOf(samples) {
  let distance = 0;
  let yaw = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].position;
    const b = samples[i].position;
    if (!a || !b) continue;
    distance += Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (Number.isFinite(samples[i].yaw) && Number.isFinite(samples[i - 1].yaw)) {
      yaw += Math.atan2(Math.sin(samples[i].yaw - samples[i - 1].yaw), Math.cos(samples[i].yaw - samples[i - 1].yaw));
    }
  }
  const first = samples.find(sample => Number.isFinite(sample.spin));
  const last = [...samples].reverse().find(sample => Number.isFinite(sample.spin));
  const radius = samples.find(sample => sample.wheelRadius > 0)?.wheelRadius || null;
  const spin = first && last ? last.spin - first.spin : 0;
  const speeds = samples.map(sample => sample.speed).filter(Number.isFinite);
  const pitches = samples.map(sample => sample.pitch).filter(Number.isFinite);
  const rolls = samples.map(sample => sample.roll).filter(Number.isFinite);
  const contacts = {};
  for (const sample of samples) {
    (sample.wheels || []).forEach((wheel, index) => {
      const gap = wheel.contactY == null || sample.groundY == null ? null : wheel.contactY - sample.groundY;
      const bucket = contacts[index] || (contacts[index] = { front: wheel.front, radius: wheel.radius, axle: wheel.axle, gaps: [], steers: [], spins: [], errors: [], fixed: [] });
      if (gap != null) bucket.gaps.push(gap);
      bucket.steers.push(wheel.steer);
      bucket.spins.push(wheel.spin);
      if (Number.isFinite(wheel.commandError)) bucket.errors.push(Math.abs(wheel.commandError));
      if (wheel.fixedLocal) bucket.fixed.push(wheel.fixedLocal);
    });
  }
  const wheels = Object.entries(contacts).map(([index, bucket]) => {
    const gapSpan = bucket.gaps.length ? Math.max(...bucket.gaps) - Math.min(...bucket.gaps) : null;
    let fixedDrift = 0;
    for (let i = 1; i < bucket.fixed.length; i++) {
      const a = bucket.fixed[i - 1];
      const b = bucket.fixed[i];
      fixedDrift = Math.max(fixedDrift, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    return {
      index: Number(index),
      front: bucket.front,
      radius: bucket.radius,
      axle: bucket.axle,
      hasFixed: bucket.fixed.length > 0,
      commandErrorMax: bucket.errors.length ? +Math.max(...bucket.errors).toFixed(4) : null,
      contactGapMin: bucket.gaps.length ? +Math.min(...bucket.gaps).toFixed(3) : null,
      contactGapMax: bucket.gaps.length ? +Math.max(...bucket.gaps).toFixed(3) : null,
      contactSpan: gapSpan == null ? null : +gapSpan.toFixed(3),
      steerMin: +Math.min(...bucket.steers).toFixed(3),
      steerMax: +Math.max(...bucket.steers).toFixed(3),
      spinDelta: +(bucket.spins.at(-1) - bucket.spins[0]).toFixed(3),
      fixedDrift: +fixedDrift.toFixed(4),
    };
  });
  return {
    live: samples.filter(sample => sample.api !== false && sample.position).length,
    apiMiss: samples.filter(sample => sample.api === false).length,
    samples: samples.length,
    distance: +distance.toFixed(3),
    yaw: +yaw.toFixed(3),
    spin: +spin.toFixed(3),
    arc: radius == null ? null : +Math.abs(spin * radius).toFixed(3),
    radius,
    slip: radius == null ? null : +((distance - Math.abs(spin * radius))).toFixed(3),
    maxSpeed: speeds.length ? +Math.max(...speeds.map(Math.abs)).toFixed(3) : 0,
    endSpeed: speeds.length ? +speeds.at(-1).toFixed(3) : 0,
    pitch: pitches.length ? [+Math.min(...pitches).toFixed(4), +Math.max(...pitches).toFixed(4)] : null,
    roll: rolls.length ? [+Math.min(...rolls).toFixed(4), +Math.max(...rolls).toFixed(4)] : null,
    wheels,
  };
}
function citizenTrail(frames) {
  const byId = new Map();
  for (const frame of frames) {
    for (const person of frame.people || []) {
      const trail = byId.get(person.id) || [];
      trail.push(person);
      byId.set(person.id, trail);
    }
  }
  const people = [];
  let teleport = 0;
  let offPath = 0;
  let samples = 0;
  for (const [id, trail] of byId) {
    let travel = 0;
    for (let i = 1; i < trail.length; i++) {
      const step = Math.hypot(trail[i].x - trail[i - 1].x, trail[i].z - trail[i - 1].z);
      travel += step;
      if (step > 3) teleport++;
      samples++;
      if (trail[i].allows === false) offPath++;
    }
    const anchors = trail.map(person => person.anchor).filter(value => value != null);
    people.push({
      id,
      states: [...new Set(trail.map(person => person.state))],
      anims: [...new Set(trail.map(person => person.anim).filter(Boolean))],
      travel: +travel.toFixed(2),
      allowsFalse: trail.filter(person => person.allows === false).length,
      samples: trail.length,
      anchorMin: anchors.length ? Math.min(...anchors) : null,
      anchorMax: anchors.length ? Math.max(...anchors) : null,
      anchorMissing: trail.filter(person => person.anchor === null).length,
    });
  }
  return { people, teleport, offPath, samples };
}

async function summonAndEnter() {
  await release();
  await tap('b');
  await page.waitForFunction(() => {
    const vehicle = globalThis.__shadowPulseQuality.vehicle();
    return vehicle && (vehicle.state === 'PARKED' || vehicle.state === 'DRIVING' || vehicle.loading);
  }, null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const vehicle = globalThis.__shadowPulseQuality.vehicle();
    return vehicle && vehicle.state === 'PARKED' && vehicle.position;
  }, null, { timeout: 20000 });
  const spawned = await page.evaluate(() => {
    const quality = globalThis.__shadowPulseQuality;
    const car = quality.vehicle();
    const player = quality.snapshot();
    return { door: car?.door ?? null, car: car?.position || null, player: player?.position || null };
  });
  report.approaches = report.approaches || [];
  report.approaches.push({ phase: 'spawned', ...spawned });
  let lastDoor = null;
  for (let step = 0; step < 90; step++) {
    const aim = await page.evaluate(() => {
      const quality = globalThis.__shadowPulseQuality;
      const car = quality.vehicle();
      const player = quality.snapshot();
      if (!car?.position || !player?.position) return { door: car?.door ?? null };
      const desired = Math.atan2(car.position[0] - player.position[0], car.position[2] - player.position[2]);
      quality.aim(desired, 0.2);
      return { door: car.door };
    });
    lastDoor = aim.door;
    if (aim.door != null && aim.door < 2.15) break;
    await hold('w', 400);
  }
  const arrived = await page.evaluate(() => {
    const quality = globalThis.__shadowPulseQuality;
    const car = quality.vehicle();
    const player = quality.snapshot();
    return { door: car?.door ?? null, car: car?.position || null, player: player?.position || null };
  });
  report.approaches.push({ phase: 'approached', door: lastDoor, ...arrived });
  const before = await vehicle();
  await tap('b');
  await page.waitForTimeout(1400);
  const after = await vehicle();
  return { parked: before, driving: after };
}

async function driveModel(model, withCitizens = false) {
  if (model !== 'bmw') {
    const left = await vehicle();
    if (left?.state === 'DRIVING') {
      await down(' ');
      await page.waitForFunction(() => Math.abs(globalThis.__shadowPulseQuality.vehicle()?.speed || 0) < 0.4, null, { timeout: 4000 }).catch(() => {});
      await up(' ');
      await tap('b');
      await page.waitForTimeout(1200);
    }
    await page.waitForFunction(() => {
      const select = document.querySelector('#vehicle-ui select');
      const root = document.getElementById('vehicle-ui');
      return select && !select.disabled && root && !root.hidden;
    }, null, { timeout: 8000 });
    await page.selectOption('#vehicle-ui select', model);
    await page.waitForTimeout(200);
  }
  const entry = await summonAndEnter();
  await shot(`${model}-entered`);
  const parked = { parked: entry.parked?.state, door: entry.parked?.door, driving: entry.driving?.state, model: entry.driving?.model, speed: entry.driving?.speed ?? null };
  if (entry.driving?.state !== 'DRIVING') {
    return { entry: parked, blocked: 'enter did not reach DRIVING', scenarios: {} };
  }
  await page.evaluate(name => globalThis.__shadowPulseQuality.begin(name), `${model}-drive`);
  const scenarios = {};
  await release();
  await up('w'); await up('a'); await up('s'); await up('d'); await up(' ');
  scenarios.idle = pathOf(await sampleWhile(700, 140));
  await down('w');
  scenarios.launch = pathOf(await sampleWhile(1600, 100));
  const cruiseSamples = await sampleWhile(2200, 100, withCitizens);
  scenarios.cruise = pathOf(cruiseSamples);
  if (withCitizens) scenarios.cruiseProximity = proximity(cruiseSamples);
  await page.evaluate(() => globalThis.__shadowPulseQuality.inspectWheels(true));
  const rolling = [];
  for (let frame = 0; frame < 6; frame++) {
    await page.waitForTimeout(160);
    await shot(`${model}-roll-${frame}`);
    rolling.push(await vehicle());
  }
  await page.evaluate(() => globalThis.__shadowPulseQuality.inspectWheels(false));
  scenarios.rollingFrames = pathOf(rolling);
  await down('a');
  scenarios.left = pathOf(await sampleWhile(1400, 100));
  await shot(`${model}-steer-left`);
  await up('a');
  await down('d');
  scenarios.right = pathOf(await sampleWhile(900, 120));
  await up('d');
  await up('w');
  await down(' ');
  scenarios.brake = pathOf(await sampleWhile(900, 80));
  await up(' ');
  await down('s');
  scenarios.reverse = pathOf(await sampleWhile(1200, 100));
  await up('s');
  await down('w');
  await down('a');
  await page.waitForTimeout(400);
  await down(' ');
  scenarios.brakeInTurn = pathOf(await sampleWhile(700, 100));
  await release();
  await down('w');
  const wallSamples = await sampleWhile(7000, 150, withCitizens);
  scenarios.wall = pathOf(wallSamples);
  if (withCitizens) scenarios.wallProximity = proximity(wallSamples);
  await release();
  await shot(`${model}-after-wall`);
  return { entry: parked, scenarios };
}

function proximity(samples) {
  let min = Infinity;
  const close = [];
  for (const sample of samples) {
    if (!sample.position || !sample.citizens?.people) continue;
    for (const person of sample.citizens.people) {
      const distance = Math.hypot(person.x - sample.position[0], person.z - sample.position[2]);
      if (distance < min) min = distance;
      if (distance < 6) close.push({ id: person.id, distance: +distance.toFixed(2), speed: sample.speed, citizen: person.state, allows: person.allows, anchor: person.anchor });
    }
  }
  close.sort((a, b) => a.distance - b.distance);
  return { min: Number.isFinite(min) ? +min.toFixed(2) : null, close: close.slice(0, 8) };
}

async function watchCitizens(label, ms) {
  const frames = [];
  const end = Date.now() + ms;
  let apiMiss = 0;
  while (Date.now() < end) {
    const state = await pageState();
    if (!state.begin || !state.playing || !state.loadingHidden) {
      apiMiss++;
      frames.push({ api: false, people: [] });
    } else {
      frames.push({ api: true, ...(await citizens()) });
    }
    await page.waitForTimeout(400);
  }
  const live = frames.filter(frame => frame.api);
  const visible = live.at(-1)?.people || [];
  if (visible.length) {
    await page.evaluate(() => {
      const quality = globalThis.__shadowPulseQuality;
      const people = quality.citizens()?.people || [];
      const player = quality.snapshot();
      if (!people.length || !player?.position) return;
      let nearest = people[0];
      let best = Infinity;
      for (const person of people) {
        const distance = Math.hypot(person.x - player.position[0], person.z - player.position[2]);
        if (distance < best) { best = distance; nearest = person; }
      }
      quality.aim(Math.atan2(nearest.x - player.position[0], nearest.z - player.position[2]), 0.08);
    });
    await page.waitForTimeout(500);
    await shot(`${label}-citizen-view`);
  }
  await shot(live.length ? `${label}-citizens` : `${label}-not-playing`);
  return {
    frames: frames.length,
    liveFrames: live.length,
    apiMiss,
    lastCount: live.length ? (live.at(-1)?.count ?? null) : null,
    absent: live.length > 0 && live.every(frame => frame.count === 0),
    streamed: live.at(-1)?.streamed ?? null,
    hasFootpaths: live.at(-1)?.hasFootpaths ?? null,
    ...citizenTrail(live),
    metrics: live.at(-1)?.metrics || null,
  };
}

async function openCity(city, timeout) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(`${base}/?city=${city}&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const state = await ready(timeout);
      await ensurePlaying();
      return { attempt, ...state };
    } catch (error) {
      lastError = error;
      await shot(`${city}-ready-failed-${attempt}`);
    }
  }
  throw lastError;
}

async function recordDrive(city, model, withCitizens = false) {
  const state = await pageState();
  if (!state.begin) throw new Error(`quality API missing before ${model} on ${city}`);
  const drive = await driveModel(model, withCitizens);
  if (drive.blocked) return { ...drive, performance: null };
  const perf = await page.evaluate(() => {
    const quality = globalThis.__shadowPulseQuality;
    const summary = quality.end().summary;
    return { summary, diagnostics: quality.diagnostics() };
  });
  return { ...drive, performance: perf };
}

try {
  report.boot = {};
  if (process.env.SKIP_LOCAL === '1') {
    report.skippedLocal = true;
  } else {
  report.boot.procedural = await openCity('procedural', 90000);
  await page.waitForTimeout(4000);
  report.cities.procedural = { citizensBefore: await watchCitizens('procedural', 6000) };
  try {
    report.cities.procedural.bmw = await recordDrive('procedural', 'bmw');
  } catch (error) {
    report.cities.procedural.bmwError = String(error?.stack || error);
    await shot('bmw-drive-failed');
  }
  try {
    report.cities.procedural.corvette = await recordDrive('procedural', 'corvette');
  } catch (error) {
    report.cities.procedural.corvetteError = String(error?.stack || error);
    await shot('corvette-drive-failed');
  }
  await shot('procedural-done');

  for (const city of ['harbor', 'gardens', 'old-town', 'skyline']) {
    try {
      report.boot[city] = await openCity(city, 90000);
      await page.waitForTimeout(2500);
      report.cities[city] = { citizens: await watchCitizens(city, 5000) };
    } catch (error) {
      report.cities[city] = { error: String(error?.stack || error) };
    }
  }

  }
  try {
    report.boot['hong-kong'] = await openCity('hong-kong', 150000);
    await page.waitForTimeout(6000);
    report.cities['hong-kong'] = { citizens: await watchCitizens('hong-kong', 8000) };
    const drive = await driveModel('bmw', true);
    const perf = drive.blocked ? null : await page.evaluate(() => {
      const quality = globalThis.__shadowPulseQuality;
      return { summary: quality.end().summary, diagnostics: quality.diagnostics() };
    });
    drive.performance = perf;
    report.cities['hong-kong'].drive = drive;
    try {
      report.cities['hong-kong'].corvette = await recordDrive('hong-kong', 'corvette', true);
    } catch (error) {
      report.cities['hong-kong'].corvetteError = String(error?.stack || error);
      await shot('corvette-drive-failed');
    }
  } catch (error) {
    report.cities['hong-kong'] = { ...(report.cities['hong-kong'] || {}), driveError: String(error?.stack || error) };
    try { await shot('hong-kong-drive-failed'); } catch { /* page may be closed */ }
  }
} catch (error) {
  report.fatal = String(error?.stack || error);
  try { await shot('fatal'); } catch { /* page may already be closed */ }
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) {
    const saved = await video.path();
    const target = path.join(shotDir, 'session.webm');
    fs.copyFileSync(saved, target);
    report.video = path.relative(root, target);
  }
  fs.writeFileSync(path.join(outDir, 'vehicle-pedestrian.json'), JSON.stringify(report, null, 2));
  console.log(report.fatal ? `FAIL ${report.fatal}` : 'WROTE vehicle-pedestrian.json');
}
