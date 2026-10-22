import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {City} from '../src/City.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {LOCAL_MAPS,mapName} from '../src/MapCatalog.js';
import {selectedCity} from '../src/CitySelection.js';
import {worldToMinimap,HongKongMinimap,collectTerrainMeshes} from '../src/Minimap.js';
import {Progression} from '../src/Progression.js';
import {t} from '../src/I18n.js';
import {EN} from '../src/locales/en.js';
class HeadlessCity extends City {
  initTextures(){for(const key of ['windowGlassTex','windowBrickTex','windowDarkTex','roadTex'])this[key]=new THREE.Texture();}
  createHelipad(){}
}
assert.equal(LOCAL_MAPS.length,5);assert.equal(new Set(LOCAL_MAPS.map(m=>m.id)).size,5);
assert.equal(selectedCity('?city=invalid'),'hong-kong');assert.equal(selectedCity(''),'hong-kong');
const layouts=new Set(),footprintLayouts=new Set(),results=[];
for(const profile of LOCAL_MAPS){
  assert.equal(selectedCity(`?city=${profile.id}`),profile.id);
  const scene=new THREE.Scene(),city=new HeadlessCity(scene,profile.id),again=new HeadlessCity(new THREE.Scene(),profile.id);
  const boxes=c=>c.colliders.map(b=>[b.minX,b.minY,b.minZ,b.maxX,b.maxY,b.maxZ]);
  assert.deepEqual(boxes(city),boxes(again),'Map generation must be deterministic');
  layouts.add(JSON.stringify(boxes(city)));assert(city.buildings.length>=10);
  // Height, colour and random roof equipment must not satisfy district variety.
  footprintLayouts.add(JSON.stringify(city.buildings.map(b=>[b.x,b.z,b.size,b.depth])));
  for(const b of city.buildings)assert(Math.abs(b.x)+b.size/2<city.playableHalfExtent&&Math.abs(b.z)+b.depth/2<city.playableHalfExtent,`${profile.id}: building outside playable ground`);
  for(const spawn of city.rooftopSpawns){
    const body=new THREE.Box3(spawn.clone().add(new THREE.Vector3(-.35,.08,-.35)),spawn.clone().add(new THREE.Vector3(.35,1.8,.35)));
    assert(!city.colliders.some(c=>body.intersectsBox(c.box)),`${profile.id}: landmark blocks a spawn`);
    assert(city.raycast(spawn.clone(),new THREE.Vector3(0,-1,0),.3),`${profile.id}: unsupported roof spawn`);
  }
  if(profile.id==='gardens')assert(!city.buildings.some(b=>Math.abs(b.x)<60&&Math.abs(b.z)<60),'Central park must remain open');
  if(profile.id==='harbor')assert(city.district.zones.find(z=>z.kind==='water').x-160>=city.playableHalfExtent,'Water must not cover walkable ground');
  if(profile.id==='skyline'){
    assert(city.raycast(new THREE.Vector3(50,84,0),new THREE.Vector3(0,-1,0),4),'Skywalk needs a solid deck');
    assert(!city.raycast(new THREE.Vector3(50,70,0),new THREE.Vector3(0,0,1),10),'Skywalk must leave the street beneath open');
  }
  assert(city.rooftopSpawns.length>0,`${profile.id}: no supported rooftop spawn`);
  for(const collider of city.colliders){assert([collider.minX,collider.maxX,collider.minY,collider.maxY,collider.minZ,collider.maxZ].every(Number.isFinite));assert(collider.maxY>collider.minY);}
  const spawn=city.getRooftopSpawn(95),body=new THREE.Box3(spawn.clone().add(new THREE.Vector3(-.35,.08,-.35)),spawn.clone().add(new THREE.Vector3(.35,1.8,.35)));
  assert(!city.colliders.some(c=>body.intersectsBox(c.box)),`${profile.id}: spawn blocked`);
  const support=city.raycast(spawn.clone().add(new THREE.Vector3(0,.2,0)),new THREE.Vector3(0,-1,0),1);
  assert(support,`${profile.id}: spawn has no solid support`);
  for(const rate of [30,60,144]){
    const character={group:new THREE.Group(),update(){},requestTurn(){},stopAnimation(){},toggleHand(){},fireWeb(){}};
    const physics=new SwingPhysics(new THREE.Scene(),city,character,new Proxy({},{get:()=>()=>{}}));
    physics.position.copy(spawn);physics.previousFixedPosition.copy(spawn);physics.renderPosition.copy(spawn);physics.state='IDLE';
    const camera=new THREE.PerspectiveCamera(),input={};camera.userData.movementYaw=city.getSpawnFacing(spawn);
    for(let frame=0;frame<rate;frame++)physics.update(1/rate,input,camera);
    assert(Math.abs(physics.position.y-spawn.y)<.02,`${profile.id}: unstable spawn at ${rate}fps`);
    input.jump=true;physics.update(1/rate,input,camera);input.jump=false;
    for(let frame=0;frame<Math.ceil(rate*.1);frame++)physics.update(1/rate,input,camera);
    assert(physics.position.y>spawn.y,`${profile.id}: blocked jump`);
    for(let frame=0;frame<rate*3;frame++)physics.update(1/rate,input,camera);
    assert(Math.abs(physics.position.y-spawn.y)<.02,`${profile.id}: jump failed to land on roof at ${rate}fps`);
  }

  const minimap=Object.create(HongKongMinimap.prototype);minimap.city=city;minimap.range=240;
  assert(minimap.collectFootprints({x:0,z:0}).length>=city.buildings.length,`${profile.id}: map lost buildings`);
  assert(collectTerrainMeshes(city,spawn,180).length>=city.buildings.length,`${profile.id}: minimap geometry missing`);
  for(const b of city.buildings){const footprint=minimap.collectFootprints(b).find(f=>f.x===b.x&&f.z===b.z&&f.height===b.height);assert(footprint);assert.equal(footprint.maxZ-footprint.minZ,b.depth,'Atlas must preserve rectangular footprints');}
  const projected=worldToMinimap(spawn,{x:0,z:0},160,100,100);assert(projected.x>0&&projected.x<200&&projected.y>0&&projected.y<200);
  let meshes=0;scene.traverse(o=>{if(o.isMesh)meshes++;});assert(meshes<550,`${profile.id}: unbounded render objects`);
  results.push({id:profile.id,buildings:city.buildings.length,colliders:city.colliders.length,spawns:city.rooftopSpawns.length,meshes,spawn:spawn.toArray()});
}
assert.equal(layouts.size,5,'Districts must differ in actual geometry');
assert.equal(footprintLayouts.size,5,'Districts must have different horizontal layouts, not just heights');
const storage={data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);}};
const p=new Progression(storage);for(const [i,map]of LOCAL_MAPS.entries()){p.visit(new THREE.Vector3(i*10,.1,i*12),map.id,true);}assert(p.save());const saved=new Progression(storage);
for(const map of LOCAL_MAPS){assert(saved.data.safe[map.id]);assert(saved.data.discoveries.some(d=>d.startsWith(map.id+':')));}
for(const [ko,en]of Object.entries(EN)){assert.equal(t(ko,'ko'),ko);assert.equal(t(ko,'en'),en,ko);assert(!/[가-힣]/.test(en));}
for(const map of LOCAL_MAPS)assert.equal(mapName(map.id,'en'),map.en);
assert.equal(t('에너지 와이어 재사용까지 1.4초','en'),'Energy Wire cooldown: 1.4s');
assert.equal(t('최소 2명이 모여야 시작할 수 있습니다.','en'),'At least 2 players are required to start.');
assert.equal(t('HP 100 · 23m · 60%','en'),'HP 100 · 23m · 60%');
assert.equal(t('12명','en'),'12 players');
fs.mkdirSync('docs/qa/districts-2026-10-22',{recursive:true});fs.writeFileSync('docs/qa/districts-2026-10-22/maps.json',JSON.stringify({status:'PASS',maps:results,dictionaryEntries:Object.keys(EN).length},null,2)+'\n');
console.log(`PASS five deterministic districts, supported spawns, collisions, both maps, render budget, independent saves and ${Object.keys(EN).length} bilingual phrases`);
