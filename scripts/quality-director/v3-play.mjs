// V3 live checks: distant dual web, repeated frame windows, combat camera, combos, HUD overlap.
// Does not change physics, combat numbers, or motion files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'shots');
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const report = { started: new Date().toISOString(), errors: [] };
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });

async function shot(name) {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(root, file);
}

try {
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 120000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 25000 });
  await page.waitForTimeout(800);
  report.boot = await page.evaluate(() => {
    const dump = globalThis.__shadowPulseQuality.dump();
    return { build: dump.build, map: dump.map, state: dump.latest?.state, position: dump.latest?.position, diagnostics: globalThis.__shadowPulseQuality.diagnostics() };
  });

  report.pointer = await page.evaluate(async () => {
    const canvas = document.getElementById('webgl-canvas');
    let error = null;
    try { await canvas.requestPointerLock(); }
    catch (caught) { error = `${caught.name}: ${caught.message}`; }
    return {
      error,
      webdriver: navigator.webdriver,
      locked: document.pointerLockElement === canvas,
      userAgent: navigator.userAgent,
    };
  });

  report.ui = await page.evaluate(() => {
    const box = id => {
      const node = document.getElementById(id);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        hidden: node.hidden || style.display === 'none' || style.visibility === 'hidden',
        text: (node.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 180),
        top: Math.round(rect.top), bottom: Math.round(rect.bottom),
        left: Math.round(rect.left), right: Math.round(rect.right),
        width: Math.round(rect.width), height: Math.round(rect.height),
      };
    };
    const vehicle = box('vehicle-ui');
    const ability = box('ability-bar');
    const actions = box('hud-actions');
    const overlap = (a, b) => !!(a && b && !a.hidden && !b.hidden && a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom);
    return { vehicle, ability, actions, vehicleCoversAbility: overlap(vehicle, ability), vehicleCoversActions: overlap(vehicle, actions), viewport: [innerWidth, innerHeight] };
  });
  report.ui.shot = await shot('v3-vehicle-ui');

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) report.navigations = [...(report.navigations || []), frame.url()];
  });
  const origin = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot().facing || 0);
  const seen = [];
  for (let step = 0; step < 12; step++) {
    const yaw = origin + (step / 12) * Math.PI * 2;
    for (const pitch of [0.05, 0.25, 0.45, 0.7]) {
      const sample = await page.evaluate(async ({ yaw, pitch }) => {
        const q = globalThis.__shadowPulseQuality;
        q.aim(yaw, pitch);
        await new Promise(resolve => setTimeout(resolve, 70));
        const rays = q.webRays();
        return { distance: rays.hits[0]?.distance ?? null, anchor: rays.anchor, hit: rays.hits[0] || null, reason: rays.reason };
      }, { yaw, pitch });
      if (sample.anchor && sample.distance) seen.push({ distance: sample.distance, pitch, yaw: +yaw.toFixed(3), anchor: sample.anchor, hit: sample.hit });
    }
  }
  seen.sort((a, b) => b.distance - a.distance);
  report.sweep = { best: seen[0] || null, longest: seen.slice(0, 6), attempts: seen.length };

  const attempts = [];
  for (let index = 0; index < 6; index++) {
    await page.evaluate(() => globalThis.__shadowPulseQuality.release());
    await page.waitForTimeout(400);
    const before = await page.evaluate(() => globalThis.__shadowPulseQuality.diagnostics());
    if (report.sweep.best) {
      await page.evaluate(({ yaw, pitch }) => globalThis.__shadowPulseQuality.aim(yaw, pitch), report.sweep.best);
      await page.waitForTimeout(180);
    }
    await page.evaluate(step => globalThis.__shadowPulseQuality.begin(`dual-${step}`), index);
    await page.evaluate(() => {
      globalThis.__shadowPulseQuality.mouse(0, true);
      globalThis.__shadowPulseQuality.mouse(2, true);
    });
    await page.waitForTimeout(900);
    const mid = await page.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
    if (index === 0) report.dualShot = await shot('v3-city-dual');
    await page.waitForTimeout(500);
    const recorded = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
    const after = await page.evaluate(() => globalThis.__shadowPulseQuality.diagnostics());
    await page.evaluate(() => globalThis.__shadowPulseQuality.release());
    attempts.push({
      index,
      webs: mid.webs,
      speed: mid.speed,
      state: mid.state,
      animation: mid.animation,
      maxDt: recorded.summary?.maxDt ?? null,
      averageFps: recorded.summary?.averageFps ?? null,
      frames: recorded.summary?.frames ?? null,
      maxWebs: recorded.summary?.maxWebs ?? null,
      maxSpeed: recorded.summary?.maxSpeed ?? null,
      programsBefore: before.programs,
      programsAfter: after.programs,
      heapBefore: before.heap,
      heapAfter: after.heap,
      drawCalls: mid.drawCalls,
    });
    console.log('dual', index, mid.webs?.length, mid.speed, recorded.summary?.maxDt);
  }
  report.dual = attempts;
  report.spikes = await page.evaluate(() => globalThis.__shadowPulseQuality.spikes());

  await page.keyboard.press('q');
  await page.waitForTimeout(250);
  report.camera = await page.evaluate(async () => {
    const q = globalThis.__shadowPulseQuality;
    const before = q.snapshot();
    const yaw = before.camera.yaw + 1.2;
    q.aim(yaw, 0.25);
    q.mouse(0, true);
    await new Promise(resolve => setTimeout(resolve, 280));
    const during = q.snapshot();
    q.mouse(0, false);
    const facingDelta = Math.atan2(Math.sin(during.facing - before.facing), Math.cos(during.facing - before.facing));
    const aimDelta = Math.atan2(Math.sin(during.camera.yaw - during.facing), Math.cos(during.camera.yaw - during.facing));
    return {
      before: { facing: before.facing, yaw: before.camera.yaw, mode: before.combatMode, lock: before.pointerLock },
      during: { facing: during.facing, yaw: during.camera.yaw, attack: during.attack, animation: during.animation },
      facingDelta: +facingDelta.toFixed(3),
      aimVersusFacing: +aimDelta.toFixed(3),
    };
  });
  report.camera.shot = await shot('v3-camera-jab');

  async function combo(name, run) {
    await page.evaluate(() => globalThis.__shadowPulseQuality.release());
    await page.keyboard.up('w');
    await page.waitForTimeout(350);
    await page.evaluate(label => globalThis.__shadowPulseQuality.begin(label), name);
    await run();
    const end = await page.evaluate(() => globalThis.__shadowPulseQuality.end());
    const samples = (end.samples || []).map(sample => ({
      t: Math.round(sample.scenarioMs),
      state: sample.state,
      animation: sample.animation,
      speed: sample.speed,
      attack: sample.attack?.key || null,
      attackTime: sample.attack?.time ?? null,
    }));
    return { name, summary: end.summary, samples };
  }

  report.combos = [];
  report.combos.push(await combo('run-jab', async () => {
    await page.keyboard.down('w');
    await page.waitForTimeout(700);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
    await page.waitForTimeout(400);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
    await page.keyboard.up('w');
    await page.waitForTimeout(200);
  }));
  report.combos.push(await combo('run-cross', async () => {
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(2, true));
    await page.waitForTimeout(400);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(2, false));
    await page.keyboard.up('w');
  }));
  report.combos.push(await combo('run-heavy', async () => {
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.keyboard.press('e');
    await page.waitForTimeout(500);
    await page.keyboard.up('w');
  }));
  report.combos.push(await combo('jump-attack', async () => {
    await page.keyboard.press(' ');
    await page.waitForTimeout(180);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
    await page.waitForTimeout(250);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
    await page.waitForTimeout(400);
  }));
  report.combos.push(await combo('attack-attack', async () => {
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
    await page.waitForTimeout(80);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
    await page.waitForTimeout(620);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(2, true));
    await page.waitForTimeout(80);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(2, false));
    await page.waitForTimeout(400);
  }));
  if (report.sweep.best) {
    report.combos.push(await combo('swing-landing', async () => {
      await page.evaluate(({ yaw, pitch }) => globalThis.__shadowPulseQuality.aim(yaw, pitch), report.sweep.best);
      await page.waitForTimeout(160);
      await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
      await page.waitForTimeout(700);
      await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
      await page.waitForTimeout(1200);
    }));
  }
  report.comboShot = await shot('v3-combo');
  report.status = 'RECORDED';
} catch (error) {
  report.status = 'BLOCKED';
  report.fatal = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(outDir, 'v3-play.json'), JSON.stringify(report, null, 2));
  const dual = report.dual?.map(item => ({ webs: item.webs?.length, speed: item.speed, maxDt: item.maxDt, len: item.webs?.[0]?.length })) || [];
  console.log(JSON.stringify({ status: report.status, build: report.boot?.build, best: report.sweep?.best?.distance, dual, fatal: report.fatal || null }));
  await browser.close();
}
