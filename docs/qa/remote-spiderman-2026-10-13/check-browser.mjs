import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const errors=[];const pages=[];
try {
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/main.js',async route=>{const response=await route.fetch();const body=(await response.text()).replace('new GameApp();','window.__testGame = new GameApp();');await route.fulfill({response,body});});
  await page.goto('http://127.0.0.1:5184/?city=procedural');
  await page.locator('#loading-screen').waitFor({state:'hidden',timeout:90000});
  await page.waitForFunction(()=>window.__testGame?.multiplayer.ws?.readyState===1);
 }
 const [host,peer]=pages;
 await host.locator('#create-room').click();await host.waitForFunction(()=>window.__testGame.multiplayer.room);
 const code=await host.locator('#room-code-display').textContent();await peer.locator('#room-code').fill(code);await peer.locator('#join-code').click();
 await peer.locator('#room-ready').waitFor({state:'visible'});await peer.locator('#room-ready').click();await host.locator('#room-ready').click();await host.locator('#room-start').click();
 for(const page of pages){await page.waitForFunction(()=>window.__testGame.multiplayer.avatars.size===1,{},{timeout:20000});}
 const appearances=[];
 for(const page of pages){appearances.push(await page.evaluate(()=>{
 const g=window.__testGame,a=[...g.multiplayer.avatars.values()][0];const own=g.character.model.getObjectByProperty('isSkinnedMesh',true),skin=a.character.model.getObjectByProperty('isSkinnedMesh',true);
 return {name:a.mesh.name,loaded:a.character.isLoaded,placeholder:!!a.character.placeholder,skinned:!!skin,texture:!!skin.material.map,sameMaterial:skin.material===own.material,independentSkeleton:skin.skeleton!==own.skeleton,animations:Object.keys(a.character.actions).length,sameClips:Object.keys(a.character.actions).join()===Object.keys(g.character.actions).join()};
 }));}
 for(const a of appearances){assert(a.loaded&&a.skinned&&a.texture&&a.sameMaterial&&a.independentSkeleton);assert(!a.placeholder);assert(a.animations>=39&&a.sameClips);}
 await host.evaluate(()=>{const g=window.__testGame,a=[...g.multiplayer.avatars.values()][0];g.isPaused=true;g.character.group.visible=false;g.camera.position.copy(a.mesh.position).add({x:0,y:1.3,z:4});g.camera.lookAt(a.mesh.position.clone().add({x:0,y:1,z:0}));g.renderer.render(g.scene,g.camera);});
 await host.locator('#webgl-canvas').screenshot({path:'docs/qa/remote-spiderman-2026-10-13/opponent-spiderman.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS two browser players: textured Spider-Man on both clients',appearances,errors},null,2));
} finally {await browser.close();}
