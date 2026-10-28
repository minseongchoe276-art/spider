// Raw review frames for every loaded clip at 10/25/50/75/90%.
// Motion review samples the compiled clip. It does not apply heavyClipPhase.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shotDir = path.join(root, 'docs/qa/quality-director-2026-10-28/shots/v3-motions');
fs.mkdirSync(shotDir, { recursive: true });
const base = process.env.QUALITY_URL || 'http://127.0.0.1:5191';
const percents = [10, 25, 50, 75, 90];
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
const report = { started: new Date().toISOString(), percents, clips: [], errors: [] };
page.on('pageerror', error => report.errors.push(String(error)));

try {
  await page.goto(`${base}/?motionReview=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#motion option').length > 10, null, { timeout: 90000 });
  const names = await page.evaluate(() => [...document.querySelectorAll('#motion option')].map(option => option.value));
  report.count = names.length;
  report.names = names;
  for (const name of names) {
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
      await page.waitForTimeout(40);
      const file = path.join(shotDir, `${name}-${percent}.png`);
      await page.screenshot({ path: file });
      const sha1 = createHash('sha1').update(fs.readFileSync(file)).digest('hex');
      frames.push({ percent, sha1, file: path.relative(root, file) });
    }
    await page.evaluate(() => { document.querySelector('section').style.visibility = 'visible'; });
    report.clips.push({ name, frames });
    console.log(name);
  }
  const byHash = new Map();
  for (const clip of report.clips) for (const frame of clip.frames) {
    const key = `${frame.percent}:${frame.sha1}`;
    const list = byHash.get(key) || [];
    list.push(clip.name);
    byHash.set(key, list);
  }
  report.identical = [...byHash.entries()].filter(([, names]) => names.length > 1).map(([key, names]) => {
    const [percent, sha1] = key.split(':');
    return { percent: Number(percent), sha1, names };
  });
} catch (error) {
  report.fatal = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(root, 'docs/qa/quality-director-2026-10-28/v3-motions.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ count: report.count, identical: report.identical?.length || 0, fatal: report.fatal || null }));
  await browser.close();
}
