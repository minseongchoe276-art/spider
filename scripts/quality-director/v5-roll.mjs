// In-page roll and swing sample. RequestAnimationFrame, so a short landing is not skipped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'shots', 'v5');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const report = { started: new Date().toISOString() };
try {
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.playing?.() && globalThis.__shadowPulseQuality.findRollDeck, null, { timeout: 120000 });
  const swing = await page.evaluate(async () => {
    const probe = globalThis.__shadowPulseQuality;
    const aim = probe.seekWebTarget();
    probe.mouse(0, true);
    const samples = [];
    const start = performance.now();
    while (performance.now() - start < 3200) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const sample = probe.snapshot();
      const pose = probe.pose();
      if (sample.webs?.length || sample.state === 'SWINGING') {
        samples.push({ state: sample.state, y: sample.position[1], speed: sample.speed, fov: pose.fov, rigRoll: pose.rigRoll, cock: pose.wristCock?.left ?? null, rope: sample.webs?.[0]?.length ?? null, x: sample.position[0], z: sample.position[2] });
      }
    }
    probe.mouse(0, false);
    const release = [];
    const released = performance.now();
    while (performance.now() - released < 600) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const sample = probe.snapshot();
      release.push(`${sample.state}:${sample.animation}`);
    }
    return { aim, count: samples.length, samples: samples.filter((_, index) => index % 8 === 0).slice(0, 12), release: [...new Set(release)].slice(0, 8) };
  });
  if (swing.count > 4) await page.screenshot({ path: path.join(shotDir, 'swing-raf.png') });
  const deck = await page.evaluate(() => globalThis.__shadowPulseQuality.findRollDeck());
  await page.waitForTimeout(200);
  const fall = await page.evaluate(async () => {
    const probe = globalThis.__shadowPulseQuality;
    probe.raise(8);
    probe.shove(7, 0);
    const samples = [];
    const start = performance.now();
    while (performance.now() - start < 2200 && samples.length < 200) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const sample = probe.snapshot();
      samples.push({
        state: sample.state, animation: sample.animation,
        y: sample.position[1], vx: sample.velocity[0], vy: sample.velocity[1], vz: sample.velocity[2],
        gap: sample.feet?.left?.gap ?? null, knee: probe.pose().left?.knee ?? null,
      });
    }
    return samples;
  });
  const rolling = fall.filter(sample => sample.state === 'ROLLING');
  if (rolling.length) {
    await page.screenshot({ path: path.join(shotDir, 'roll-raf.png') });
  }
  report.swing = swing;
  report.deck = deck;
  report.fall = {
    states: [...new Set(fall.map(sample => sample.state))],
    animations: [...new Set(fall.map(sample => sample.animation))],
    rollFrames: rolling.length,
    rollAnimation: [...new Set(rolling.map(sample => sample.animation))],
    lowest: fall.reduce((best, sample) => !best || sample.y < best.y ? sample : best, null),
    maxHorizontal: +Math.max(...fall.map(sample => Math.hypot(sample.vx, sample.vz))).toFixed(2),
    minVy: +Math.min(...fall.map(sample => sample.vy)).toFixed(2),
    gap: rolling.length ? +Math.min(...rolling.map(sample => sample.gap).filter(Number.isFinite)).toFixed(3) : null,
  };
  report.status = rolling.some(sample => sample.animation === 'roll') ? 'PASS' : 'UNVERIFIED';
} catch (error) {
  report.status = 'UNVERIFIED';
  report.error = String(error?.stack || error).slice(0, 800);
}
fs.writeFileSync(path.join(outDir, 'v5-roll.json'), JSON.stringify(report, null, 2));
console.log(report.status, 'rollFrames', report.fall?.rollFrames, 'swing', report.swing?.count);
await browser.close();
