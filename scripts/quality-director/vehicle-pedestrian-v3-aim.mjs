// Second Chrome pass: put a citizen in frame, and finish old-town / skyline.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'vehicle-pedestrian-v3');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const report = { started: new Date().toISOString(), cities: {}, hongKongDrive: null };
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', error => { report.errors ??= []; report.errors.push(String(error)); });

async function ready(timeout = 90000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    last = await page.evaluate(() => {
      const quality = globalThis.__shadowPulseQuality;
      const loading = document.getElementById('loading-screen');
      return {
        begin: typeof quality?.begin === 'function',
        ready: !!quality?.ready?.(),
        playing: !!quality?.playing?.(),
        loadingHidden: !!loading?.classList.contains('hidden'),
      };
    }).catch(error => ({ error: String(error) }));
    if (last.begin && last.ready && !last.playing) {
      await page.bringToFront().catch(() => {});
      await page.click('#btn-start-drag', { timeout: 1000, force: true }).catch(() => {});
      await page.click('#btn-start-game', { timeout: 1000, force: true }).catch(() => {});
    }
    if (last.begin && last.ready && last.playing && last.loadingHidden) return last;
    await page.waitForTimeout(400);
  }
  throw new Error(`ready timeout ${JSON.stringify(last)}`);
}

async function aimAtCitizen() {
  return page.evaluate(() => {
    const quality = globalThis.__shadowPulseQuality;
    const people = quality.citizens().people || [];
    if (!people.length) return { count: 0 };
    const person = people.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    const yaw = Math.atan2(person.x - (person.x), person.z - (person.z - 6)) || 0;
    quality.place(person.x, Math.max(0.2, person.y), person.z - 6, yaw);
    quality.look(yaw, 0.22, 8);
    return { count: people.length, person, yaw };
  });
}

try {
  for (const id of ['procedural', 'harbor', 'gardens', 'old-town', 'skyline', 'hong-kong']) {
    const row = { id };
    try {
      await page.goto(`${base}/?city=${id}&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded' });
      await ready(id === 'hong-kong' || id === 'skyline' ? 120000 : 90000);
      await page.waitForTimeout(id === 'hong-kong' ? 7000 : 4000);
      const before = await page.evaluate(() => globalThis.__shadowPulseQuality.citizens());
      row.aim = await aimAtCitizen();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(shotDir, `${id}-aim.png`) });
      row.shot = `docs/qa/quality-director-2026-10-28/vehicle-pedestrian-v3/${id}-aim.png`;
      await page.waitForTimeout(2000);
      const after = await page.evaluate(() => globalThis.__shadowPulseQuality.citizens());
      const prior = new Map((before.people || []).map(person => [person.id, person]));
      row.count = after.count;
      row.people = (after.people || []).map(person => {
        const from = prior.get(person.id);
        const travel = from ? Math.hypot(person.x - from.x, person.z - from.z) : null;
        return {
          id: person.id, state: person.state, anim: person.anim, y: person.y, anchor: person.anchor,
          travel: travel == null ? null : +travel.toFixed(2),
        };
      });
    } catch (error) {
      row.error = String(error);
    }
    report.cities[id] = row;
    fs.writeFileSync(path.join(outDir, 'vehicle-pedestrian-v3-aim.json'), JSON.stringify(report, null, 2));
  }

  const hk = await page.evaluate(async () => {
    const quality = globalThis.__shadowPulseQuality;
    const people = quality.citizens().people || [];
    const low = people.filter(person => person.y < 8).sort((a, b) => a.y - b.y)[0] || people[0];
    if (!low) return { error: 'no citizen' };
    quality.place(low.x + 8, low.y, low.z, 0);
    const parked = await quality.summon();
    const vehicle = quality.vehicle();
    let entered = null;
    if (parked && vehicle?.doorPoint) {
      quality.place(vehicle.doorPoint[0], vehicle.doorPoint[1], vehicle.doorPoint[2]);
      entered = await quality.summon();
    }
    return {
      low, parked, notice: quality.notice(), entered,
      vehicle: quality.vehicle(),
      player: quality.snapshot().position,
    };
  });
  report.hongKongDrive = hk;
  if (hk.entered) {
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const quality = globalThis.__shadowPulseQuality;
      quality.release();
      quality.key('KeyW', false);
      quality.key('KeyW', true);
    });
    await page.waitForTimeout(1200);
    const moving = await page.evaluate(() => globalThis.__shadowPulseQuality.vehicle());
    report.hongKongDrive.moving = { speed: moving?.speed, state: moving?.state, position: moving?.position };
    const car = moving;
    if (car?.yaw != null) {
      await page.evaluate(yaw => globalThis.__shadowPulseQuality.look(yaw + 1.1, 0.25, 9), car.yaw);
    }
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(shotDir, 'hong-kong-street-drive.png') });
    await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', false));
  } else {
    await page.screenshot({ path: path.join(shotDir, 'hong-kong-street-drive.png') });
  }
} catch (error) {
  report.fatal = String(error.stack || error);
} finally {
  report.finished = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'vehicle-pedestrian-v3-aim.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(report.fatal ? `FAIL ${report.fatal}` : 'PASS aim');
