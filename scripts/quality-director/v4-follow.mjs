// Follow-up measurements for foot contact, latent dodge, swing aim, and English copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const shotDir = path.join(outDir, 'shots', 'v4');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const report = { started: new Date().toISOString(), tests: [] };
const save = () => fs.writeFileSync(path.join(outDir, 'v4-follow.json'), JSON.stringify(report, null, 2));
const record = (name, status, detail = {}) => { report.tests.push({ name, status, ...detail }); console.log(status, name); save(); };

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function frames(ms) {
  return page.evaluate(async duration => {
    const probe = globalThis.__shadowPulseQuality;
    const samples = [];
    const start = performance.now();
    while (performance.now() - start < duration && samples.length < 180) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const snap = probe.snapshot();
      const pose = probe.pose();
      samples.push({
        state: snap.state, animation: snap.animation, attack: snap.attack?.key || null,
        speed: snap.speed, x: snap.position[0], y: snap.position[1], z: snap.position[2],
        support: snap.support, leftGap: snap.feet?.left?.gap ?? null, rightGap: snap.feet?.right?.gap ?? null,
        hips: pose.hipsHeight, knee: pose.left?.knee ?? null, wrist: pose.left?.wrist ?? null,
        fov: pose.fov, webs: snap.webs?.length || 0,
      });
    }
    return samples;
  }, ms);
}
function contact(samples) {
  const gaps = samples.flatMap(sample => [sample.leftGap, sample.rightGap]).filter(value => Number.isFinite(value));
  const hips = samples.map(sample => sample.hips).filter(value => Number.isFinite(value));
  return {
    count: samples.length,
    states: [...new Set(samples.map(sample => sample.state))],
    animations: [...new Set(samples.map(sample => sample.animation))],
    gap: gaps.length ? { min: +Math.min(...gaps).toFixed(3), max: +Math.max(...gaps).toFixed(3) } : null,
    hips: hips.length ? { min: +Math.min(...hips).toFixed(3), max: +Math.max(...hips).toFixed(3) } : null,
    supportSeen: samples.some(sample => Number.isFinite(sample.support)),
  };
}

try {
  await page.goto(`${base}/?city=procedural&play=solo&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.() && globalThis.__shadowPulseQuality.playing(), null, { timeout: 120000 });
  await page.waitForTimeout(500);
  const idle = contact(await frames(400));
  record('정지 발·골반', idle.gap && idle.hips ? 'PASS' : 'UNVERIFIED', { detail: idle, shot: 'shots/v4/follow-idle.png' });
  await page.screenshot({ path: path.join(shotDir, 'follow-idle.png') });

  await page.evaluate(() => globalThis.__shadowPulseQuality.raise(8));
  const landed = contact(await frames(2200));
  const fallVariant = landed.animations.includes('fallVariant');
  record('높은 착지 발 간격', landed.animations.includes('land') && !landed.animations.includes('slamLand') && !fallVariant && landed.gap ? 'PASS' : 'UNVERIFIED', { detail: { ...landed, fallVariant } });

  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', true));
  await page.waitForTimeout(200);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  await page.waitForFunction(() => globalThis.__shadowPulseQuality.combat()?.action == null, null, { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  const jab = contact(await frames(700));
  await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  record('정지 잽 발 간격', jab.gap ? 'PASS' : 'UNVERIFIED', { detail: jab });

  const dodges = {};
  for (const direction of ['left', 'right', 'back', 'forward']) {
    await page.waitForFunction(() => !globalThis.__shadowPulseQuality.combat()?.action, null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
    const started = await page.evaluate(dir => globalThis.__shadowPulseQuality.reviewDodge(dir), direction);
    const motion = await frames(800);
    const last = motion.at(-1);
    dodges[direction] = {
      started: started.started, key: started.key,
      distance: last && started.from ? +Math.hypot(last.x - started.from[0], last.z - started.from[2]).toFixed(3) : null,
      animations: [...new Set(motion.map(sample => sample.animation))],
      states: [...new Set(motion.map(sample => sample.state))],
    };
  }
  record('회피 이동 거리', Object.values(dodges).every(item => item.started) ? 'PASS' : 'FAIL', { detail: dodges });

  await page.evaluate(() => {
    const combat = globalThis.__shadowPulseQuality.combat();
    if (combat?.mode === 'combat') globalThis.__shadowPulseQuality.key('KeyQ', true);
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyQ', false));
  const sought = await page.evaluate(() => globalThis.__shadowPulseQuality.seekWebTarget());
  if (sought.ok) {
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
    const swing = await frames(4000);
    await page.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
    const release = await frames(500);
    const fov = swing.map(sample => sample.fov).filter(Number.isFinite);
    const xs = swing.map(sample => sample.x);
    const zs = swing.map(sample => sample.z);
    record('스윙 4초', swing.some(sample => sample.state === 'SWINGING') ? 'PASS' : 'UNVERIFIED', {
      detail: {
        sought, webs: Math.max(...swing.map(sample => sample.webs)),
        fov: fov.length ? { min: +Math.min(...fov).toFixed(2), max: +Math.max(...fov).toFixed(2) } : null,
        span: { x: +((Math.max(...xs) - Math.min(...xs)) || 0).toFixed(2), z: +((Math.max(...zs) - Math.min(...zs)) || 0).toFixed(2) },
        release: [...new Set(release.map(sample => `${sample.state}:${sample.animation}`))].slice(0, 8),
        wrist: swing.filter(sample => sample.webs > 0).map(sample => sample.wrist).slice(0, 4),
      },
    });
    await page.screenshot({ path: path.join(shotDir, 'follow-swing.png') });
  } else record('스윙 4초', 'UNVERIFIED', { detail: sought });

  await page.evaluate(() => globalThis.__shadowPulseQuality.release());
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyF', true));
  await page.evaluate(() => globalThis.__shadowPulseQuality.key('KeyW', true));
  const wall = contact(await frames(1500));
  await page.evaluate(() => { const probe = globalThis.__shadowPulseQuality; probe.key('KeyF', false); probe.key('KeyW', false); });
  record('벽 타기', wall.states.includes('WALL_RUNNING') ? 'PASS' : 'UNVERIFIED', { detail: wall });
} catch (error) {
  record('후속 플레이', 'FAIL', { detail: String(error?.stack || error).slice(0, 800) });
}

try {
  const english = await browser.newPage();
  await english.goto(`${base}/?lang=en&city=procedural`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await english.waitForFunction(() => {
    const guide = document.getElementById('controls-guide');
    return document.documentElement.lang === 'en' && /Energy Wire|energy wire/i.test(guide?.textContent || '');
  }, null, { timeout: 40000 });
  const text = await english.locator('#controls-guide').evaluate(node => node.textContent || '');
  const hangul = /[가-힣]/.test(text);
  record('영어 도움말', !hangul && text.includes('2 players 3 min') && text.includes('not to evade') ? 'PASS' : 'FAIL', { detail: { hangul, sample: text.replace(/\s+/g, ' ').slice(0, 420) } });
  await english.close();
} catch (error) {
  record('영어 도움말', 'UNVERIFIED', { detail: String(error?.message || error) });
}

report.finished = new Date().toISOString();
save();
await browser.close();
