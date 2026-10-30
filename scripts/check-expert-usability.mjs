import assert from 'node:assert/strict';
import * as T from 'three';
import {WorldWeather,weatherAt} from '../src/WorldWeather.js';
import {CombatPractice} from '../src/CombatPractice.js';
import {cleanSettings,rebind} from '../src/PlayerSettings.js';

// Exercise the live weather update, including an instant at which lightning
// really fires. No renderer or network is necessary for this state check.
const savedDocument=globalThis.document;
globalThis.document={createElement:()=>({style:{},setAttribute(){},remove(){}}),body:{append(){}}};
try {
  const scene=new T.Scene();scene.background=new T.Color();
  const sky=new T.Mesh(new T.SphereGeometry(1),new T.MeshBasicMaterial());
  const weather=new WorldWeather({scene,sky,camera:new T.PerspectiveCamera(),sun:new T.DirectionalLight(),ambient:new T.AmbientLight(),city:{root:new T.Group()}});
  let flashAt;
  const start=Date.UTC(2026,9,29);
  for(let epoch=Math.ceil(start/4500)*4500;epoch<start+86400000;epoch+=4500){
    if(weatherAt(epoch).index!==4)continue;
    weather.update(0,new T.Vector3(),epoch);
    if(weather.flash.intensity>0){flashAt=epoch;break;}
  }
  assert(Number.isFinite(flashAt),'Fixture must actually trigger lightning');
  weather.update(.016,new T.Vector3(),flashAt,{reducedMotion:true});
  assert.equal(weather.flash.intensity,0);
  weather.update(.016,new T.Vector3(),flashAt,{reducedMotion:false});
  assert.equal(weather.flash.intensity,3.5);
  weather.dispose();sky.geometry.dispose();sky.material.dispose();
  console.log('PASS Reduced effects suppress an actual lightning flash and restore it when disabled');
}finally{if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;}

const settings=cleanSettings();rebind(settings,'heavy','KeyP');rebind(settings,'wall','KeyO');
let notice;
const position=new T.Vector3(0,.1,0);
const game={assetsReady:true,isPlaying:true,physics:{position,supportHeight:()=>0},experience:{safe:()=>true},preferences:{values:{settings}},
  combat:{mode:'combat',cancel(){},obstructed:()=>false},clearInput(){},setPaused(){},showNotice:text=>notice=text};
const practice=Object.create(CombatPractice.prototype);
Object.assign(practice,{game,stop(){},spawn(){}});
practice.start('shield');assert.match(notice,/O 정면 방어/);assert.match(notice,/P 강공격/);
console.log('PASS Combat practice explains the current remapped guard and heavy attack');
