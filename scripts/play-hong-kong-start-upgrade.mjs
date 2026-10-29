import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/hong-kong-start-upgrade-2026-10-29';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const report={scope:'Local desktop Chrome; external Hong Kong tiles; ordinary keyboard/mouse inputs from actual spawn. QA camera aiming is identified. No physical mobile claim.',errors:[],steps:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))report.errors.push(m.text());});
const qa=(method,...args)=>page.evaluate(({method,args})=>__shadowPulseQuality[method](...args),{method,args});
const shot=name=>page.screenshot({path:`${out}/${name}.png`});
const hold=async(key,ms)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
try{
 const start=Date.now();await page.goto('http://127.0.0.1:5192/?city=hong-kong&play=solo&qualityDirector=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.playing(),null,{timeout:150000});
 report.bootMs=Date.now()-start;await page.waitForTimeout(15000);
 report.start=await qa('snapshot');report.initialDiagnostics=await qa('diagnostics');report.initialSurvey=await qa('citySurvey');await shot('after-start');
 assert(Math.abs(report.start.position[1]-20.513)<.2,'Actual starting support changed');
 assert(report.initialDiagnostics.city.startSurfaces.triangles>0,'No terrace triangles replaced');
 await qa('begin','start-terrace-real-input');
 await hold('w',1000);await page.keyboard.press('Space');await hold('w',700);await page.waitForTimeout(1600);await page.keyboard.press('x');await page.waitForTimeout(1000);
 report.walkJump=await qa('end');await shot('after-walk-jump');
 assert(report.walkJump.summary.travel>5,'Keyboard input did not move');assert(report.walkJump.summary.states.includes('JUMPING'),'Jump not observed');
 report.steps.push('W walk/run, Space jump, X camera recenter from genuine start');
 report.anchor=await qa('seekWebTarget');
 if(report.anchor.ok){await qa('begin','start-real-mouse-swing');await qa('mouse',0,true);await page.waitForTimeout(1000);report.swing=await qa('snapshot');await shot('after-swing');await qa('mouse',0,false);await page.waitForTimeout(1800);report.swingMovement=await qa('end');assert(report.swing.webs.length>0||report.swing.state==='SWINGING');report.steps.push('Mouse web attachment to actual streamed support');}
 else report.swingLimit='No accepted anchor from current actual position';
 await qa('release');report.views=[];
 for(const [name,yaw]of [['west',Math.PI/2],['city',Math.PI],['east',-Math.PI/2]]){
  await qa('look',yaw,.12,7);await page.waitForTimeout(2500);await shot(`after-${name}`);report.views.push({name,snapshot:await qa('snapshot'),diagnostics:await qa('diagnostics')});
 }
 await qa('begin','streamed-movement-observation');
 for(let i=0;i<6;i++){await hold('w',600);await page.keyboard.press('Space');await page.waitForTimeout(1400);await page.keyboard.press('x');await page.waitForTimeout(3000);}
 report.continued=await qa('end');report.final=await qa('snapshot');report.finalDiagnostics=await qa('diagnostics');await shot('after-continued');
 assert(report.final.position.every(Number.isFinite));assert(report.continued.samples.every(s=>s.position.every(Number.isFinite)));assert.equal(report.errors.length,0,'Browser or shader errors');
 report.status='PASS';console.log(JSON.stringify({status:report.status,bootMs:report.bootMs,start:report.start.position,terrace:report.initialDiagnostics.city.startSurfaces,district:report.initialDiagnostics.city.district,walkJump:report.walkJump.summary,continued:report.continued.summary,errors:report.errors},null,2));
}catch(e){report.status='FAIL';report.error=e.stack;console.error(e);await shot('failure').catch(()=>{});process.exitCode=1;}
finally{fs.writeFileSync(`${out}/browser.json`,JSON.stringify(report,null,2));await browser.close();}
