import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {weatherAt} from '../src/WorldWeather.js';
const out='docs/qa/hong-kong-render-inventory-2026-10-29';fs.mkdirSync(out+'/screens',{recursive:true});fs.mkdirSync(out+'/scans',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),r={scope:'Read-only detached camera survey. Gameplay body stays at supported spawn. Loaded geometry inspection is exhaustive per visit; screenshot coverage is sampled, not every surface of Hong Kong.',errors:[],requests:{failed:[],bytes:0},views:[]};
page.on('pageerror',e=>r.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))r.errors.push(m.text());});
page.on('requestfailed',req=>{if(req.url().includes('urban-tiles'))r.requests.failed.push({url:req.url(),failure:req.failure()?.errorText});});
page.on('response',res=>{if(res.url().includes('urban-tiles')){const size=Number(res.headers()['content-length']);if(Number.isFinite(size))r.requests.bytes+=size;}});
const qa=(method,...args)=>page.evaluate(({method,args})=>__shadowPulseQuality[method](...args),{method,args});
const shot=name=>page.screenshot({path:`${out}/screens/${name}.png`});
const save=()=>fs.writeFileSync(out+'/survey.json',JSON.stringify(r,null,2));
try{
 await page.goto('http://127.0.0.1:5193/?city=hong-kong&play=solo&qualityDirector=1');await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&__shadowPulseQuality.playing(),null,{timeout:180000});
 await qa('release');r.start=await qa('snapshot');
 let epoch=Date.UTC(2026,9,29,4);for(let i=0;i<2000;i++){const candidate=epoch+i*1800000+600000,w=weatherAt(candidate);if(w.index===0&&w.cloud<.2&&w.day>.95){epoch=candidate;break;}}
 r.dayFixture=await qa('weather',epoch);await page.waitForTimeout(800);await shot('00-day-start');
 r.baseline=await qa('renderIntegrity');fs.writeFileSync(out+'/scans/start.json',JSON.stringify(r.baseline));delete r.baseline;
 const pairs=await qa('vegetationReview');for(const [name,png]of Object.entries(pairs))fs.writeFileSync(`${out}/screens/01-trees-${name}.png`,Buffer.from(png.split(',')[1],'base64'));
 r.districtTrees=await qa('treeSurvey');
 const views=[];
 for(let i=0;i<8;i++){const angle=i*Math.PI/4;views.push({id:`core-${i}`,position:[Math.sin(angle)*65,31,Math.cos(angle)*65],target:[0,12,0],kind:'core-street-oblique'});}
 for(let z=-2100;z<=2100;z+=700)for(let x=-2100;x<=2100;x+=700)views.push({id:`region-x${x}-z${z}`,position:[x,310,z+130],target:[x,20,z-100],kind:'regional-grid'});
 r.plannedViews=views;
 for(const view of views){
  if(r.requests.bytes>512*1024*1024){r.stopReason='512 MiB observed network content-length budget reached; remaining positions explicitly unvisited';break;}
  await qa('renderAuditCamera',view.position,view.target);
  const begin=Date.now();await page.waitForTimeout(1300);
  let diagnostics;
  while(Date.now()-begin<6500){diagnostics=await qa('diagnostics');const layers=diagnostics.city?.layers??[];if(layers.length&&layers.every(l=>(l.stats.downloading??0)+(l.stats.parsing??0)===0))break;await page.waitForTimeout(700);}
  const scan=await qa('renderIntegrity');fs.writeFileSync(`${out}/scans/${view.id}.json`,JSON.stringify(scan));await shot(view.id);
  const issues=scan.meshes.filter(m=>m.issues.length);const visible=scan.meshes.filter(m=>m.visible&&m.category.startsWith('streamed'));
  const result={...view,waitMs:Date.now()-begin,visibleStreamedMeshes:visible.length,visibleTriangles:visible.reduce((sum,m)=>sum+m.triangles,0),textureCount:scan.textures.length,issues:issues.map(m=>({id:m.id,category:m.category,bounds:m.bounds,issues:m.issues})),weather:scan.weather?.type,renderer:scan.renderer,streaming:scan.city?.layers?.map(l=>({surface:l.surface,stats:l.stats,errorTarget:l.errorTarget})),bytes:r.requests.bytes};r.views.push(result);save();console.log(view.id,'meshes',visible.length,'issues',issues.length,'MB',Math.round(r.requests.bytes/1048576));
 }
 r.unvisited=views.filter(v=>!r.views.some(done=>done.id===v.id));await qa('renderAuditCamera',null);await qa('weather',null);r.completed=true;
}catch(e){r.failure=e.stack;console.error(e);process.exitCode=1;await shot('failure').catch(()=>{});}finally{save();await browser.close();}
