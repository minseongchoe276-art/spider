// Live combat pose pipeline, side camera. Applies heavyClipPhase and poseCombatLife.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shotDir = path.join(root, 'docs/qa/quality-director-2026-10-28/shots/v3-combat');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const keys = ['jab', 'cross', 'hook', 'heavy', 'rightHook', 'special'];
const phases = [0.1, 0.25, 0.5, 0.75, 0.9];
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
const report = { started: new Date().toISOString(), poses: [], errors: [] };
page.on('pageerror', error => report.errors.push(String(error)));

try {
  await page.goto(`${base}/?combatReview=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#combat-clip option').length > 5, null, { timeout: 90000 });
  await page.evaluate(() => { document.querySelector('#combat-camera-view').value = 'side'; });
  for (const key of keys) {
    for (const phase of phases) {
      const label = await page.evaluate(({ key, phase }) => {
        const select = document.querySelector('#combat-clip');
        select.value = key;
        document.querySelector('#combat-phase').value = String(phase);
        document.querySelector('#combat-sample').click();
        document.querySelector('section').style.visibility = 'hidden';
        for (const node of document.querySelectorAll('select,button')) node.style.visibility = 'hidden';
        return document.querySelector('#combat-output').textContent;
      }, { key, phase });
      await page.waitForTimeout(50);
      const file = path.join(shotDir, `${key}-${Math.round(phase * 100)}.png`);
      await page.screenshot({ path: file });
      report.poses.push({
        key, phase, label,
        sha1: createHash('sha1').update(fs.readFileSync(file)).digest('hex'),
        file: path.relative(root, file),
      });
    }
    console.log(key);
  }
  const pairs = [];
  for (const phase of phases) {
    const hook = report.poses.find(pose => pose.key === 'hook' && pose.phase === phase);
    const heavy = report.poses.find(pose => pose.key === 'heavy' && pose.phase === phase);
    pairs.push({ phase, same: hook.sha1 === heavy.sha1, hook: hook.sha1, heavy: heavy.sha1 });
  }
  report.hookVersusHeavy = pairs;
} catch (error) {
  report.fatal = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(root, 'docs/qa/quality-director-2026-10-28/v3-combat-pose.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pairs: report.hookVersusHeavy, fatal: report.fatal || null }));
  await browser.close();
}
