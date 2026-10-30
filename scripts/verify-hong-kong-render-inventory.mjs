import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/hong-kong-render-inventory-2026-10-29';const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
const qa=(method,...args)=>page.evaluate(({method,args})=>__shadowPulseQuality[method](...args),{method,args});
try{
 await page.goto('http://127.0.0.1:5193/?city=hong-kong&play=solo&qualityDirector=1');await page.waitForFunction(()=>globalThis.__shadowPulseQuality?.ready()&&__shadowPulseQuality.playing(),null,{timeout:180000});
 const epoch=JSON.parse(fs.readFileSync(out+'/survey.json')).dayFixture.epoch;await qa('weather',epoch);await page.waitForTimeout(1000);
 const scan=await qa('renderIntegrity');fs.writeFileSync(out+'/scans/verified-materials.json',JSON.stringify(scan));
 const normals=scan.meshes.filter(m=>!m.normals&&m.category==='streamed-terrain');
 const result={errors,meshes:scan.meshes.length,missingNormalAttribute:normals.length,flatShadingMeshCount:normals.filter(m=>m.materials.every(m=>m.unlit||m.flatShading)).length,realAttributeIssues:scan.meshes.filter(m=>m.issues.length).map(m=>({id:m.id,name:m.name,issues:m.issues})),scope:'Flat-shaded GLTF materials are valid without normals; initial candidate detector was corrected rather than reporting a false lighting defect.'};
 const pairs=await qa('districtComparison');for(const [name,png]of Object.entries(pairs))fs.writeFileSync(`${out}/screens/02-facades-${name}.png`,Buffer.from(png.split(',')[1],'base64'));
 fs.writeFileSync(out+'/verified-materials.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
