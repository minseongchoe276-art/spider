import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/hong-kong-district-2026-10-29',label=process.argv[2]||'models';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1200,height:1000}}),r={errors:[]};
page.on('pageerror',e=>r.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});
try{
await page.goto('http://127.0.0.1:5192/?city=hong-kong&play=solo&qualityDirector=1');await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready(),null,{timeout:150000});if(!await page.evaluate(()=>__shadowPulseQuality.playing()))await page.locator('#play-solo').click();await page.waitForFunction(()=>__shadowPulseQuality.playing());await page.waitForTimeout(12000);
assert(await page.evaluate(()=>__shadowPulseQuality.playing()));
Object.assign(r,await page.evaluate(()=>({meshes:__shadowPulseQuality.districtSurvey(),trees:__shadowPulseQuality.treeSurvey(),surfaces:__shadowPulseQuality.citySurvey(),diagnostics:__shadowPulseQuality.diagnostics(),snapshot:__shadowPulseQuality.snapshot()})));
await page.screenshot({path:`${out}/${label}-start.png`});
await page.evaluate(()=>__shadowPulseQuality.districtView(false));const original=await page.evaluate(()=>__shadowPulseQuality.districtOverview());fs.writeFileSync(`${out}/${label}-original-overview.png`,Buffer.from(original.split(',')[1],'base64'));await page.evaluate(()=>__shadowPulseQuality.districtView(true));const png=await page.evaluate(()=>__shadowPulseQuality.districtOverview());fs.writeFileSync(`${out}/${label}-overview.png`,Buffer.from(png.split(',')[1],'base64'));assert.equal(r.errors.length,0);r.status='PASS';console.log('Survey saved',r.diagnostics.city.district);
}catch(e){r.status='FAIL';r.error=e.stack;console.error(e);process.exitCode=1;await page.screenshot({path:`${out}/${label}-failure.png`}).catch(()=>{});}
finally{fs.writeFileSync(`${out}/${label}-survey.json`,JSON.stringify(r,null,2));await browser.close();}
