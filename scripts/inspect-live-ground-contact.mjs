import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/ground-contact-2026-10-29',browser=await chromium.launch({channel:'chrome',headless:true}),report={},label=process.env.CONTACT_LABEL||'before';
try{for(const city of ['procedural','hong-kong']){
 const page=await browser.newPage({viewport:{width:1280,height:800}}),rows=[];page.on('pageerror',e=>rows.push({error:e.stack}));await page.goto(`http://127.0.0.1:5209/?city=${city}&play=solo&qualityDirector=1`);await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready(),null,{timeout:150000});if(!await page.evaluate(()=>__shadowPulseQuality.playing()))await page.locator('#play-solo').click();
 if(city==='procedural')await page.evaluate(()=>__shadowPulseQuality.place(60,.1,0,0));
 await page.waitForTimeout(1500);await page.evaluate(()=>__shadowPulseQuality.look(1.3,.15,3));await page.waitForTimeout(500);
 for(const [name,keys]of [['idle',[]],['walk',['w']],['run',['w','Shift']],['stop',[]],['turn',['a']],['combat',['q']],['combatWalk',['w']],['combatStop',[]]]){
  for(const k of keys)await page.keyboard.down(k);for(let i=0;i<7;i++){await page.waitForTimeout(160);rows.push({name,...await page.evaluate(()=>__shadowPulseQuality.soleReview())});}for(const k of keys)await page.keyboard.up(k);
  await page.screenshot({path:`${out}/${label}-${city}-${name}.png`});
 }
 report[city]=rows;fs.writeFileSync(`${out}/${label}.json`,JSON.stringify(report,null,2));await page.close();
}}finally{await browser.close();}
