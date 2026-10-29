import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out='docs/qa/hong-kong-polish-2026-10-29',errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))errors.push(m.text());});
 await page.route('**/hk-material-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Hong Kong material fixture</title>'}));
 await page.goto('http://127.0.0.1:5192/hk-material-fixture');
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {prepareHongKongTile,hongKongRenderingProfile,createHongKongEnvironment}=await import('/src/HongKongRendering.js');
  const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(128,128);renderer.toneMapping=T.ACESFilmicToneMapping;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,100);camera.position.set(0,8,25);camera.lookAt(0,8,0);scene.add(new T.AmbientLight(0xffffff,2));
  const texture=new T.DataTexture(new Uint8Array([151,151,151,255]),1,1);texture.needsUpdate=true;texture.colorSpace=T.SRGBColorSpace;
  const geometry=new T.BoxGeometry(10,16,8),material=new T.MeshStandardMaterial({map:texture}),mesh=new T.Mesh(geometry,material);mesh.position.y=8;scene.add(mesh);
  prepareHongKongTile(mesh,'building',hongKongRenderingProfile(),renderer.capabilities.getMaxAnisotropy());
  const colors=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const s=new Set();for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>0)s.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);return s.size;};
  const facadeColors=colors();
  const photo=new T.DataTexture(new Uint8Array([151,151,151,255,151,151,151,255,151,151,151,255,151,151,151,255]),2,2);photo.colorSpace=T.SRGBColorSpace;photo.needsUpdate=true;
  material.map=photo;material.needsUpdate=true;const authoredColors=colors();
  scene.remove(mesh);const metal=new T.MeshStandardMaterial({color:0x454555,metalness:1,roughness:.4});const sphere=new T.Mesh(new T.SphereGeometry(5,32,16),metal);sphere.position.y=8;scene.add(sphere);
  const center=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),p=new Uint8Array(4);gl.readPixels(64,64,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p.slice(0,3)].reduce((a,b)=>a+b,0);};
  const withoutEnvironment=center(),env=createHongKongEnvironment(renderer);scene.environment=env.texture;const withEnvironment=center();
  sphere.geometry.dispose();metal.dispose();env.dispose();geometry.dispose();material.dispose();texture.dispose();photo.dispose();renderer.dispose();
  return {facadeColors,authoredColors,withoutEnvironment,withEnvironment};
 });
 assert(result.facadeColors>result.authoredColors,'Placeholder facade did not produce additional visible panes');
 assert(result.withEnvironment>result.withoutEnvironment+20,'Metallic materials remain unreadable without direct sun');
 assert.equal(errors.length,0);fs.writeFileSync(`${out}/material-webgl.json`,JSON.stringify({status:'PASS',result,errors},null,2));console.log('PASS WebGL: constant-grey facade, late photographic texture preservation and metallic sky reflection',result);
}catch(e){fs.writeFileSync(`${out}/material-webgl.json`,JSON.stringify({status:'FAIL',error:e.stack,errors},null,2));console.error(e);process.exitCode=1;}
finally{await browser.close();}
