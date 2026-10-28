import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shotDir = path.join(root, 'docs/qa/quality-director-2026-10-28/shots');
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const host = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const guest = await browser.newPage({ viewport: { width: 1200, height: 800 } });
async function boot(target, name) {
  await target.goto(`${base}/?city=procedural&qualityDirector=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await target.waitForFunction(() => globalThis.__shadowPulseQuality?.ready?.(), null, { timeout: 90000 });
  return target.evaluate(player => {
    const input = document.getElementById('player-name');
    input.value = player;
    document.querySelector('[data-mode="free"]')?.click();
    const capacity = document.getElementById('room-capacity');
    capacity.value = '2';
    return { status: document.getElementById('online-status')?.textContent || '', visible: input.getClientRects().length > 0 };
  }, name);
}
const hostBoot = await boot(host, 'DirectorA');
const guestBoot = await boot(guest, 'DirectorB');
await host.evaluate(() => document.getElementById('create-room').click());
await host.waitForFunction(() => (document.getElementById('room-code-display')?.textContent || '').trim().length >= 4, null, { timeout: 15000 });
const code = (await host.locator('#room-code-display').innerText()).trim();
await guest.evaluate(value => {
  document.getElementById('room-code').value = value;
  document.getElementById('join-code').click();
}, code);
await guest.waitForFunction(() => !document.getElementById('room-panel').classList.contains('hidden'), null, { timeout: 15000 });
await host.evaluate(() => document.getElementById('room-ready').click());
await guest.evaluate(() => document.getElementById('room-ready').click());
await host.waitForTimeout(300);
await host.evaluate(() => document.getElementById('room-start').click());
await host.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 20000 });
await guest.waitForFunction(() => globalThis.__shadowPulseQuality.playing(), null, { timeout: 20000 });
await host.keyboard.down('w');
await host.waitForTimeout(1000);
await host.keyboard.up('w');
await host.waitForTimeout(600);
const hostSnap = await host.evaluate(() => globalThis.__shadowPulseQuality.snapshot());
const guestPeers = await guest.evaluate(() => globalThis.__shadowPulseQuality.peers());
const seen = guestPeers.some(peer => peer.position && Math.hypot(peer.position[0] - hostSnap.position[0], peer.position[2] - hostSnap.position[2]) < 12);
await host.screenshot({ path: path.join(shotDir, 'mp-host.png') });
await guest.screenshot({ path: path.join(shotDir, 'mp-guest.png') });
const report = { hostBoot, guestBoot, code, seen, host: hostSnap.position, hostState: hostSnap.state, guestPeers };
fs.writeFileSync(path.join(root, 'docs/qa/quality-director-2026-10-28/multi-retest.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!seen) process.exitCode = 1;
