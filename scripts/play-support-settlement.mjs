import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/support-settlement-2026-10-29',report={errors:[],scenarios:[]},browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const city of ['procedural','hong-kong']){
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>report.errors.push(e.stack));
 await page.goto(`${process.env.GAME_URL||'http://127.0.0.1:5209'}/?city=${city}&play=solo&qualityDirector=1`);await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready(),null,{timeout:150000});if(!await page.evaluate(()=>__shadowPulseQuality.playing()))await page.locator('#play-solo').click();
 const reset=async()=>{await page.evaluate(()=>__shadowPulseQuality.resetToSupportedStart());if(city==='procedural')await page.evaluate(()=>__shadowPulseQuality.place(60,.1,0,0));await page.waitForTimeout(1800);};
 for(const name of ['turnStop','combatStop']){
  await reset();await page.evaluate(()=>__shadowPulseQuality.look(0,.5,4.5));await page.waitForTimeout(400);if(name==='combatStop'){await page.keyboard.press('q');await page.waitForTimeout(500);}
  await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');
  if(name==='turnStop'){await page.keyboard.down('a');await page.waitForTimeout(300);await page.keyboard.up('a');}
  const samples=[];for(let i=0;i<14;i++){await page.waitForTimeout(120);samples.push(await page.evaluate(()=>__shadowPulseQuality.soleReview()));}
  report.scenarios.push({city,name,samples});const settled=samples.slice(-4);for(const s of settled){assert.equal(s.state,'IDLE');for(const [side,f]of Object.entries(s.feet)){assert(f.physicalGap>=-.003,`${city}/${name}/${side}: penetration ${f.physicalGap}`);assert(f.physicalGap<.008,`${city}/${name}/${side}: physical support gap ${f.physicalGap}`);assert(f.visualGap!==null && f.visualGap<.012 && f.visualGap>-.005,`${city}/${name}/${side}: visual support gap ${f.visualGap}`);}}
  await page.screenshot({path:`${out}/${city}-${name}.png`});
  if(name==='combatStop')await page.keyboard.press('q');
 }
 await page.close();
}assert.equal(report.errors.length,0);report.status='PASS';}
catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;}
finally{fs.writeFileSync(out+'/play.json',JSON.stringify(report,null,2));console.log(report.status,report.error||'',report.scenarios.map(s=>[s.city,s.name,Math.max(...s.samples.slice(-4).flatMap(x=>Object.values(x.feet).map(f=>f.physicalGap)))]));await browser.close();}
