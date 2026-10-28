// Mid-roll and mid-swing frames. Screenshots are taken while the state is live.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shotDir = path.join(root, 'docs/qa/quality-director-2026-10-28/shots/v5');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const report = { started: new Date().toISOString(), swing: [], roll: [] };
const read = () => page.evaluate(() => {
  const probe = globalThis.__shadowPulseQuality;
  const sample = probe.snapshot();
  const pose = probe.pose();
  return {
    state: sample.state,
    animation: sample.animation,
    speed: sample.speed,
    y: sample.position?.[1] ?? null,
    fov: pose.fov ?? null,
    rigRoll: pose.rigRoll ?? null,
    cock: pose.wristCock?.left ?? null,
    rope: sample.webs?.[0]?.length ?? null,
    gap: sample.feet?.left?.gap ?? null,
  };
});
try {
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.playing?.() && globalThis.__shadowPulseQuality.findRollDeck, null, { timeout: 120000 });
  await page.evaluate(() => {
    const probe = globalThis.__shadowPulseQuality;
    probe.seekWebTarget();
    probe.mouse(0, true);
  });
  const swingStart = Date.now();
  while (Date.now() - swingStart < 2800 && report.swing.length < 3) {
    const sample = await read();
    if (sample.state === 'SWINGING' && sample.rope > 4) {
      const file = `swing-mid-${report.swing.length}.png`;
      await page.screenshot({ path: path.join(shotDir, file) });
      report.swing.push({ file, ...sample });
      await page.waitForTimeout(140);
    } else {
      await page.waitForTimeout(20);
    }
  }
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  await page.evaluate(() => {
    const probe = globalThis.__shadowPulseQuality;
    probe.findRollDeck();
    probe.raise(8);
    probe.shove(7, 0);
  });
  const rollStart = Date.now();
  while (Date.now() - rollStart < 2600 && report.roll.length < 3) {
    const sample = await read();
    if (sample.state === 'ROLLING') {
      const file = `roll-mid-${report.roll.length}.png`;
      await page.screenshot({ path: path.join(shotDir, file) });
      report.roll.push({ file, ...sample });
      await page.waitForTimeout(160);
    } else {
      await page.waitForTimeout(16);
    }
  }
  report.status = report.roll.length && report.swing.length ? 'PASS' : 'UNVERIFIED';
} catch (error) {
  report.status = 'UNVERIFIED';
  report.error = String(error?.stack || error).slice(0, 800);
}
fs.writeFileSync(path.join(root, 'docs/qa/quality-director-2026-10-28/v5-frames.json'), JSON.stringify(report, null, 2));
console.log(report.status, 'swing', report.swing.length, 'roll', report.roll.length);
await browser.close();
