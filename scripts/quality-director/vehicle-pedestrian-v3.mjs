// Headed Chrome check for the local-city crowds, same-floor parking, and a moving wheel.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'vehicle-pedestrian-v3');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const report = { started: new Date().toISOString(), base, cities: {}, vehicles: {}, consoleErrors: [], shots: [] };
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', error => report.consoleErrors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });

async function pageState() {
  return page.evaluate(() => {
    const quality = globalThis.__shadowPulseQuality;
    const loading = document.getElementById('loading-screen');
    return {
      begin: typeof quality?.begin === 'function',
      ready: !!quality?.ready?.(),
      playing: !!quality?.playing?.(),
      loadingHidden: !!loading?.classList.contains('hidden'),
    };
  }).catch(error => ({ error: String(error) }));
}
async function ready(timeout = 90000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    last = await pageState();
    if (last.begin && last.ready && !last.playing) {
      await page.click('#btn-start-drag', { timeout: 1500 }).catch(() => {});
    }
    if (last.begin && last.ready && last.playing && last.loadingHidden) return last;
    await page.waitForTimeout(400);
  }
  throw new Error(`ready timeout ${JSON.stringify(last)}`);
}
async function shot(name) {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file });
  report.shots.push(path.relative(root, file));
  return file;
}
async function openCity(id) {
  await page.goto(`${base}/?city=${id}&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded' });
  await ready(id === 'hong-kong' ? 120000 : 90000);
}
const call = (fn, arg) => page.evaluate(([fn, arg]) => {
  const quality = globalThis.__shadowPulseQuality;
  const value = quality[fn];
  return typeof value === 'function' ? value(arg) : value;
}, [fn, arg]);
async function ensurePlaying() {
  const state = await pageState();
  if (state.playing) return;
  await page.bringToFront().catch(() => {});
  await page.click('#btn-start-game', { timeout: 1500 }).catch(() => {});
  await page.click('#btn-start-drag', { timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(400);
}
async function placeSummon(x, y, z, yaw = null) {
  await ensurePlaying();
  return page.evaluate(async ([x, y, z, yaw]) => {
    const quality = globalThis.__shadowPulseQuality;
    quality.place(x, y, z, yaw);
    const parked = await quality.summon();
    return { parked, notice: quality.notice(), vehicle: quality.vehicle(), player: quality.snapshot().position };
  }, [x, y, z, yaw]);
}
async function captureViews(model, tag) {
  await ensurePlaying();
  await page.evaluate(() => {
    const quality = globalThis.__shadowPulseQuality;
    quality.release();
    quality.key('KeyW', false);
    quality.key('KeyW', true);
    quality.begin('drive');
  });
  await page.waitForTimeout(900);
  const views = [];
  for (const [name, yaw, pitch, distance] of [
    ['side', 1.15, 0.2, 6.8],
    ['front45', 0.65, 0.28, 7.2],
    ['rear45', Math.PI - 0.65, 0.28, 7.2],
    ['front-close', 1.25, 0.12, 3.1],
    ['rear-close', Math.PI + 1.05, 0.12, 3.1],
  ]) {
    await page.evaluate(([yaw, pitch, distance]) => {
      const quality = globalThis.__shadowPulseQuality;
      const car = quality.vehicle();
      if (car?.yaw != null) quality.look(car.yaw + yaw, pitch, distance);
    }, [yaw, pitch, distance]);
    await page.waitForTimeout(160);
    const after = await page.evaluate(() => globalThis.__shadowPulseQuality.vehicle());
    const moving = (after?.speed || 0) > 0.4;
    if (moving) await shot(`${model}-${tag}${name}`);
    views.push({ name, speed: after?.speed ?? null, state: after?.state ?? null, moving, spin: after?.spin ?? null, position: after?.position ?? null });
  }
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', false));
  return views;
}
function moved(before, after) {
  const prior = new Map((before.people || []).map(person => [person.id, person]));
  return (after.people || []).map(person => {
    const from = prior.get(person.id);
    const travel = from ? Math.hypot(person.x - from.x, person.z - from.z) : null;
    return { id: person.id, state: person.state, anim: person.anim, travel: travel == null ? null : +travel.toFixed(2), anchor: person.anchor, y: person.y };
  });
}

try {
  for (const id of ['procedural', 'harbor', 'gardens', 'old-town', 'skyline']) {
    const row = { id };
    try {
      await openCity(id);
      await ensurePlaying();
      await page.evaluate(() => globalThis.__shadowPulseQuality.begin('crowd'));
      await page.waitForTimeout(4500);
      const high = await page.evaluate(() => globalThis.__shadowPulseQuality.citizens());
      row.fromRoof = { count: high.count, ys: (high.people || []).map(person => person.y) };
      const walk = await page.evaluate(() => {
        const quality = globalThis.__shadowPulseQuality;
        const spot = quality.sidewalks().find(node => node.d > 8) || quality.sidewalks()[0];
        if (!spot) return null;
        quality.place(spot.x, 0.35, spot.z);
        quality.look(0, 0.35, 8);
        return spot;
      });
      row.sidewalk = walk;
      await page.waitForTimeout(500);
      const before = await page.evaluate(() => globalThis.__shadowPulseQuality.citizens());
      await page.waitForTimeout(2500);
      const after = await page.evaluate(() => globalThis.__shadowPulseQuality.citizens());
      row.count = after.count;
      row.people = moved(before, after);
      row.perf = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
      await shot(`${id}-citizens`);
    } catch (error) {
      row.error = String(error);
    }
    report.cities[id] = row;
    fs.writeFileSync(path.join(outDir, 'vehicle-pedestrian-v3.json'), JSON.stringify(report, null, 2));
  }

  await openCity('procedural');
  report.vehicles.preload = await placeSummon(0, 0.2, 0, 0);
  const roofs = await page.evaluate(() => globalThis.__shadowPulseQuality.roofs());
  const roof = roofs.sort((a, b) => Math.abs(b.y - 95) - Math.abs(a.y - 95))[0];
  report.vehicles.roofSpawn = roof ? await placeSummon(roof.x, roof.y, roof.z, null) : { error: 'no roof' };
  await shot('roof-summon');
  report.vehicles.airSummon = await placeSummon(0, 40, 0, null);
  report.vehicles.streetSpawn = await placeSummon(0, 0.2, 0, 0);
  await shot('street-summon');

  for (const model of ['bmw', 'corvette']) {
    const row = { model };
    if (model === 'corvette') {
      await page.evaluate(() => {
        const quality = globalThis.__shadowPulseQuality;
        quality.release();
        quality.key('KeyW', false);
        quality.key('Space', false);
        quality.key('Space', true);
      });
      await page.waitForTimeout(2500);
      await page.evaluate(() => {
        const quality = globalThis.__shadowPulseQuality;
        quality.key('Space', false);
        quality.key('KeyB', false);
        quality.key('KeyB', true);
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyB', false));
      await page.waitForTimeout(1200);
      row.selected = await page.evaluate(() => globalThis.__shadowPulseQuality.selectVehicle('corvette'));
      report.vehicles.corvetteStreet = await placeSummon(0, 0.2, 40, 0);
    }
    const door = await page.evaluate(async () => {
      const quality = globalThis.__shadowPulseQuality;
      const car = quality.vehicle();
      if (!car?.doorPoint) return { car };
      quality.place(car.doorPoint[0], car.doorPoint[1], car.doorPoint[2]);
      const entered = await quality.summon();
      return { entered, notice: quality.notice(), before: car.door, vehicle: quality.vehicle() };
    });
    row.enter = door;
    await page.waitForTimeout(1200);
    await shot(`${model}-entered`);
    row.views = await captureViews(model, '');
    if (!row.views.some(view => view.moving)) {
      await page.evaluate(() => {
        const quality = globalThis.__shadowPulseQuality;
        quality.key('KeyW', false);
        quality.key('Space', false);
        quality.key('Space', true);
      });
      await page.waitForTimeout(1800);
      await page.evaluate(() => {
        const quality = globalThis.__shadowPulseQuality;
        quality.key('Space', false);
        quality.key('KeyB', false);
        quality.key('KeyB', true);
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyB', false));
      await page.waitForTimeout(1200);
      row.openRoad = await placeSummon(-60, 0.2, 0, 0);
      const retryDoor = await page.evaluate(async () => {
        const quality = globalThis.__shadowPulseQuality;
        const car = quality.vehicle();
        if (!car?.doorPoint) return { car };
        quality.place(car.doorPoint[0], car.doorPoint[1], car.doorPoint[2]);
        const entered = await quality.summon();
        return { entered, vehicle: quality.vehicle() };
      });
      row.retryEnter = retryDoor;
      await page.waitForTimeout(1200);
      row.retryViews = await captureViews(model, 'retry-');
    }
    row.perf = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
    const finalCar = await page.evaluate(() => globalThis.__shadowPulseQuality.vehicle());
    row.end = { state: finalCar?.state, speed: finalCar?.speed, position: finalCar?.position };
    report.vehicles[model] = row;
    fs.writeFileSync(path.join(outDir, 'vehicle-pedestrian-v3.json'), JSON.stringify(report, null, 2));
  }

  await openCity('hong-kong');
  await ensurePlaying();
  await page.waitForTimeout(6000);
  const hkBefore = await page.evaluate(() => globalThis.__shadowPulseQuality.citizens());
  await page.evaluate(() => globalThis.__shadowPulseQuality.begin('hk'));
  await page.waitForTimeout(8000);
  const hkAfter = await page.evaluate(() => globalThis.__shadowPulseQuality.citizens());
  report.cities['hong-kong'] = {
    count: hkAfter.count,
    people: moved(hkBefore, hkAfter),
    perf: await page.evaluate(() => globalThis.__shadowPulseQuality.end()),
  };
  await shot('hong-kong-citizens');
  const hkCar = await page.evaluate(async () => {
    const quality = globalThis.__shadowPulseQuality;
    const parked = await quality.summon();
    return { parked, notice: quality.notice(), vehicle: quality.vehicle(), player: quality.snapshot().position };
  });
  report.vehicles.hongKong = hkCar;
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', true));
  await page.waitForTimeout(1500);
  const near = await page.evaluate(() => globalThis.__shadowPulseQuality.citizens());
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', false));
  report.vehicles.hongKongNear = { speed: (await page.evaluate(() => globalThis.__shadowPulseQuality.vehicle()))?.speed, citizens: near.people };
  await shot('hong-kong-drive');
} catch (error) {
  report.fatal = String(error.stack || error);
} finally {
  report.finished = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'vehicle-pedestrian-v3.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(report.fatal ? `FAIL ${report.fatal}` : 'PASS chrome');
