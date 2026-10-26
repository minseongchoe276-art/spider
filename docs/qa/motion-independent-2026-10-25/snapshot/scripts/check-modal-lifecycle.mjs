import assert from 'node:assert/strict';
import {GameApp} from '../src/main.js';
import {GamepadInput} from '../src/GamepadInput.js';
import {WorldMap} from '../src/WorldMap.js';

const originals=Object.fromEntries(['document','window','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
try {
  let modal=false,starts=0,looks=0;
  const help={open:false},pad={index:0,mapping:'standard',buttons:Array.from({length:16},()=>({pressed:false})),axes:[1,1,1,1]};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false,querySelector:selector=>selector==='dialog[open]'&&modal?{}:null,getElementById:id=>id==='fullscreen-help'?help:null}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[pad]}});
  const g={isPlaying:true,isPaused:true,worldMap:{isOpen:true},preferences:{values:{settings:{bindings:{}}}},canvas:{focus(){}},showNotice(){},syncHeldInput(){},tpsCamera:{handleMouseMove(){looks++;}}};
  const input=new GamepadInput(g);input.action=()=>{starts++;g.isPaused=false;};
  pad.buttons[9].pressed=true;input.update(1/60);
  assert.equal(starts,0);assert.equal(looks,0);assert(g.isPaused,'Start resumed gameplay behind the map');
  pad.buttons[9].pressed=false;input.update(1/60);starts=0;
  g.worldMap.isOpen=false;modal=true;pad.buttons[9].pressed=true;input.update(1/60);
  assert.equal(starts,0);assert.equal(looks,0,'A native dialog accepted camera input');
  pad.buttons[9].pressed=false;input.update(1/60);starts=0;modal=false;
  pad.buttons[9].pressed=true;input.update(1/60);assert.equal(starts,1,'Start outside a dialog must still work');

  const game=Object.create(GameApp.prototype);
  Object.assign(game,{isPlaying:true,isPaused:true,worldMap:{isOpen:true},displayMode:{resumeAfterHelp:true},setHelpOpen(){},clearInput(){},audio:{setWindSpeed(){}},clickToPlayOverlay:null});
  game.togglePause();assert(game.isPaused);
  help.open=true;game.worldMap.isOpen=false;game.togglePause();assert(game.isPaused);
  game.setPaused(true);assert.equal(game.displayMode.resumeAfterHelp,false,'Focus loss left fullscreen fallback auto-resume armed');
  help.open=false;game.worldMap.isOpen=true;game.setPaused(true);assert(game.worldMap.wasPaused,'Focus loss left map auto-resume armed');

  let resumes=0,closes=0;
  const map=Object.create(WorldMap.prototype);
  Object.assign(map,{isOpen:true,wasPaused:false,root:{close(){closes++;}},game:{isPlaying:true,contextLost:false,clearInput(){},setPaused(){resumes++;},canvas:{focus(){}}}});
  document.hidden=true;map.close();assert.equal(resumes,0);assert.equal(closes,1);
  document.hidden=false;map.isOpen=true;map.game.contextLost=true;map.close();assert.equal(resumes,0);
  map.isOpen=true;map.game.contextLost=false;map.game.isPlaying=false;map.close();assert.equal(resumes,0);
  map.isOpen=true;map.game.isPlaying=true;map.close();assert.equal(resumes,1);
  map.isOpen=true;map.open();assert.equal(map.isOpen,true,'Opening an existing map must be idempotent');
  // Drain the real focus callbacks before restoring the mocked document.
  await new Promise(resolve=>setTimeout(resolve,0));
  console.log('PASS modal lifecycle: map/fullscreen Start isolation, camera isolation, normal Start, pause interruption, hidden tab, context loss, lobby, normal close and repeated open');
} finally {
  for(const [key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
