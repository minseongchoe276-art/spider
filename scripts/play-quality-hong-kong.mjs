import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/quality-upgrade-2026-10-28';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),report={errors:[],scope:'Local Chrome, real streamed terrain; not a physical mobile test'};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))report.errors.push(m.text());});
try{
 const start=Date.now();await page.goto('http://127.0.0.1:5192/?city=hong-kong&play=solo&qualityDirector=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&globalThis.__shadowPulseQuality.playing(),null,{timeout:150000});
 report.bootMs=Date.now()-start;report.start=await page.evaluate(()=>__shadowPulseQuality.snapshot());
 await page.screenshot({path:out+'/shots/hong-kong-start.png'});
 await page.evaluate(()=>__shadowPulseQuality.begin('hong-kong-keyboard'));
 await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');await page.keyboard.press('Space');await page.waitForTimeout(2000);await page.keyboard.press('x');await page.waitForTimeout(1000);
 report.movement=await page.evaluate(()=>__shadowPulseQuality.end());report.end=await page.evaluate(()=>__shadowPulseQuality.snapshot());
 report.citizens=await page.evaluate(()=>__shadowPulseQuality.citizens());report.diagnostics=await page.evaluate(()=>__shadowPulseQuality.diagnostics());
 await page.screenshot({path:out+'/shots/hong-kong-movement.png'});
 assert(report.end.position.every(Number.isFinite));assert(report.movement.summary.travel>1);assert.equal(report.errors.length,0);report.status='PASS';console.log('PASS Hong Kong streamed start, keyboard move/jump, finite support and no uncaught errors');
}catch(e){report.status='FAIL';report.error=e.stack;console.error(e);await page.screenshot({path:out+'/shots/hong-kong-failure.png'}).catch(()=>{});process.exitCode=1;}
finally{fs.writeFileSync(out+'/hong-kong-browser.json',JSON.stringify(report,null,2));await browser.close();}
