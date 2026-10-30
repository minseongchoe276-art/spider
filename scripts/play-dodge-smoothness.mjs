import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const folder='docs/qa/dodge-smoothness-2026-10-30',errors=[],results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.addInitScript(()=>localStorage.setItem('shadow-pulse-journey-v1',JSON.stringify({lesson:6})));
 await page.goto((process.env.QUALITY_URL||'http://127.0.0.1:5195')+'/?city=procedural&play=solo&qualityDirector=1');
 await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&__shadowPulseQuality.playing(),null,{timeout:120000});
 await page.keyboard.press('x');assert.equal(await page.evaluate(()=>__shadowPulseQuality.combat().mode),'combat');
 for(const movement of ['idle','walk','sprint'])for(const [key,expected] of [['q','dodgeLeft'],['e','dodgeRight']]){
  await page.evaluate(()=>__shadowPulseQuality.resetToSupportedStart());await page.waitForTimeout(300);
  if(movement!=='idle'){if(movement==='sprint')await page.keyboard.down('Shift');await page.keyboard.down('w');await page.waitForTimeout(550);}
  await page.evaluate(()=>{globalThis.dodgeFrames=[];const start=performance.now();const frame=()=>{dodgeFrames.push(__shadowPulseQuality.snapshot());if(performance.now()-start<700)requestAnimationFrame(frame);};requestAnimationFrame(frame);});
  await page.keyboard.press(key);await page.waitForTimeout(140);
  if(movement==='idle')await page.screenshot({path:`${folder}/${expected}.png`});
  await page.waitForTimeout(620);
  if(movement!=='idle'){await page.keyboard.up('w');if(movement==='sprint')await page.keyboard.up('Shift');}
  const frames=await page.evaluate(()=>dodgeFrames),active=frames.filter(f=>f.attack?.key===expected);
  assert(active.length>0,`${movement} ${key} must start ${expected}`);
  assert(active.every(f=>f.position.every(Number.isFinite)&&f.velocity.every(Number.isFinite)));
  assert(active.filter(f=>f.animation==='combatIdle').every(f=>f.animationTime===0),'Idle carrier must not fast-forward during a dodge');
  assert(!frames.at(-1).attack,'Dodge must finish and return control');
  results.push({movement,key,expected,activeFrames:active.length,frames});
 }
 assert.equal(errors.length,0);console.log('PASS 6 Chrome scenarios using actual Q/E keys, including W and Shift+W');
}catch(e){process.exitCode=1;results.push({pass:false,error:e.stack});await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});}
finally{fs.writeFileSync(folder+'/browser.json',JSON.stringify({results,errors},null,2));await browser.close();}
