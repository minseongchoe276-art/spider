import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/hong-kong-district-2026-10-29',errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))errors.push(m.text());});
try{
 await page.route('**/district-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>District assets and lifetime</title>'}));await page.goto('http://127.0.0.1:5209/district-fixture');
 const r=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{HongKongDistrict}=await import('/src/HongKongDistrict.js'),{createHongKongEnvironment}=await import('/src/HongKongRendering.js');
  const scene=new T.Scene(),fetchOriginal=globalThis.fetch;globalThis.fetch=async(url,...args)=>{if(String(url).includes('hong-kong-pine'))throw Error('controlled unavailable');return fetchOriginal(url,...args);};
  const failed=new HongKongDistrict(scene);await failed.treeReady;const fallback={status:failed.report.treeStatus,mask:failed.treeActive.value};failed.dispose();globalThis.fetch=fetchOriginal;
  const district=new HongKongDistrict(scene);await district.treeReady;
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(800,600);renderer.toneMapping=T.ACESFilmicToneMapping;scene.background=new T.Color(0x91bdd2);const env=createHongKongEnvironment(renderer);scene.environment=env.texture;scene.environmentIntensity=.7;
  scene.add(new T.HemisphereLight(0xd8f1ff,0x777c82,1.55));const sun=new T.DirectionalLight(0xfff8e8,2.6);sun.position.set(160,280,140);scene.add(sun);
  const camera=new T.PerspectiveCamera(55,800/600,.2,500);camera.position.set(-12,13,-53);camera.lookAt(-40,12,-28);renderer.render(scene,camera);const png=renderer.domElement.toDataURL();
  district.captureReflection(renderer);const firstReflection=district.panes.material.envMap;district.resetReflection();if(district.panes.material.envMap!==null)throw Error('Reflection reset retained a lost GPU target');district.captureReflection(renderer);if(!district.panes.material.envMap||district.panes.material.envMap===firstReflection)throw Error('Reflection was not rebuilt');const report={...district.report},owned=[...district.resources];let disposed=0;for(const r of owned)r.addEventListener('dispose',()=>disposed++);district.dispose();
  const removed=!scene.children.includes(district.group),remaining=district.resources.size;renderer.dispose();env.dispose();
  return {fallback,report,png,owned:owned.length,disposed,remaining,removed};
 });
 fs.writeFileSync(out+'/tree-assembled.png',Buffer.from(r.png.split(',')[1],'base64'));delete r.png;
 assert.equal(r.fallback.status,'failed');assert.equal(r.fallback.mask,0);assert.equal(r.report.trees,7);assert.equal(r.report.foliageClusters,140);assert(r.removed);assert.equal(r.remaining,0);assert.equal(r.disposed,r.owned);assert.equal(errors.length,0);
 fs.writeFileSync(out+'/webgl.json',JSON.stringify({status:'PASS',...r,errors},null,2));console.log('PASS actual assembled foliage rendering, unavailable-asset canopy fallback, all owned GPU resource disposals',r);
}catch(e){console.error(e);fs.writeFileSync(out+'/webgl.json',JSON.stringify({status:'FAIL',error:e.stack,errors},null,2));process.exitCode=1;}finally{await browser.close();}
