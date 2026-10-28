import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const folder='docs/qa/vehicle-smoothness-2026-10-28';fs.mkdirSync(folder,{recursive:true});const label=process.env.PROFILE_LABEL||'before';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.VEHICLE_PROFILE_URL||'http://127.0.0.1:5196')+'/?city=procedural&play=solo&qualityDirector=1&lang='+(process.env.VEHICLE_PROFILE_LANG||'ko'));await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready?.()&&globalThis.__shadowPulseQuality.playing(),null,{timeout:90000});
 await page.evaluate(async()=>{
  const {VehicleController}=await import('/src/VehicleController.js'),{VehicleSystem}=await import('/src/VehicleSystem.js'),{ThirdPersonCamera}=await import('/src/Camera.js'),{WebGLRenderer}=await import('/node_modules/.vite/deps/three.js');
  window.__vehiclePerf={stats:{},last:null,distances:[]};
  for(const [prototype,names] of [[VehicleController.prototype,['update','tick','support','clearMove']],[VehicleSystem.prototype,['update','syncUI','syncCar']],[ThirdPersonCamera.prototype,['update','safeDistance']],[WebGLRenderer.prototype,['render']]])for(const name of names){const original=prototype[name],key=prototype.constructor.name+'.'+name;if(typeof original!=='function')continue;prototype[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const p=window.__vehiclePerf,s=p.stats[key]??={calls:0,total:0,max:0};const dt=performance.now()-start;s.calls++;s.total+=dt;s.max=Math.max(s.max,dt);if(key==='VehicleSystem.update')p.system=this;if(key==='VehicleSystem.update'&&this.driving){const z=this.asset.frame.position.z;if(p.last!=null)p.distances.push(Math.abs(z-p.last));p.last=z;}}};}
  const q=__shadowPulseQuality;q.place(0,.1,-35,0);await q.summon();const v=q.vehicle();if(v.state!=='PARKED')throw Error('No vehicle '+q.notice()+' / '+window.__vehiclePerf.system?.lastError?.stack);q.place(...v.doorPoint,0);await q.summon();
 });
 await page.waitForFunction(()=>__shadowPulseQuality.vehicle().state==='DRIVING',null,{timeout:20000});
 const idleMutations=await page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));let count=0;const observer=new MutationObserver(records=>count+=records.length);observer.observe(document.getElementById('vehicle-ui'),{attributes:true,childList:true,characterData:true,subtree:true});await new Promise(resolve=>{let frames=0;const frame=()=>++frames<30?requestAnimationFrame(frame):resolve();requestAnimationFrame(frame);});observer.disconnect();return count;});
 await page.evaluate(()=>{__vehiclePerf.stats={};__vehiclePerf.last=null;__vehiclePerf.distances=[];__shadowPulseQuality.key('KeyW',true);});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const intervals=await page.evaluate(()=>new Promise(resolve=>{const frames=[];let last=performance.now();const start=last;const frame=now=>{frames.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(frame);else resolve(frames);};requestAnimationFrame(frame);}));
 const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(folder+'/'+label+'.cpuprofile',JSON.stringify(profile));
 const result=await page.evaluate(()=>({stats:__vehiclePerf.stats,distances:__vehiclePerf.distances,vehicle:__shadowPulseQuality.vehicle()}));
 result.idleVehicleUiMutations=idleMutations;result.intervals=intervals;result.errors=errors;const sorted=intervals.slice().sort((a,b)=>a-b);result.summary={frames:intervals.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],longFrames:intervals.filter(t=>t>40).length};
 fs.writeFileSync(folder+'/'+label+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({summary:result.summary,idleVehicleUiMutations:idleMutations,stats:result.stats,vehicle:result.vehicle.state,errors}));
}finally{await browser.close();}
