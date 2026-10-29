import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/hong-kong-start-upgrade-2026-10-29';
const errors=[],browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/hk-start-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Terrace WebGL check</title>'}));await page.goto('http://127.0.0.1:5192/hk-start-fixture');
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');const {createStartSurfaceMaterial}=await import('/src/HongKongStartDistrict.js');
  const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(256,256);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-4,4,4,-4,.1,100);camera.position.set(0,30,0);camera.lookAt(0,20,0);
  scene.add(new T.AmbientLight(0xffffff,2));const source=new T.MeshBasicMaterial({color:0xc4c4c4}),material=createStartSurfaceMaterial(source),mesh=new T.Mesh(new T.PlaneGeometry(8,8),material);mesh.rotation.x=-Math.PI/2;mesh.position.y=20;scene.add(mesh);
  renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(256*256*4);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
  const image=renderer.domElement.toDataURL('image/png');
  const center=()=>{renderer.render(scene,camera);const data=new Uint8Array(4);gl.readPixels(128,128,1,1,gl.RGBA,gl.UNSIGNED_BYTE,data);return [...data];};
  mesh.position.x=40;camera.position.x=40;camera.lookAt(40,20,0);const outsideRepair=center();mesh.material=source;const outsideOriginal=center();
  const result={colors:colors.size,programs:renderer.info.programs.length,contextLost:gl.isContextLost(),outsideRepair,outsideOriginal,image};mesh.geometry.dispose();material.dispose();source.dispose();renderer.dispose();return result;
 });
 const {image,...summary}=result;assert(result.colors>8,'Paving detail not visible in actual WebGL');assert(!result.contextLost);assert(result.outsideRepair.every((v,i)=>Math.abs(v-result.outsideOriginal[i])<=1),'Original Basic appearance changed beyond repair boundary');assert.equal(errors.length,0);fs.writeFileSync(`${out}/terrace-webgl.png`,Buffer.from(image.split(',')[1],'base64'));fs.writeFileSync(`${out}/webgl.json`,JSON.stringify({status:'PASS',...summary,errors},null,2));console.log('PASS: actual WebGL compiles terrace material and renders varied paving',summary);
}finally{await browser.close();}
