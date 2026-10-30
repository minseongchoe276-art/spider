import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const folder='docs/qa/expert-game-audit-2026-10-30';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results=[];
page.on('pageerror',error=>errors.push(String(error)));
const base=process.env.QUALITY_URL||'http://127.0.0.1:5194';
try{
  await page.addInitScript(()=>{
    localStorage.setItem('shadow-pulse-journey-v1',JSON.stringify({lesson:2}));
    localStorage.setItem('shadow-pulse-preferences-v1',JSON.stringify({settings:{webToggle:true}}));
  });
  await page.goto(base+'/?city=procedural&play=solo&qualityDirector=1');
  await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&__shadowPulseQuality.playing(),null,{timeout:120000});
  await page.waitForFunction(()=>document.querySelector('#solo-objective p')?.textContent.includes('한 번'));
  assert.match(await page.locator('#solo-objective progress').getAttribute('aria-label'),/진행도/);
  results.push({name:'Fresh solo tutorial respects wire toggle and names its progress meter',pass:true});
  await page.keyboard.press('Escape');await page.locator('#btn-start-drag').click();
  const before=await page.evaluate(()=>__shadowPulseQuality.snapshot().position);
  await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
  const after=await page.evaluate(()=>__shadowPulseQuality.snapshot().position);
  assert(Math.hypot(...after.map((v,i)=>v-before[i]))>.5);
  results.push({name:'Live W movement after pause and resume',pass:true});
  await page.screenshot({path:folder+'/desktop.png'});
  await page.keyboard.press('Escape');
  await page.locator('#exploration-menu').evaluate(el=>el.open=true);
  await page.locator('#btn-mission-rooftops').click();
  await page.waitForFunction(()=>__shadowPulseQuality.experience().mission?.type==='rooftops');
  assert.match(await page.locator('#solo-objective p').textContent(),/1\/3/);
  results.push({name:'Rooftop mission begins with destination 1 of 3',pass:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.locator('#solo-objective').evaluate(el=>el.getBoundingClientRect().width>=300),'Narrow objective must remain readable');
  assert(await page.evaluate(()=>{
    const objective=document.querySelector('#solo-objective').getBoundingClientRect(),notice=document.querySelector('#game-notice');
    return !notice.classList.contains('visible')||objective.top>=notice.getBoundingClientRect().bottom+8;
  }),'Notice must not cover the active objective');
  await page.screenshot({path:folder+'/narrow.png'});
  results.push({name:'390px viewport keeps a readable objective without notice overlap or horizontal overflow',pass:true});
  await page.setViewportSize({width:1440,height:900});
  for(let index=0;index<3;index++){
    const mission=await page.evaluate(()=>__shadowPulseQuality.experience().mission);
    assert(mission?.target);
    // Arrival setup only; completion still goes through live support and dwell.
    await page.evaluate(target=>__shadowPulseQuality.place(target.x,target.y,target.z,0),mission.target);
    await page.waitForTimeout(1000);
  }
  const completed=await page.evaluate(()=>__shadowPulseQuality.experience());
  assert.equal(completed.mission,null);assert(completed.records['procedural:rooftops']);
  results.push({name:'Three supported arrival fixtures complete the real mission and save a personal result',pass:true});
  await page.keyboard.press('x');
  await page.evaluate(()=>__shadowPulseQuality.begin('moving-jab'));
  await page.keyboard.down('w');await page.mouse.down({button:'left'});
  await page.waitForTimeout(200);
  const attack=await page.evaluate(()=>__shadowPulseQuality.snapshot().attack);
  assert.equal(attack?.key,'jab');
  await page.screenshot({path:folder+'/moving-combat.png'});
  await page.mouse.up({button:'left'});await page.waitForTimeout(650);await page.keyboard.up('w');
  const moving=await page.evaluate(()=>__shadowPulseQuality.end());
  assert(moving.summary.travel>.3);
  results.push({name:'Real W and left mouse perform a moving jab without stopping travel',pass:true});
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mobile=await mobileContext.newPage();mobile.on('pageerror',error=>errors.push(String(error)));
  await mobile.goto(base+'/?city=procedural&play=solo&qualityDirector=1');
  await mobile.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&__shadowPulseQuality.playing(),null,{timeout:120000});
  assert(await mobile.evaluate(()=>document.body.classList.contains('touch-device')));
  assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobile.screenshot({path:folder+'/touch.png'});
  results.push({name:'Emulated touch device starts solo play and renders its touch HUD at 390px',pass:true});
  await mobileContext.close();
  assert.equal(errors.length,0);
}catch(error){results.push({name:'Browser verification',pass:false,error:error.stack});process.exitCode=1;await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});}
finally{fs.writeFileSync(folder+'/browser.json',JSON.stringify({scope:'Local procedural city; real keyboard/menu input. No live online or physical mobile-device validation.',results,errors},null,2));await browser.close();}
console.log(JSON.stringify({results,errors},null,2));
