import assert from 'node:assert/strict';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))errors.push(m.text());});
 await page.route('**/hk-mask-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Facade mask test</title>'}));
 await page.goto('http://127.0.0.1:5194/hk-mask-fixture');
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {HongKongDistrict,maskAtlas}=await import('/src/HongKongDistrict.js');
  const face={normal:[0,0,1],minU:0,minY:0,width:10,height:15,vertices:[0,0,0,4,0,0,4,15,0,0,0,0,4,15,0,0,15,0,6,0,0,10,0,0,10,15,0,6,0,0,10,15,0,6,15,0]};
  const atlas=maskAtlas([face]);
  const d=Object.create(HongKongDistrict.prototype);Object.assign(d,{active:{value:1},atlas,facePlanes:[new T.Vector4(0,1,0,0),...Array.from({length:5},()=>new T.Vector4(0,1,1000,0))],faceBounds:Array.from({length:6},()=>new T.Vector4(10,0,15,.8)),treeCenters:Array.from({length:32},()=>new T.Vector4()),treeTops:Array(32).fill(0),treeActive:{value:0}});
  const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(100,150);renderer.setClearColor(0);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-5,5,7.5,-7.5,.1,50);camera.position.set(5,7.5,10);camera.lookAt(5,7.5,0);
  const material=new T.MeshBasicMaterial({color:0xaaaaaa}),geometry=new T.PlaneGeometry(10,15),mesh=new T.Mesh(geometry,material);mesh.position.set(5,7.5,0);scene.add(mesh);
  const sample=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),pixels=[];for(const x of [25,50]){const p=new Uint8Array(4);gl.readPixels(x,75,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);pixels.push([...p]);}return pixels;};
  const before=sample();d.applySourceMask(material,'terrain');const after=sample();
  geometry.dispose();material.dispose();atlas.dispose();renderer.dispose();return {before,after};
 });
 assert.notDeepEqual(result.after[0],result.before[0],'Reviewed wall was not enhanced');
 assert.deepEqual(result.after[1],result.before[1],'A hole in the reviewed polygon was recolored');
 assert.deepEqual(errors,[]);console.log('PASS WebGL: facade finish follows the reviewed polygon and leaves its opening unchanged',result);
}finally{await browser.close();}
