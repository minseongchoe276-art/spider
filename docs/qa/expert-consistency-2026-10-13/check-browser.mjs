import {chromium} from '/Users/choeminseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const errors=[],pages=[];
const evidence='/Users/choeminseong/Desktop/게임/docs/qa/expert-consistency-2026-10-13/';
try{
 for(let i=0;i<2;i++){
  const page=await (await browser.newContext({viewport:{width:1280,height:900}})).newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/main.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('new GameApp();','window.__testGame=new GameApp();')});});
  await page.goto((process.env.AUDIT_BASE_URL||'http://127.0.0.1:5186')+'/?city=procedural');await page.locator('#loading-screen').waitFor({state:'hidden',timeout:90000});await page.waitForFunction(()=>window.__testGame.multiplayer.ws.readyState===1);
 }
 const [host,peer]=pages;await host.locator('[data-mode="free"]').click();await host.locator('#room-name').fill('경계상황 검수');await host.locator('#create-room').click();await host.waitForFunction(()=>window.__testGame.multiplayer.room);
 await peer.locator('#room-code').fill(await host.locator('#room-code-display').textContent());await peer.locator('#join-code').click();await peer.locator('#room-ready').waitFor({state:'visible'});await peer.locator('#room-ready').click();await host.locator('#room-ready').click();await host.locator('#room-start').click();
 for(const page of pages)await page.waitForFunction(()=>window.__testGame.multiplayer.avatars.size===1);
 // Move away from the match spawn through real key input, then resume the actual server membership.
 const original=await peer.evaluate(()=>window.__testGame.physics.position.toArray());await peer.keyboard.down('KeyW');await peer.waitForTimeout(1100);await peer.keyboard.up('KeyW');await peer.waitForTimeout(250);
 const before=await peer.evaluate(()=>{const g=window.__testGame,p=g.multiplayer.players.find(p=>p.id===g.multiplayer.id);g.setPaused(true);return {server:[p.x,p.y,p.z],id:g.multiplayer.id};});
 assert(Math.hypot(...before.server.map((n,i)=>n-original[i]))>.4,'Real movement did not leave spawn');
 await peer.reload();await peer.locator('#loading-screen').waitFor({state:'hidden',timeout:90000});await peer.waitForFunction(()=>window.__testGame.multiplayer.room?.phase==='playing');
 const resumed=await peer.evaluate(()=>{const g=window.__testGame;g.setPaused(true);return {position:g.physics.position.toArray(),id:g.multiplayer.id,spectating:g.multiplayer.spectating};});
 assert.equal(resumed.id,before.id);assert(Math.hypot(...resumed.position.map((n,i)=>n-before.server[i]))<.65,'Reload teleported the player away from server position');
 // Exercise the actual match entry/render path with a persisted eliminated snapshot.
 const spectator=await peer.evaluate(()=>{const g=window.__testGame,m=g.multiplayer,me=m.players.find(p=>p.id===m.id);m.room.mode='tag';me.team='runner';me.eliminated=true;me.health=0;m.begin();m.renderHud();g.setPaused(true);return {spectating:m.spectating,visible:g.character.group.visible,hud:document.getElementById('match-health').textContent};});
 assert(spectator.spectating&&!spectator.visible);
 await peer.screenshot({path:evidence+'spectator-restored.png'});
 await peer.evaluate(()=>{const g=window.__testGame,m=g.multiplayer;g.character.group.visible=false;m.send({type:'leave'});m.leaveLocal();m.beginSolo();});
 await peer.waitForFunction(()=>window.__testGame.multiplayer.solo);
 assert(await peer.evaluate(()=>window.__testGame.character.group.visible));await peer.screenshot({path:evidence+'solo-restored.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',realNetwork:{original,before,resumed},snapshotScenario:spectator,soloVisible:true,errors},null,2));
}finally{for(const page of pages){try{await page.evaluate(()=>window.__testGame?.multiplayer.send({type:'leave'}));}catch{}}await browser.close();}
