import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/quality-upgrade-2026-10-28',report={scope:'Chrome touch emulation, not a physical phone',results:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
page.on('pageerror',e=>report.errors.push(String(e)));
const qa=(method,...args)=>page.evaluate(({method,args})=>__shadowPulseQuality[method](...args),{method,args});
try{
 await page.goto('http://127.0.0.1:5192/?city=procedural&play=solo&qualityDirector=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&__shadowPulseQuality.playing(),null,{timeout:120000});
 assert(await page.locator('body').evaluate(el=>el.classList.contains('touch-device')));
 await qa('place',0,.1,0,0);await page.waitForTimeout(400);await page.screenshot({path:out+'/shots/touch-portrait.png'});
 const move=await page.locator('.touch-move-zone').boundingBox(),jump=await page.locator('.touch-jump').boundingBox();
 const client=await page.context().newCDPSession(page),p={x:Math.round(move.x+move.width*.4),y:Math.round(move.y+move.height*.7),id:1,radiusX:5,radiusY:5};
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
 const pushed={...p,y:p.y-80};await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pushed]});await page.waitForTimeout(900);
 const moving=await qa('snapshot');assert(moving.speed>1);report.results.push({name:'Real touch pointer drag moves the player',pass:true,speed:moving.speed});
 const second={x:Math.round(jump.x+jump.width/2),y:Math.round(jump.y+jump.height/2),id:2,radiusX:5,radiusY:5};
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pushed,second]});await page.waitForTimeout(150);
 const two=await qa('experience');assert.equal(two.controls.pointers,2);assert(['JUMPING','FALLING'].includes((await qa('snapshot')).state));report.results.push({name:'Moving thumb and jump work simultaneously',pass:true,controls:two.controls});
 await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(150);const canceled=await qa('experience');assert.equal(canceled.controls.pointers,0);assert(!canceled.controls.forward);report.results.push({name:'Touch cancellation clears both pointers and movement',pass:true,controls:canceled.controls});
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(400);await page.screenshot({path:out+'/shots/touch-landscape.png'});const after=await qa('experience');assert(!after.controls.forward);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);report.results.push({name:'Rotation clears held movement and fits viewport',pass:true});
 await page.locator('[data-ui="menu"]').tap();assert.equal(await qa('playing'),false);report.results.push({name:'Touch menu pauses gameplay',pass:true});assert.equal(report.errors.length,0);report.status='PASS';console.log('PASS touch emulation: drag, two simultaneous contacts, cancellation, rotation, menu');
}catch(e){report.status='FAIL';report.error=e.stack;console.error(e);await page.screenshot({path:out+'/shots/touch-failure.png'}).catch(()=>{});process.exitCode=1;}
finally{fs.writeFileSync(out+'/touch-browser.json',JSON.stringify(report,null,2));await browser.close();}
