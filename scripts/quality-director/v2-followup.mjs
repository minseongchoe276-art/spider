// Side-view strike, isolated special, city sightline, and pointer-lock cause.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shotDir = path.join(root, 'docs/qa/quality-director-2026-10-28/shots');
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const report = {};

async function lockProbe(launchOptions, label) {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, ...launchOptions });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  try {
    await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => globalThis.__shadowPulseQuality?.playing?.(), null, { timeout: 90000 });
    await page.evaluate(() => {
      const canvas = document.getElementById('webgl-canvas');
      canvas.addEventListener('pointerdown', async () => {
        try {
          await canvas.requestPointerLock();
          globalThis.__lockFromGesture = { granted: document.pointerLockElement === canvas };
        } catch (error) {
          globalThis.__lockFromGesture = { granted: false, name: error.name, message: error.message };
        }
      }, { once: true, capture: true });
    });
    await page.locator('#webgl-canvas').click({ position: { x: 180, y: 160 } });
    await page.waitForTimeout(300);
    report[label] = await page.evaluate(() => ({
      webdriver: navigator.webdriver,
      gesture: globalThis.__lockFromGesture || null,
      locked: document.pointerLockElement?.id || null,
    }));
  } finally {
    await browser.close();
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.playing?.(), null, { timeout: 90000 });
  const sweep = [];
  for (let step = 0; step < 8; step++) {
    const yaw = step / 8 * Math.PI * 2;
    await page.evaluate(value => globalThis.__shadowPulseQuality.aim(value, 0.7), yaw);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rays = await page.evaluate(() => globalThis.__shadowPulseQuality.webRays());
    sweep.push({ yaw: +yaw.toFixed(3), hits: rays.hits.length, first: rays.hits[0] || null, anchor: rays.anchor, reason: rays.reason });
  }
  report.citySweep = sweep;
  const best = sweep.reduce((chosen, row) => ((row.first?.distance || 0) > (chosen.first?.distance || 0) ? row : chosen), sweep[0]);
  await page.evaluate(value => globalThis.__shadowPulseQuality.aim(value, 0.35), best.yaw);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotDir, 'v2-city.png') });
  report.cityView = best;

  const facing = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot().facing);
  await page.evaluate(yaw => globalThis.__shadowPulseQuality.aim(yaw, 0.15), facing + Math.PI / 2);
  await page.waitForTimeout(600);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', true));
  await page.waitForTimeout(150);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  await page.waitForTimeout(200);
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  await page.waitForTimeout(240);
  const jab = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  await page.screenshot({ path: path.join(shotDir, 'v2-jab-side.png') });
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  report.sideJab = { attack: jab.attack, animation: jab.animation, blends: jab.blends, combatMode: jab.combatMode, state: jab.state };

  await page.waitForTimeout(1400);
  await page.keyboard.down('KeyG');
  await page.waitForTimeout(350);
  const special = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  await page.screenshot({ path: path.join(shotDir, 'v2-special-isolated.png') });
  await page.keyboard.up('KeyG');
  report.special = { attack: special.attack, animation: special.animation, blends: special.blends, combatMode: special.combatMode, state: special.state };
} catch (error) {
  report.fatal = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

try {
  await lockProbe({ ignoreDefaultArgs: ['--enable-automation'] }, 'lockWithoutAutomationFlag');
} catch (error) {
  report.lockWithoutAutomationFlag = { fatal: String(error?.stack || error) };
}

fs.writeFileSync(path.join(root, 'docs/qa/quality-director-2026-10-28/v2-followup.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  city: report.cityView,
  reasonOnHit: report.citySweep?.find(row => row.anchor)?.reason,
  sideJab: report.sideJab?.attack,
  sideAnim: report.sideJab?.animation,
  special: report.special?.attack,
  specialAnim: report.special?.animation,
  lock: report.lockWithoutAutomationFlag,
  fatal: report.fatal || null,
}, null, 2));
