// Plays each loaded review clip and stores one frame. Visual judgment is separate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shotDir = path.join(root, 'docs/qa/quality-director-2026-10-28/shots/motions');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const edges = new Set(['idle', 'walk', 'regularRun', 'run', 'stop', 'jump', 'fall', 'land', 'swing', 'wall', 'jab', 'cross', 'hook', 'heavy', 'special', 'hitHead', 'hitBody', 'roll']);

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
const report = { clips: [], errors: [] };
page.on('pageerror', error => report.errors.push(String(error)));
try {
  await page.goto(`${base}/?motionReview=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#motion option').length > 10, null, { timeout: 90000 });
  const names = await page.evaluate(() => [...document.querySelectorAll('#motion option')].map(option => option.value));
  report.count = names.length;
  report.names = names;
  for (const name of names) {
    const percents = edges.has(name) ? [0, 45, 90] : [45];
    const frames = [];
    for (const percent of percents) {
      await page.evaluate(({ key, percent: value }) => {
        const select = document.querySelector('#motion');
        if (select.value !== key) {
          select.value = key;
          select.dispatchEvent(new Event('change'));
        }
        document.querySelector('#frame-percent').value = String(value);
        document.querySelector('#pose-sample').click();
        document.querySelector('section').style.visibility = 'hidden';
      }, { key: name, percent });
      await page.waitForTimeout(60);
      const file = path.join(shotDir, `${name}-${percent}.png`);
      await page.screenshot({ path: file });
      frames.push({ percent, file: path.relative(root, file) });
    }
    await page.evaluate(() => { document.querySelector('section').style.visibility = 'visible'; });
    report.clips.push({ name, frames });
    console.log(name);
  }
} catch (error) {
  report.fatal = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(root, 'docs/qa/quality-director-2026-10-28/v2-motions.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ count: report.count, fatal: report.fatal || null }));
  await browser.close();
}
