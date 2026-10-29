import fs from 'node:fs';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
try{
await page.route('**/tree-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Tree asset review</title>'}));await page.goto('http://127.0.0.1:5209/tree-fixture');
const result=await page.evaluate(async()=>{
const T=await import('/node_modules/three/build/three.module.js'),{GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const model=(await new GLTFLoader().loadAsync('/models/environment/hong-kong-pine.glb')).scene;model.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(640,640);renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene();scene.background=new T.Color(0x91bdd2);scene.add(model);scene.add(new T.HemisphereLight(0xddeeff,0x736b56,2));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(20,30,15);scene.add(sun);
const camera=new T.PerspectiveCamera(40,1,.1,200);camera.position.copy(center).add(new T.Vector3(20,6,30));camera.lookAt(center);renderer.render(scene,camera);
const materials=[];model.traverse(o=>{if(o.isMesh)materials.push({type:o.material.type,alpha:o.material.alphaTest,image:o.material.map?.image?.width})});return{png:renderer.domElement.toDataURL(),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},size:size.toArray(),materials};
});fs.writeFileSync('docs/qa/hong-kong-district-2026-10-29/tree-source.png',Buffer.from(result.png.split(',')[1],'base64'));delete result.png;fs.writeFileSync('docs/qa/hong-kong-district-2026-10-29/tree-source.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();}
