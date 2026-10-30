import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/quality-upgrade-2026-10-28';fs.mkdirSync(out+'/shots',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[],results=[];page.on('pageerror',e=>errors.push(String(e)));
const qa=(method,...args)=>page.evaluate(({method,args})=>globalThis.__shadowPulseQuality[method](...args),{method,args});
const record=(name,detail)=>{results.push({name,status:'PASS',detail});console.log('PASS',name);};
const hold=async(key,ms)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
const shot=name=>page.screenshot({path:`${out}/shots/${name}.png`});
const playing=()=>page.waitForFunction(()=>globalThis.__shadowPulseQuality?.playing(),null,{timeout:10000});
async function menuAction(id){if(await qa('playing'))await page.keyboard.press('Escape');await page.locator('#exploration-menu').evaluate(el=>el.open=true);await page.locator(id).click();}
try{
 await page.goto((process.env.QUALITY_URL||'http://127.0.0.1:5192')+'/?city=procedural&play=solo&qualityDirector=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&globalThis.__shadowPulseQuality.playing(),null,{timeout:120000});
 await shot('01-first-view');const boot=await qa('snapshot');record('Solo boot and first view',boot);
 await page.keyboard.press('Escape');await page.locator('#btn-start-drag').click();await qa('release');
 await qa('begin','walk-sprint-jump');await hold('w',900);await page.keyboard.down('Shift');await hold('w',1100);await page.keyboard.up('Shift');await page.keyboard.press('Space');await page.waitForTimeout(1400);await qa('release');
 const movement=await qa('end');assert(movement.summary.travel>1);assert(movement.summary.states.includes('JUMPING')||movement.summary.states.includes('FALLING'));record('Real keyboard walk, sprint and jump',movement.summary);
 // Deliberate setup for repeatable combat: wide supported roof, then live Q and dodge handler.
 const deck=await qa('findRollDeck');await qa('place',deck.x,deck.y,deck.z+deck.depth/2-1.2,0);await page.waitForTimeout(300);if((await qa('combat')).mode!=='combat')await page.keyboard.press('q');
 const dodge=await qa('reviewDodge','forward');assert(dodge.started);await page.waitForTimeout(190);await shot('02-dodge-mid');await page.waitForTimeout(600);record('Grounded forward dodge',dodge);
 await qa('aim',0,-1);await page.keyboard.press('x');await page.waitForFunction(()=>Math.abs(__shadowPulseQuality.snapshot().camera.pitch-.16)<.03,null,{timeout:5000});const recentered=await qa('snapshot');assert(Math.abs(recentered.camera.pitch-.16)<.03,JSON.stringify(recentered.camera));record('X restores horizon',recentered.camera);
 await page.keyboard.press('q');await qa('place',...boot.position,0);await page.waitForTimeout(250);let target=await qa('seekFarAnchor');if(!target.ok)target=await qa('seekWebTarget');assert(target.ok,JSON.stringify(target));await qa('begin','live-swing');await page.mouse.down({button:'left'});await page.waitForTimeout(1100);await shot('03-swing');await page.mouse.up({button:'left'});await page.waitForTimeout(600);const swing=await qa('end');assert(swing.summary.maxWebs>0);record('Mouse wire attachment, swing and release',swing.summary);
 await qa('findRollDeck');await page.waitForTimeout(250);await menuAction('#btn-mission-rooftops');await playing();await page.waitForTimeout(300);const mission=await qa('experience');assert.equal(mission.mission.type,'rooftops');await shot('04-mission');
 // Real arrival/dwell checks after explicit test placements. No fake completion state.
 for(let i=0;i<3;i++){const m=(await qa('experience')).mission;assert(m?.target);await qa('place',m.target.x,m.target.y,m.target.z,0);await page.waitForTimeout(950);}
 const completed=await qa('experience');assert(!completed.mission);assert(completed.records['procedural:rooftops']?.score>=500);await shot('05-result');record('Three supported arrivals award and save a medal',completed);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready(),null,{timeout:120000});await page.locator('#play-solo').click();await playing();assert((await qa('experience')).records['procedural:rooftops']);record('Personal record survives reload',await qa('experience'));
 // Safe street placement is test setup. Summon, entry and driving use normal B/W inputs.
 await qa('place',0,.1,0,0);await page.keyboard.press('b');await page.waitForFunction(()=>globalThis.__shadowPulseQuality.vehicle()?.state==='PARKED',null,{timeout:30000});
 let car=await qa('vehicle');assert(car.doorPoint);await qa('place',car.doorPoint[0],.1,car.doorPoint[2],0);await page.waitForTimeout(250);await page.keyboard.press('b');await page.waitForFunction(()=>globalThis.__shadowPulseQuality.vehicle()?.state==='DRIVING',null,{timeout:10000});
 await hold('w',1400);await shot('06-driving');car=await qa('vehicle');assert(car.speed>1);const audio=await qa('experience');assert(audio.audio.engine>0);assert(await page.locator('#solo-objective').isHidden());record('B entry, W driving, contextual tutorial and engine bus',{car,audio:audio.audio});
 await page.keyboard.press('Escape');await page.waitForTimeout(500);const paused=await qa('experience');assert(paused.audio.engine<.001);record('Pause mutes continuous vehicle audio',paused.audio);
 await page.locator('#btn-start-drag').click();await playing();await hold('Space',700);await page.keyboard.press('b');await page.waitForTimeout(1000);
 await qa('place',0,.1,0,0);await menuAction('#btn-lesson-practice');await playing();await page.waitForTimeout(300);const enemies=(await qa('experience')).enemies;assert(enemies.length);
 const e=enemies[0],sp=await qa('snapshot'),yaw=Math.atan2(e.position[0]-sp.position[0],e.position[2]-sp.position[2]);
 await qa('place',e.position[0]-Math.sin(yaw)*1.4,e.position[1],e.position[2]-Math.cos(yaw)*1.4,yaw);await qa('aim',yaw,.16);await page.waitForTimeout(300);
 for(let i=0;i<4;i++){await page.keyboard.press('e');await page.waitForTimeout(1150);}
 await shot('07-combat');const after=await qa('experience');assert(!after.enemies.length||after.enemies[0].health<100);record('Normal heavy attack damages practice opponent',after);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await shot('08-narrow-layout');const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert(!overflow);record('390px layout has no horizontal overflow',{});
 // A full mission using live keyboard movement, beyond staged arrival fixtures.
 await page.setViewportSize({width:1440,height:900});await qa('place',60,.1,-110,0);await page.waitForTimeout(250);
 if((await qa('combat')).mode!=='web')await page.keyboard.press('q');
 await menuAction('#btn-mission-travel');await playing();await qa('aim',0,.16);await qa('begin','live-500m-patrol');
 await page.keyboard.down('Shift');let direction='w',cycles=0;const started=Date.now(),patrol=[];
 while((await qa('experience')).mission && Date.now()-started<90000){
  const position=(await qa('snapshot')).position;
  if(position[2]>105)direction='s';if(position[2]<-105)direction='w';
  await hold(direction,900);const step=await qa('experience');patrol.push({z:(await qa('snapshot')).position[2],distance:step.mission?.distance??null});cycles++;
 }
 await page.keyboard.up('Shift');await qa('release');const patrolResult=await qa('experience'),patrolMotion=await qa('end');
 if(patrolResult.mission)results.push({name:'Incomplete patrol diagnostics',status:'FAIL',detail:{patrol,experience:patrolResult,snapshot:await qa('snapshot')}});
 assert(!patrolResult.mission && patrolResult.records['procedural:travel'],'A real 500m patrol must complete without teleporting during the mission');
 await shot('09-live-patrol-complete');record('500m patrol completed with real W/S and Shift input',{wallSeconds:(Date.now()-started)/1000,cycles,patrol,record:patrolResult.records['procedural:travel'],motion:patrolMotion.summary});
 assert.equal(errors.length,0);record('No uncaught browser errors',errors);
}catch(e){results.push({name:'Browser scenario',status:'FAIL',error:e.stack});console.error(e);await shot('failure').catch(()=>{});process.exitCode=1;}
finally{fs.writeFileSync(out+'/browser.json',JSON.stringify({results,errors},null,2));await browser.close();}
