// Confirms the three approved fixes: hook arc, latched combat aim, vehicle bar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shotDir = path.join(root, 'docs/qa/quality-director-2026-10-28/shots');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const report = { started: new Date().toISOString(), errors: [] };

async function shot(page, name) {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(root, file);
}

const review = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
review.on('pageerror', error => report.errors.push(String(error)));
try {
  await review.goto(`${base}/?combatReview=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await review.waitForFunction(() => document.querySelectorAll('#combat-clip option').length > 5, null, { timeout: 90000 });
  report.poses = [];
  for (const view of ['three', 'side']) {
    for (const key of ['hook', 'heavy', 'cross']) {
      for (const phase of [0.25, 0.5, 0.75]) {
        await review.evaluate(({ key, phase, view }) => {
          document.querySelector('#combat-camera-view').value = view;
          document.querySelector('#combat-clip').value = key;
          document.querySelector('#combat-phase').value = String(phase);
          document.querySelector('#combat-sample').click();
          document.querySelector('section').style.visibility = 'hidden';
        }, { key, phase, view });
        await review.waitForTimeout(40);
        const file = await shot(review, `v3-fix-${key}-${view}-${Math.round(phase * 100)}`);
        report.poses.push({ key, view, phase, file });
      }
    }
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 120000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 25000 });
  await page.waitForTimeout(600);
  report.ui = await page.evaluate(() => {
    const box = id => {
      const node = document.getElementById(id);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        hidden: node.hidden || style.display === 'none' || style.visibility === 'hidden',
        text: (node.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        top: Math.round(rect.top), bottom: Math.round(rect.bottom),
        left: Math.round(rect.left), right: Math.round(rect.right),
        width: Math.round(rect.width), height: Math.round(rect.height),
      };
    };
    const overlap = (a, b) => !!(a && b && !a.hidden && !b.hidden && a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom);
    const vehicle = box('vehicle-ui');
    const ability = box('ability-bar');
    const minimap = box('minimap-panel');
    const center = innerWidth / 2;
    return {
      vehicle, ability, minimap,
      vehicleCoversAbility: overlap(vehicle, ability),
      vehicleCoversMinimap: overlap(vehicle, minimap),
      vehicleClearsCenter: !vehicle || vehicle.hidden || vehicle.left > center + 40,
      viewport: [innerWidth, innerHeight],
    };
  });
  report.ui.shot = await shot(page, 'v3-fix-vehicle-ui');

  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', true));
  await page.waitForTimeout(200);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  await page.waitForTimeout(200);
  report.camera = await page.evaluate(async () => {
    const q = globalThis.__shadowPulseQuality;
    const before = q.snapshot();
    q.mouse(0, true);
    await new Promise(resolve => setTimeout(resolve, 50));
    const started = q.snapshot();
    q.aim(before.camera.yaw + 1.2, 0.2);
    await new Promise(resolve => setTimeout(resolve, 280));
    const during = q.snapshot();
    q.mouse(0, false);
    const angle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    const player = during.position;
    const cam = during.camera.position;
    const orbit = Math.atan2(-(cam[0] - player[0]), -(cam[2] - player[2]));
    return {
      mode: during.combatMode,
      attack: during.attack,
      animation: during.animation,
      facingDelta: +angle(during.facing, started.facing).toFixed(3),
      aimDelta: +angle(during.camera.yaw, started.camera.yaw).toFixed(3),
      boomVersusAim: +angle(orbit, during.camera.yaw).toFixed(3),
      swinging: during.swinging,
    };
  });
  report.camera.shot = await shot(page, 'v3-fix-camera-jab');

  await page.evaluate(() => globalThis.__shadowPulseQuality.release());
  await page.waitForTimeout(400);
  report.heavy = await page.evaluate(async () => {
    const q = globalThis.__shadowPulseQuality;
    q.aim(0.4, 0.18);
    await new Promise(resolve => setTimeout(resolve, 80));
    q.key('KeyE', true);
    await new Promise(resolve => setTimeout(resolve, 40));
    q.key('KeyE', false);
    await new Promise(resolve => setTimeout(resolve, 560));
    const during = q.snapshot();
    return { attack: during.attack, animation: during.animation, mode: during.combatMode };
  });
  report.heavy.shot = await shot(page, 'v3-fix-heavy-live');
} catch (error) {
  report.fatal = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(root, 'docs/qa/quality-director-2026-10-28/v3-fix-verify.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ui: report.ui, camera: report.camera, heavy: report.heavy, fatal: report.fatal || null, errors: report.errors.slice(0, 6) }));
  await browser.close();
}
