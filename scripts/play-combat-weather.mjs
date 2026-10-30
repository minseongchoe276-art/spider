import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {weatherAt} from '../src/WorldWeather.js';
const out='docs/qa/combat-weather-2026-10-29';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],result={};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))errors.push(m.text());});
const qa=(method,...args)=>page.evaluate(({method,args})=>__shadowPulseQuality[method](...args),{method,args});
try{
 await page.goto('http://127.0.0.1:5193/?city=procedural&play=solo&qualityDirector=1');await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&__shadowPulseQuality.playing(),null,{timeout:120000});
 await qa('release');await page.keyboard.press('x');await page.waitForTimeout(200);assert.equal((await qa('combat')).mode,'combat');assert(!(await qa('stance')).active);
 await page.keyboard.down('Control');await page.waitForTimeout(150);assert((await qa('stance')).active);await page.keyboard.up('Control');await page.waitForTimeout(150);assert(!(await qa('stance')).active);
 for(const [key,action]of [['q','dodgeLeft'],['e','dodgeRight']]){await page.keyboard.press(key);await page.waitForTimeout(75);assert.equal((await qa('stance')).action?.key,action);await page.screenshot({path:`${out}/${action}.png`});await page.waitForFunction(()=>!__shadowPulseQuality.stance().action?.duration,null,{timeout:10000});}
 result.input='X switches mode; Ctrl holds stance; Q/E activate directional slips';
 await page.keyboard.down('w');await page.waitForTimeout(400);assert(!(await qa('stance')).active);await page.screenshot({path:`${out}/combat-running.png`});await page.keyboard.up('w');await page.waitForTimeout(1000);
 const punches=new Set();for(let i=0;i<30&&punches.size<2;i++){await qa('mouse',2,true);await qa('mouse',2,false);await page.waitForTimeout(90);const action=(await qa('stance')).action;if(action){punches.add(action.key);await page.screenshot({path:`${out}/punch-${action.key}.png`});}await page.waitForFunction(()=>!__shadowPulseQuality.stance().action?.duration,null,{timeout:10000});}assert(punches.has('cross')&&punches.has('rightHook'));result.punches=[...punches];
 await page.goto('http://127.0.0.1:5193/?city=hong-kong&play=solo&qualityDirector=1');await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&__shadowPulseQuality.playing(),null,{timeout:180000});
 result.start=await qa('snapshot');result.diagnostics=await qa('diagnostics');
 const seen=new Set();for(let i=0;i<180;i++){const epoch=Date.UTC(2026,9,29,4)+i*1800000+600000,w=weatherAt(epoch);if(seen.has(w.type))continue;seen.add(w.type);await qa('weather',epoch);await page.waitForTimeout(500);await page.screenshot({path:`${out}/weather-${w.index}.png`});if(seen.size===6)break;}
 await qa('weather',Date.UTC(2026,9,29,16));await page.waitForTimeout(300);await page.screenshot({path:`${out}/night.png`});result.weather=[...seen];assert.equal(seen.size,6);assert.equal(errors.length,0,errors.join('\n'));
}catch(e){result.failure=e.stack;process.exitCode=1;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}finally{result.errors=errors;fs.writeFileSync(`${out}/browser.json`,JSON.stringify(result,null,2));await browser.close();}console.log(JSON.stringify(result.failure||{input:result.input,weather:result.weather,errors}));
