import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const phase=process.env.AUDIT_PHASE||'before',out=`docs/qa/hong-kong-repair-2026-10-29/${phase}`;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling']});const page=await browser.newPage({viewport:{width:1024,height:720}}),r={phase,regions:[],errors:[],scope:'49 regional camera cells, height-adapted from loaded source ray hits. This samples each cell; it does not certify every facade inside each cell.'};
page.on('pageerror',e=>r.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))r.errors.push(m.text());});
const qa=(method,...args)=>page.evaluate(({method,args})=>__shadowPulseQuality[method](...args),{method,args});
const prior=JSON.parse(fs.readFileSync('docs/qa/hong-kong-render-inventory-2026-10-29/survey.json'));const planned=prior.plannedViews.filter(v=>v.kind==='regional-grid');
const path=out+'/regions.json';if(fs.existsSync(path)){const old=JSON.parse(fs.readFileSync(path));r.regions=old.regions??[];}
try{
 await page.goto((process.env.AUDIT_URL||'http://127.0.0.1:5194')+'/?city=hong-kong&play=solo&qualityDirector=1');await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&__shadowPulseQuality.playing(),null,{timeout:180000});await qa('release');await qa('weather',prior.dayFixture.epoch);
 for(const view of planned){
  if(r.regions.some(row=>row.id===view.id&&row.surfaceVerified))continue;
  const x=view.position[0],z=view.target[2]+100;let setup;
  for(let attempt=0;attempt<3;attempt++){
   await qa('renderAuditRegion',x,z,false);await page.waitForTimeout(2200+attempt*1500);setup=await qa('renderAuditRegion',x,z,true);if(setup.height!==null)break;
  }
  await page.waitForTimeout(2300);const scan=await qa('renderIntegrity');
  const row={id:view.id,x,z,...setup,surfaceVerified:setup.height!==null,visibleMeshes:scan.meshes.filter(m=>m.visible&&m.category==='streamed-terrain').length,geometryIssues:scan.meshes.filter(m=>m.issues.length).map(m=>({bounds:m.bounds,issues:m.issues})),streaming:scan.city?.layers,renderer:scan.renderer,components:scan.components};
  await page.screenshot({path:`${out}/${view.id}.png`});r.regions=r.regions.filter(old=>old.id!==row.id);r.regions.push(row);fs.writeFileSync(path,JSON.stringify(r,null,2));console.log(row.id,'height',row.height,'meshes',row.visibleMeshes);
 }
 await qa('finishRenderAudit');r.complete=r.regions.length===49&&r.regions.every(v=>v.surfaceVerified);r.unverified=r.regions.filter(v=>!v.surfaceVerified).map(v=>v.id);r.unvisited=planned.filter(v=>!r.regions.some(row=>row.id===v.id)).map(v=>v.id);
}catch(e){r.failure=e.stack;console.error(e);process.exitCode=1;}finally{fs.writeFileSync(path,JSON.stringify(r,null,2));await browser.close();}
