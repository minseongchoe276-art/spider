import assert from 'node:assert/strict';
import * as THREE from 'three';
import {City} from '../src/City.js';
import {LOCAL_CITY} from '../src/LocalCityLayout.js';
import {proceduralCollision} from './city-collision.mjs';
import {Multiplayer} from '../src/Multiplayer.js';
import {edgeMinimapMarker,terrainMarkerPoint,configureTerrainCamera} from '../src/Minimap.js';
import {positionMarker,PlayerPositionMarkers} from '../src/PlayerPositionMarkers.js';
import {TimeTrialSystem} from '../src/TimeTrial.js';
import {PlayerExperience} from '../src/PlayerExperience.js';
import {arenaFrom} from '../src/PursuitRules.js';

const silent=new Proxy({},{get:()=>()=>{}}),camera=new THREE.PerspectiveCamera(60,1280/720,.1,2000);
camera.lookAt(0,0,-1);camera.updateMatrixWorld(true);
const city=proceduralCollision();assert.equal(city.buildings.length,16);assert.equal(city.playableHalfExtent,160);
assert(city.colliders.length<250);assert(city.buildings.every(b=>Math.abs(b.x)+b.size/2<160 && Math.abs(b.z)+b.size/2<160));
const spawn=city.getRooftopSpawn(95),roofs=city.rooftopSpawns;
const arena=arenaFrom(spawn,'procedural',roofs);assert(arena && arena.points.length>=3);
assert(arena.points.every(p=>Math.abs(p.x)<160 && Math.abs(p.z)<160));
const trial=new TimeTrialSystem(new THREE.Scene(),city,silent);assert(trial.start());
assert.equal(trial.checkpoints.length,8);assert(trial.checkpoints.every(cp=>Math.abs(cp.position.x)<155 && Math.abs(cp.position.z)<155));trial.dispose();
console.log('PASS compact city: 16 buildings, 320m play width, usable spawn/objectives and all 8 race gates within bounds');

const oldDocument=globalThis.document;
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>silent})};
try{
  const rendered=new City(new THREE.Scene());
  assert.deepEqual(rendered.colliders.map(c=>[c.minX,c.maxX,c.minY,c.maxY,c.minZ,c.maxZ]),
    city.colliders.map(c=>[c.minX,c.maxX,c.minY,c.maxY,c.minZ,c.maxZ]));
  assert.equal(rendered.groundMesh.geometry.parameters.width,LOCAL_CITY.groundSize);
}finally{globalThis.document=oldDocument;}
console.log('PASS rendered city and authoritative Node server use exactly matching collision geometry');

const mp=Object.create(Multiplayer.prototype);Object.assign(mp,{id:'me',room:{phase:'playing'},arena:{},pulseUntil:0,
  players:[{id:'me',team:'police',seen:true,x:0,y:0,z:0},
    {id:'enemy',name:'도망자',team:'runner',seen:true,x:50,y:20,z:0},
    {id:'unseen',team:'runner',seen:false,x:0,y:0,z:0},
    {id:'broken',team:'runner',seen:true,x:NaN,y:0,z:0},
    {id:'downed',team:'runner',eliminated:true,seen:true,x:1,y:0,z:0}],
  avatars:new Map([['enemy',{mesh:{position:new THREE.Vector3(48,19,0)}}]])});
const located=mp.minimapPlayers();assert.equal(located.length,3);assert.equal(located[0].id,'enemy');assert.equal(located[0].x,48);
assert(located.find(p=>p.id==='unseen').lastKnown);assert(located.find(p=>p.id==='downed').downed);
assert(!located.some(p=>p.id==='broken'));
mp.room.phase='waiting';assert.deepEqual(mp.minimapPlayers(),[]);
console.log('PASS all finite participant locations stay visible outside pulse windows, including pending and downed players; invalid coordinates are excluded');

for(const p of [new THREE.Vector3(0,0,-20),new THREE.Vector3(2000,500,-20),new THREE.Vector3(0,0,20),new THREE.Vector3(0,0,0)]){
  const marker=positionMarker(p,camera,1280,720,110);assert([marker.x,marker.y,marker.angle].every(Number.isFinite));
  assert(marker.x>=110 && marker.x<=1170 && marker.y>=110 && marker.y<=610);
}
assert(!positionMarker(new THREE.Vector3(0,0,-20),camera,1280,720).offscreen);
assert(positionMarker(new THREE.Vector3(0,0,20),camera,1280,720).offscreen);
const far=edgeMinimapMarker({x:2000,z:2000},{x:0,z:0},180,95,100);
assert(far.offscreen);assert(Math.hypot(far.x-100,far.y-100)<=95+1e-7);
const mapCamera=new THREE.OrthographicCamera();configureTerrainCamera(mapCamera,new THREE.Vector3(),180);
const mapPoint=terrainMarkerPoint(new THREE.Vector3(2000,800,-2000),mapCamera).point.project(mapCamera);
assert(Math.abs(mapPoint.x)<=.840001 && Math.abs(mapPoint.y)<=.840001);
console.log('PASS on-screen, behind-camera, distant and high-altitude markers stay inside both HUD and minimap bounds');

function element(){return {classList:{toggle(){}},style:{},dataset:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},remove(){this.removed=true;}};}
const root={...element(),append(){}};globalThis.document={getElementById:()=>root,createElement:element};
try{
  const markers=new PlayerPositionMarkers({camera,canvas:{getBoundingClientRect:()=>({width:1280,height:720})}});
  const origin=new THREE.Vector3();markers.update([{id:'enemy',name:'친구',team:'runner',x:0,y:5,z:-20}],origin,true);
  const label=markers.markers.get('enemy');assert(label.textContent.includes('21m'));assert(label.textContent.includes('↑5m'));
  markers.update([{id:'enemy',name:'친구',team:'runner',x:0,y:0,z:40}],origin,true);
  assert(label.textContent.includes('40m'));assert(label.textContent.includes('↓'));
  markers.update([],origin,false);assert.equal(markers.markers.size,0);assert(label.removed);
}finally{globalThis.document=oldDocument;}
console.log('PASS labels refresh distance/height/direction and clean up on leaving or pausing');

const experience=Object.create(PlayerExperience.prototype);experience.game={city:{playableHalfExtent:160},physics:{supportHeight:()=>0}};
assert(!experience.safe(new THREE.Vector3(140,.1,240)),'An old out-of-bounds saved position was restored');
console.log('PASS old saved positions outside the compact map are rejected');
