import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shot = path.join(root, 'docs/qa/quality-director-2026-10-28/shots/10-settled-swing.png');
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5191/?city=procedural&play=solo&qualityDirector=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => globalThis.__shadowPulseQuality?.playing?.(), null, { timeout: 90000 });
const rows = [];
let chosen = null;
for (const pitch of [-0.2, -0.45, -0.7, -0.9, -1.05, -1.2]) {
  await page.evaluate(value => globalThis.__shadowPulseQuality.aim(0, value), pitch);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const rays = await page.evaluate(() => globalThis.__shadowPulseQuality.webRays());
  rows.push({ asked: pitch, pitch: rays.pitch, yaw: rays.yaw, first: rays.hits[0] || null, anchor: rays.anchor, reason: rays.reason });
  if (rays.anchor && !chosen) chosen = rays;
}
let swing = null;
if (chosen) {
  await page.evaluate(value => globalThis.__shadowPulseQuality.aim(0, value.pitch), chosen);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => globalThis.__shadowPulseQuality.begin('settled-swing'));
  const box = await page.locator('#webgl-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.screenshot({ path: shot });
  swing = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
  await page.mouse.up();
}
const report = { rows, swingingFrames: swing?.summary?.swingingFrames ?? 0, maxWebs: swing?.summary?.maxWebs ?? 0, states: swing?.summary?.states || [], maxSpeed: swing?.summary?.maxSpeed ?? null };
fs.writeFileSync(path.join(root, 'docs/qa/quality-director-2026-10-28/aim-sweep.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!report.swingingFrames) process.exitCode = 1;
