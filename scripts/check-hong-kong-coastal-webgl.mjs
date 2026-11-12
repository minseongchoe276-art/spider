import assert from 'node:assert/strict';
import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error'&&/Shader|WebGLProgram/.test(message.text()))errors.push(message.text());});
  await page.goto('http://127.0.0.1:5194/');
  const result=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {preparePhotoSurfaceFinish}=await import('/src/HongKongSurfaceFinish.js');
    const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(64,64);renderer.setClearColor(0);
    const scene=new T.Scene(),camera=new T.OrthographicCamera(-5,5,5,-5,.1,50);camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
    const geometry=new T.PlaneGeometry(10,10).rotateX(-Math.PI/2),material=new T.MeshBasicMaterial({color:0x999999});
    const mesh=new T.Mesh(geometry,material);scene.add(mesh);
    const sample=()=>{renderer.render(scene,camera);const pixel=new Uint8Array(4);renderer.getContext().readPixels(32,32,1,1,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixel);return Array.from(pixel);};
    const original=sample();preparePhotoSurfaceFinish(material);const repaired=sample();
    geometry.dispose();material.dispose();renderer.dispose();return {original,repaired};
  });
  assert.deepEqual(result.repaired,result.original,'Sea-level surfaces should retain their source colour');
  assert.deepEqual(errors,[]);
  console.log('PASS: sea-level neutral surface retains its source colour in WebGL',result);
} finally {await browser.close();}
