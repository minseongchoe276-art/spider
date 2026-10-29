import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/hong-kong-start-upgrade-2026-10-29',r={scope:'Built production dist on localhost preview. Public DOM and ordinary keyboard input; no development QA API.',errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}});
page.on('pageerror',e=>r.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))r.errors.push(m.text());});
try{
 const start=Date.now();await page.goto('http://127.0.0.1:5195/?city=hong-kong&play=solo',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#loading-screen')?.classList.contains('hidden')&&document.querySelector('#solo-objective')&&!document.querySelector('#solo-objective').hidden,null,{timeout:150000});
 r.bootMs=Date.now()-start;r.qaApiPresent=await page.evaluate(()=>!!globalThis.__shadowPulseQuality);assert(!r.qaApiPresent);
 await page.waitForTimeout(5000);r.before=await page.locator('#solo-objective').innerText();await page.screenshot({path:`${out}/production-start.png`});
 await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.press('Space');await page.waitForTimeout(500);await page.keyboard.up('w');await page.waitForTimeout(2000);
 r.after=await page.locator('#solo-objective').innerText();await page.screenshot({path:`${out}/production-movement.png`});assert.notEqual(r.after,r.before,'Public movement objective did not progress');assert.equal(r.errors.length,0);r.status='PASS';console.log(JSON.stringify(r,null,2));
}catch(e){r.status='FAIL';r.error=e.stack;console.error(e);await page.screenshot({path:`${out}/production-failure.png`}).catch(()=>{});process.exitCode=1;}
finally{fs.writeFileSync(`${out}/production.json`,JSON.stringify(r,null,2));await browser.close();}
