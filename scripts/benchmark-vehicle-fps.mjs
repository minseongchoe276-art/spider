import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const folder=process.env.VEHICLE_FPS_OUT||'docs/qa/vehicle-fps-2026-10-28',tag=process.env.VEHICLE_FPS_TAG||'baseline',model=process.env.VEHICLE_FPS_MODEL||'bmw',city=process.env.VEHICLE_FPS_CITY||'procedural';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADED!=='1',args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('shadow-pulse-preferences-v1',JSON.stringify({quality:'balanced',settings:{autoQuality:false}})));
 await page.goto((process.env.VEHICLE_FPS_URL||'http://127.0.0.1:5198')+'/?city='+city+'&play=solo&qualityDirector=1');await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready?.()&&globalThis.__shadowPulseQuality?.playing?.(),null,{timeout:150000});
 const hardware=await page.evaluate(()=>{
  const q=__shadowPulseQuality,app=q.benchmarkApp();app.qualityDirector.sample=()=>{};
  const gl=app.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const b=window.__fpsBench={app,phase:null,phases:{},pending:[],timer,gl};
  for(const [obj,names,prefix] of [[app.vehicle,['update','syncCar'],'vehicle'],[app.vehicle.controller||{},[],'controller'],[app.tpsCamera,['update','safeDistance'],'camera'],[app.renderer,['render'],'renderer']])for(const name of names){const original=obj[name];obj[name]=function(...args){const start=performance.now();let query;if(prefix==='renderer'&&b.phase&&timer){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}try{return original.apply(this,args);}finally{if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);b.pending.push({query,phase:b.phase});}if(b.phase){const p=b.phases[b.phase],s=p.cpu[prefix+'.'+name]??={calls:0,total:0,max:0};const ms=performance.now()-start;s.calls++;s.total+=ms;s.max=Math.max(s.max,ms);if(prefix==='renderer'){p.drawCalls.push(this.info.render.calls);p.triangles.push(this.info.render.triangles);}}
   for(let i=b.pending.length-1;i>=0;i--){const job=b.pending[i];if(gl.getQueryParameter(job.query,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(timer.GPU_DISJOINT_EXT))b.phases[job.phase].gpu.push(gl.getQueryParameter(job.query,gl.QUERY_RESULT)/1e6);gl.deleteQuery(job.query);b.pending.splice(i,1);}}
  }};}
  if(!app.city.isStreamed)q.place(0,.1,-70,0);return {gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timer:!!timer,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};
 });
 async function phase(name,seconds){return page.evaluate(async({name,seconds})=>{const b=__fpsBench,p=b.phases[name]={intervals:[],drawCalls:[],triangles:[],gpu:[],cpu:{}};let previous=performance.now();const start=previous;b.phase=name;const from=b.app.physics.position.clone();await new Promise(resolve=>{const frame=now=>{p.intervals.push(now-previous);previous=now;if(now-start<seconds*1000)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});b.phase=null;p.distance=b.app.physics.position.distanceTo(from);return {name,frames:p.intervals.length,distance:p.distance};},{name,seconds});}
 await phase('on-foot',2);
 await page.evaluate(async model=>{const q=__shadowPulseQuality,app=q.benchmarkApp();q.selectVehicle(model);
   if(app.city.isStreamed){const V=app.physics.position.constructor,base=app.physics.position.clone();let found=false;
    for(let radius=0;radius<=80&&!found;radius+=10)for(let angle=0;angle<Math.PI*2&&!found;angle+=Math.PI/6){const x=base.x+Math.sin(angle)*radius,z=base.z+Math.cos(angle)*radius,hit=app.city.raycast(new V(x,300,z),new V(0,-1,0),500);if(!hit||hit.normal.y<.95||hit.mesh?.userData?.surfaceType==='building')continue;for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){q.place(x,hit.point.y+.1,z,yaw);if(await q.summon()){found=true;break;}}}if(!found)throw Error('No loaded street supports parking: '+q.notice());
   }else await q.summon();if(q.vehicle().state!=='PARKED')throw Error(q.notice());},model);
 await phase('parked',2);
 const inventory=await page.evaluate(()=>{const a=__fpsBench.app.vehicle.asset,mats=new Set();let meshes=0,triangles=0,transparentMeshes=0,transmissionMeshes=0;a.frame.traverse(n=>{if(n.isMesh&&n.visible){meshes++;if(n.material.transparent)transparentMeshes++;if(n.material.transmission>0)transmissionMeshes++;triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;for(const m of Array.isArray(n.material)?n.material:[n.material])mats.add(m);}});return {meshes,triangles,materials:mats.size,transparentMeshes,transmissionMeshes};});
 await page.evaluate(async()=>{const q=__shadowPulseQuality,v=q.vehicle();q.place(...v.doorPoint,0);await q.summon();});await page.waitForFunction(()=>__fpsBench.app.vehicle.state==='DRIVING',null,{timeout:20000});
 await phase('warmup',2);await phase('driver-idle',2);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 await page.evaluate(()=>__shadowPulseQuality.key('KeyW',true));console.log(await phase('straight',5));
 await page.evaluate(()=>__shadowPulseQuality.key('KeyA',true));console.log(await phase('turn',2));
 await page.evaluate(()=>{__shadowPulseQuality.key('KeyA',false);__shadowPulseQuality.key('KeyW',false);__shadowPulseQuality.key('Space',true);});await phase('brake',1.5);
 const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(`${folder}/${tag}-${model}.cpuprofile`,JSON.stringify(profile));
 const phases=await page.evaluate(()=>__fpsBench.phases),summary={};const percentile=(values,q)=>{const s=values.slice().sort((a,b)=>a-b);return s.length?s[Math.floor((s.length-1)*q)]:null;};
 for(const [name,p]of Object.entries(phases))summary[name]={frames:p.intervals.length,fps:p.intervals.length/(p.intervals.reduce((a,b)=>a+b,0)/1000),p50:percentile(p.intervals,.5),p95:percentile(p.intervals,.95),over33ms:p.intervals.filter(t=>t>33.5).length,drawCalls:percentile(p.drawCalls,.5),triangles:percentile(p.triangles,.5),gpuP50:percentile(p.gpu,.5),gpuP95:percentile(p.gpu,.95),cpu:Object.fromEntries(Object.entries(p.cpu).map(([key,v])=>[key,{...v,mean:v.total/v.calls}])),distance:p.distance};
 const result={tag,model,city,hardware,inventory,summary,phases,errors};fs.writeFileSync(`${folder}/${tag}-${model}.json`,JSON.stringify(result,null,2)+'\n');await page.screenshot({path:`${folder}/${tag}-${model}.png`});console.log(JSON.stringify({tag,model,hardware,inventory,summary,errors}));
}finally{await browser.close();}
