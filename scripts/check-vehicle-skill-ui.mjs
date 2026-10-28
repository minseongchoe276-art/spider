import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const folder=process.env.VEHICLE_UI_OUT||'docs/qa/vehicle-skill-ui-2026-10-28';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const errors=[],checks=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.VEHICLE_UI_URL||'http://127.0.0.1:5196')+'/?city=procedural&play=solo&qualityDirector=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready?.()&&globalThis.__shadowPulseQuality.playing(),null,{timeout:90000});
 const panel=page.locator('#vehicle-ui');await panel.waitFor({state:'visible'});assert.equal(await panel.locator('select').count(),0);
 for(const image of await panel.locator('img').all())await image.evaluate(img=>img.decode());
 const alignment=await page.evaluate(()=>{const a=document.getElementById('ability-bar').getBoundingClientRect(),b=document.getElementById('vehicle-ui').getBoundingClientRect();return {skillBottom:a.bottom,vehicleBottom:b.bottom,skillRight:a.right,vehicleLeft:b.left};});assert(Math.abs(alignment.skillBottom-alignment.vehicleBottom)<2&&alignment.vehicleLeft>alignment.skillRight,'Vehicle slots do not share the bottom skill row');checks.push('Desktop vehicle slots align with bottom skill row');
 await panel.screenshot({path:folder+'/panel.png'});await page.screenshot({path:folder+'/desktop.png'});
 for(const id of ['corvette','bmw']){
  await page.click(`[data-vehicle="${id}"]`);
  await page.waitForFunction(id=>{const v=globalThis.__shadowPulseQuality.vehicle();return v?.state==='PARKED'&&v.model===id;},id,{timeout:60000});
  assert.equal(await page.locator(`[data-vehicle="${id}"]`).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.vehicle-interact span').textContent(),'탑승');checks.push(id+' icon selects and summons in one click');
 }
 await page.screenshot({path:folder+'/summoned.png'});
 for(const touch of [false,true]){
  const phone=touch?await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}):page;
  if(touch){phone.on('pageerror',e=>errors.push(e.message));await phone.goto((process.env.VEHICLE_UI_URL||'http://127.0.0.1:5196')+'/?city=procedural&play=solo&qualityDirector=1');await phone.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready?.()&&globalThis.__shadowPulseQuality.playing(),null,{timeout:90000});}
  await phone.setViewportSize({width:390,height:844});
  const bounds=await phone.evaluate(()=>{const r=document.getElementById('vehicle-ui').getBoundingClientRect();const minimap=document.querySelector('#minimap-panel');const m=minimap?.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,top:r.top,minimap:m?{top:m.top,bottom:m.bottom,left:m.left,right:m.right}:null};});
  assert(bounds.left>=0&&bounds.right<=390);if(bounds.minimap)assert(bounds.bottom<=bounds.minimap.top||bounds.top>=bounds.minimap.bottom||bounds.right<=bounds.minimap.left||bounds.left>=bounds.minimap.right,'Vehicle UI overlaps minimap');
  await phone.screenshot({path:folder+(touch?'/touch.png':'/mobile.png')});
  const overlaps=await phone.evaluate(()=>{const vehicle=document.getElementById('vehicle-ui').getBoundingClientRect();return [...document.querySelectorAll('.touch-stick,.touch-actions button,.touch-extra,.touch-mode')].filter(n=>n.getBoundingClientRect().width>0&&getComputedStyle(n).display!=='none').some(n=>{const b=n.getBoundingClientRect();return vehicle.left<b.right&&vehicle.right>b.left&&vehicle.top<b.bottom&&vehicle.bottom>b.top;});});assert(!overlaps,'Vehicle slots overlap touch controls');checks.push((touch?'touch':'small desktop')+' viewport keeps slots onscreen');
  if(!touch){await phone.keyboard.press('KeyQ');await phone.waitForFunction(()=>document.body.classList.contains('combat-hud-active'));const overlap=await phone.evaluate(()=>{const a=document.getElementById('ability-bar').getBoundingClientRect(),b=document.getElementById('minimap-panel').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});assert(!overlap,'Combat skills overlap minimap');await phone.screenshot({path:folder+'/mobile-combat.png'});await phone.keyboard.press('KeyQ');checks.push('Narrow combat skill row clears minimap');}
 }
 assert.deepEqual(errors,[]);const result={status:'PASS',checks,errors};fs.writeFileSync(folder+'/results.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser.close();}
