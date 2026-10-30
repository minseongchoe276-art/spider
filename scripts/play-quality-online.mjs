// Local four-player room on the dev /ws server. Does not open the production socket.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = path.join(root, 'docs/qa/quality-upgrade-2026-10-28/shots');
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5192';
const names = ['DirectorA', 'DirectorB', 'DirectorC', 'DirectorD'];
const report = { players: names.length, started: new Date().toISOString() };

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-background-timer-throttling', '--disable-dev-shm-usage', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const pages = [];
for (const name of names) pages.push(await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 }));

async function boot(target, name) {
  await target.goto(`${base}/?city=procedural&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await target.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 120000 });
  await target.locator('#open-multiplayer').click();
  await target.locator('#player-name').fill(name);
  return target.evaluate(player => {
    const input = document.getElementById('player-name');
    input.value = player;
    document.querySelector('[data-mode="free"]')?.click();
    document.getElementById('room-capacity').value = '4';
    return { ws: location.origin + '/ws', probe: globalThis.__shadowPulseQuality?.build || null };
  }, name);
}

try {
  report.boots = [];
  for (let index = 0; index < pages.length; index++) report.boots.push(await boot(pages[index], names[index]));
  const host = pages[0];
  await host.evaluate(() => document.getElementById('create-room').click());
  await host.waitForFunction(() => (document.getElementById('room-code-display')?.textContent || '').trim().length >= 4, null, { timeout: 15000 });
  report.code = (await host.locator('#room-code-display').innerText()).trim();
  for (const guest of pages.slice(1)) {
    await guest.evaluate(value => {
      document.getElementById('room-code').value = value;
      document.getElementById('join-code').click();
    }, report.code);
    await guest.waitForFunction(() => !document.getElementById('room-panel').classList.contains('hidden'), null, { timeout: 15000 });
  }
  for (const target of pages) await target.evaluate(() => document.getElementById('room-ready').click());
  await host.waitForTimeout(400);
  await host.evaluate(() => document.getElementById('room-start').click());
  for (const target of pages) await target.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 25000 });
  report.connected = pages.length;
  await host.keyboard.down('w');
  await host.waitForTimeout(900);
  await host.keyboard.up('w');
  await host.waitForTimeout(700);
  const hostSnap = await host.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  report.host = { position: hostSnap.position, state: hostSnap.state, facing: hostSnap.facing, animation: hostSnap.animation };
  report.views = [];
  for (let index = 1; index < pages.length; index++) {
    const peers = await pages[index].evaluate(() => globalThis.__shadowPulseQuality.peers());
    const match = peers.find(peer => peer.name === 'DirectorA');
    const error = match?.position ? Math.hypot(match.position[0] - hostSnap.position[0], match.position[2] - hostSnap.position[2]) : null;
    report.views.push({ viewer: names[index], peers, horizontalError: error === null ? null : +error.toFixed(3) });
  }
  await host.keyboard.press('q');
  await host.waitForTimeout(200);
  await host.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, true));
  await host.waitForTimeout(250);
  const attack = await host.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
  await host.evaluate(() => globalThis.__shadowPulseQuality.mouse(0, false));
  await host.waitForTimeout(400);
  report.attack = { key: attack.attack, animation: attack.animation, state: attack.state };
  report.attackPeers = [];
  for (let index = 1; index < pages.length; index++) {
    report.attackPeers.push({ viewer: names[index], peers: await pages[index].evaluate(() => globalThis.__shadowPulseQuality.peers()) });
  }
  await pages[3].screenshot({ path: path.join(shotDir, 'v2-mp4-guest.png') });
  await host.screenshot({ path: path.join(shotDir, 'v2-mp4-host.png') });
  const leaving = pages[3];
  await leaving.reload({ waitUntil: 'domcontentloaded' });
  await leaving.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 90000 });
  await leaving.waitForTimeout(1500);
  report.reconnect = await leaving.evaluate(() => ({
    playing: globalThis.__shadowPulseQuality.playing(),
    peers: globalThis.__shadowPulseQuality.peers(),
    href: location.href,
  }));
  report.hostAfterReconnect = await host.evaluate(() => globalThis.__shadowPulseQuality.peers());
  report.status = report.views.every(view => view.horizontalError !== null && view.horizontalError < 3) ? 'PASS' : 'FAIL';
} catch (error) {
  report.status = 'BLOCKED';
  report.fatal = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(root, 'docs/qa/quality-upgrade-2026-10-28/v2-multi4.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, code: report.code, views: report.views?.map(view => view.horizontalError), fatal: report.fatal || null }));
  await browser.close();
}
