import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage(),errors=[];
page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))errors.push(m.text());});
try{
 await page.goto('http://127.0.0.1:5192/?city=procedural',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{prepareCityFacade}=await import('/src/CityFacades.js');
  const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(128,128);const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.1,100);camera.position.set(0,10,30);camera.lookAt(0,10,0);scene.add(new T.AmbientLight(0xffffff,2));
  const geometry=new T.BoxGeometry(10,20,10),rows=[];
  const colors=()=>{const gl=renderer.getContext(),pixels=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const set=new Set();for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>0)set.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);return set.size;};
  for(const type of ['MeshBasicMaterial','MeshStandardMaterial']){
   const material=new T[type]({color:0x888888});prepareCityFacade(material);const mesh=new T.Mesh(geometry,material);mesh.position.y=10;scene.add(mesh);renderer.render(scene,camera);const decorated=colors();
   const texture=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.needsUpdate=true;material.map=texture;material.needsUpdate=true;renderer.render(scene,camera);const authored=colors();rows.push({type,decoratedColors:decorated,authoredColors:authored});
   scene.remove(mesh);material.dispose();texture.dispose();
  }
  geometry.dispose();renderer.dispose();return rows;
 });
 for(const row of result){assert(row.decoratedColors>1,`${row.type} did not render facade panes`);assert.equal(row.authoredColors,1,'A late authored texture must bypass facade styling');}
 assert.equal(errors.length,0);fs.writeFileSync('docs/qa/quality-upgrade-2026-10-28/material-browser.json',JSON.stringify({status:'PASS',result,errors},null,2));console.log('PASS actual WebGL basic/standard facade shaders and late authored-texture preservation');
}catch(e){console.error(e);process.exitCode=1;fs.writeFileSync('docs/qa/quality-upgrade-2026-10-28/material-browser.json',JSON.stringify({status:'FAIL',error:e.stack,errors},null,2));}
finally{await browser.close();}
