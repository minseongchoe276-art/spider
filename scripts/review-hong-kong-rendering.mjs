import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/hong-kong-polish-2026-10-29';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),r={errors:[],steps:[],scope:'Local desktop Chrome, real external Hong Kong tiles. Fixture positioning is identified; no physical mobile, whole-territory or long-soak claim.'};
page.on('pageerror',e=>r.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))r.errors.push(m.text());});
const qa=(method,...args)=>page.evaluate(({method,args})=>__shadowPulseQuality[method](...args),{method,args});
const shot=name=>page.screenshot({path:`${out}/final-${name}.png`});
const hold=async(key,ms)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
try{
  const start=Date.now();
  await page.goto('http://127.0.0.1:5192/?city=hong-kong&play=solo&qualityDirector=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&__shadowPulseQuality.playing(),null,{timeout:150000});
  r.bootMs=Date.now()-start;r.start=await qa('snapshot');await shot('start');
  await qa('begin','hong-kong-rendering-walk-jump');await hold('w',1200);await page.keyboard.press('Space');await page.waitForTimeout(2000);await page.keyboard.press('x');await page.waitForTimeout(1000);
  r.movement=await qa('end');assert(r.movement.summary.travel>1);r.steps.push('Real keyboard walk/jump and camera recenter');
  await page.waitForTimeout(10000);
  r.diagnostics=await qa('diagnostics');r.survey=await qa('citySurvey');r.comparison=await qa('snapshot');await shot('movement');
  assert(r.diagnostics.city.layers.some(l=>l.surface==='building'&&l.meshes>0),'Structural buildings still starved');
  assert(r.diagnostics.city.layers.filter(l=>l.surface!=='terrain').every(l=>!l.loadAncestors&&!l.loadSiblings));
  assert(r.diagnostics.city.layers.filter(l=>l.surface==='terrain').every(l=>l.shadowCasters===0));
  assert.equal(r.diagnostics.city.textureFailures.length,0);r.steps.push('Buildings visible, photographic coverage retained, anisotropy and texture decode diagnostics');
  r.anchor=await qa('seekWebTarget');
  if(r.anchor.ok){await qa('mouse',0,true);await page.waitForTimeout(850);r.swing=await qa('snapshot');await shot('swing');await qa('mouse',0,false);assert(r.swing.webs.length>0||r.swing.state==='SWINGING','Accepted anchor did not attach');r.steps.push('Real mouse web attachment on streamed collision');}
  await qa('release');await page.waitForTimeout(1000);
  // Restore the recorded, genuinely supported start rather than inventing a flat road.
  await qa('place',...r.start.position,0);await page.waitForTimeout(1000);
  await page.keyboard.press('b');await page.waitForTimeout(500);
  await page.waitForFunction(()=>!__shadowPulseQuality.vehicle()?.loading,null,{timeout:45000});
  r.vehicle=await qa('vehicle');
  if(r.vehicle.state==='PARKED'&&r.vehicle.doorPoint){
    await qa('place',...r.vehicle.doorPoint,0);await page.waitForTimeout(300);await page.keyboard.press('b');
    await page.waitForFunction(()=>__shadowPulseQuality.vehicle()?.state==='DRIVING',null,{timeout:10000});
    await hold('w',1200);r.driving=await qa('vehicle');assert(r.driving.position.every(Number.isFinite));await shot('driving');
    await page.keyboard.press('b');r.steps.push('B summon/entry, W drive and B exit on actual Hong Kong support');
  }else{r.vehicleLimit='No safe summon footprint at this start; no fictitious road fixture used';}
  await qa('release');
  r.end=await qa('snapshot');assert(r.end.position.every(Number.isFinite));assert.equal(r.errors.length,0);
  // Observe replacement tiles while rotating with the ordinary camera state.
  r.views=[];
  for(const [name,yaw]of [['west',Math.PI/2],['city',Math.PI]]){
    await qa('look',yaw,.12,7);await page.waitForTimeout(3000);r.views.push({name,snapshot:await qa('snapshot'),diagnostics:await qa('diagnostics')});await shot(name);
  }
  r.status='PASS';console.log(JSON.stringify({status:r.status,bootMs:r.bootMs,steps:r.steps,vehicleLimit:r.vehicleLimit,errors:r.errors}));
}catch(e){r.status='FAIL';r.error=e.stack;console.error(e);await shot('failure').catch(()=>{});process.exitCode=1;}
finally{fs.writeFileSync(`${out}/final-browser.json`,JSON.stringify(r,null,2));await browser.close();}
