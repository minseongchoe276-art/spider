// Continuous local jab from before the click until after recovery.
// Two players on the dev /ws server. Does not open production.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'docs/qa/quality-director-2026-10-28');
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const report = { started: new Date().toISOString(), players: 2 };
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-background-timer-throttling', '--disable-dev-shm-usage'],
});
const host = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const guest = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });

async function boot(target, name) {
  await target.goto(`${base}/?city=procedural&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await target.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 120000 });
  await target.evaluate(player => {
    document.getElementById('player-name').value = player;
    document.querySelector('[data-mode="free"]')?.click();
    document.getElementById('room-capacity').value = '2';
  }, name);
}

try {
  await boot(host, 'DirectorA');
  await boot(guest, 'DirectorB');
  await host.evaluate(() => document.getElementById('create-room').click());
  await host.waitForFunction(() => (document.getElementById('room-code-display')?.textContent || '').trim().length >= 4, null, { timeout: 15000 });
  report.code = (await host.locator('#room-code-display').innerText()).trim();
  await guest.evaluate(value => {
    document.getElementById('room-code').value = value;
    document.getElementById('join-code').click();
  }, report.code);
  await guest.waitForFunction(() => !document.getElementById('room-panel').classList.contains('hidden'), null, { timeout: 15000 });
  await host.evaluate(() => document.getElementById('room-ready').click());
  await guest.evaluate(() => document.getElementById('room-ready').click());
  await host.waitForTimeout(300);
  await host.evaluate(() => document.getElementById('room-start').click());
  await host.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 25000 });
  await guest.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 25000 });
  await host.waitForTimeout(600);
  await host.keyboard.press('q');
  await host.waitForTimeout(250);
  report.build = await host.evaluate(() => globalThis.__shadowPulseQuality.dump().build);

  const timeline = [];
  const started = Date.now();
  const poll = async (mark) => {
    const local = await host.evaluate(() => {
      const snap = globalThis.__shadowPulseQuality.snapshot();
      return { animation: snap.animation, animationTime: snap.animationTime, attack: snap.attack, state: snap.state, facing: snap.facing };
    });
    const remote = await guest.evaluate(() => {
      const peer = globalThis.__shadowPulseQuality.peers().find(item => item.name === 'DirectorA');
      return peer || null;
    });
    timeline.push({ ms: Date.now() - started, mark, local, remote });
  };

  await poll('before');
  await host.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  for (let step = 0; step < 16; step++) {
    await host.waitForTimeout(80);
    await poll(step < 1 ? 'down' : 'hold');
  }
  await host.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  for (let step = 0; step < 8; step++) {
    await host.waitForTimeout(80);
    await poll('up');
  }
  report.timeline = timeline;
  report.localKeys = [...new Set(timeline.map(row => row.local?.attack?.key || row.local?.animation))];
  report.remoteMotions = [...new Set(timeline.map(row => row.remote?.motion || 'missing'))];
  report.remoteCombats = [...new Set(timeline.map(row => row.remote?.combat?.key || 'none'))];
  const jabRows = timeline.filter(row => row.local?.attack?.key === 'jab' || row.local?.animation === 'jab');
  const remoteJab = timeline.filter(row => row.remote?.motion === 'jab' || row.remote?.combat?.key === 'jab' || row.remote?.network?.key === 'jab');
  report.localJabSamples = jabRows.length;
  report.remoteJabSamples = remoteJab.length;
  report.firstRemoteJabMs = remoteJab[0]?.ms ?? null;
  report.firstLocalJabMs = jabRows[0]?.ms ?? null;
  await guest.screenshot({ path: path.join(outDir, 'shots/v3-remote-guest.png') });
  await host.screenshot({ path: path.join(outDir, 'shots/v3-remote-host.png') });
  report.status = jabRows.length && remoteJab.length ? 'RECORDED' : 'RECORDED_NO_REMOTE_JAB';
} catch (error) {
  report.status = 'BLOCKED';
  report.fatal = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(outDir, 'v3-remote.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    status: report.status,
    code: report.code,
    local: report.localKeys,
    remoteMotion: report.remoteMotions,
    remoteCombat: report.remoteCombats,
    firstLocal: report.firstLocalJabMs,
    firstRemote: report.firstRemoteJabMs,
    fatal: report.fatal || null,
  }));
  await browser.close();
}
