// Settled camera only. Looks above the horizon for a city tether, then fires both hands.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const report = { started: new Date().toISOString() };
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

try {
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.() && globalThis.__shadowPulseQuality.playing(), null, { timeout: 120000 });
  await page.waitForTimeout(600);
  const origin = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  report.spawn = { position: origin.position, facing: origin.facing, mode: origin.combatMode };
  const seen = [];
  for (let step = 0; step < 8; step++) {
    const yaw = origin.facing + (step / 8) * Math.PI * 2;
    for (const pitch of [-0.15, -0.45, -0.8, -1.1]) {
      const sample = await page.evaluate(async ({ yaw, pitch }) => {
        const q = globalThis.__shadowPulseQuality;
        q.aim(yaw, pitch);
        await new Promise(resolve => setTimeout(resolve, 280));
        const snap = q.snapshot();
        const rays = q.webRays();
        const anchor = rays.anchor;
        const gap = anchor ? Math.hypot(anchor[0] - snap.position[0], anchor[1] - snap.position[1], anchor[2] - snap.position[2]) : null;
        return { gap: gap === null ? null : +gap.toFixed(2), anchor, pitch: rays.pitch, yaw: rays.yaw, reason: rays.reason };
      }, { yaw, pitch });
      if (sample.gap) seen.push(sample);
    }
  }
  seen.sort((a, b) => b.gap - a.gap);
  report.longest = seen.slice(0, 8);
  report.best = seen[0] || null;
  if (report.best && report.best.gap >= 8) {
    await page.evaluate(({ yaw, pitch }) => globalThis.__shadowPulseQuality.aim(yaw, pitch), report.best);
    await page.waitForTimeout(400);
    report.confirm = await page.evaluate(() => {
      const q = globalThis.__shadowPulseQuality;
      const snap = q.snapshot();
      const rays = q.webRays();
      const anchor = rays.anchor;
      const gap = anchor ? Math.hypot(anchor[0] - snap.position[0], anchor[1] - snap.position[1], anchor[2] - snap.position[2]) : null;
      return { gap: gap === null ? null : +gap.toFixed(2), anchor, pitch: rays.pitch };
    });
    await page.evaluate(() => globalThis.__shadowPulseQuality.begin('settled-dual'));
    await page.evaluate(() => {
      globalThis.__shadowPulseQuality.mouse(0, true);
      globalThis.__shadowPulseQuality.mouse(2, true);
    });
    await page.waitForTimeout(1000);
    const mid = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
    report.attached = { webs: mid.webs, speed: mid.speed, state: mid.state, animation: mid.animation, position: mid.position };
    report.shot = 'docs/qa/quality-director-2026-10-28/shots/v3-settled-dual.png';
    await page.screenshot({ path: path.join(outDir, 'shots/v3-settled-dual.png') });
    await page.evaluate(() => globalThis.__shadowPulseQuality.release());
    await page.waitForTimeout(1400);
    const landed = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
    report.landing = {
      states: landed.summary?.states,
      animations: landed.summary?.animations,
      maxSpeed: landed.summary?.maxSpeed,
      maxDt: landed.summary?.maxDt,
      travel: landed.summary?.travel,
    };
  }
  report.status = 'RECORDED';
} catch (error) {
  report.status = 'BLOCKED';
  report.fatal = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(outDir, 'v3-swing-settle.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, best: report.best, confirm: report.confirm, webs: report.attached?.webs?.map(web => ({ hand: web.hand, length: web.length, anchor: web.anchor })), speed: report.attached?.speed, landing: report.landing, fatal: report.fatal || null }));
  await browser.close();
}
