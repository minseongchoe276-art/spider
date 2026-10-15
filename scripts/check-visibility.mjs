import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HongKongMinimap, actorOverlayPoint, configureTerrainCamera, locatedPlayers } from '../src/Minimap.js';
import { Multiplayer } from '../src/Multiplayer.js';
import { City } from '../src/City.js';
import { proceduralCollision } from './city-collision.mjs';

const mp=Object.create(Multiplayer.prototype);
Object.assign(mp,{id:'me',room:{phase:'playing'},pulseUntil:0,avatars:new Map(),players:[
  {id:'me',team:'police',x:0,y:0,z:0},
  {id:'pending',team:'runner',seen:false,x:10,y:4,z:0},
  {id:'downed',team:'runner',seen:true,eliminated:true,x:20,y:4,z:0},
  {id:'offline',team:'runner',seen:true,connected:false,x:1000,y:80,z:1000},
  {id:'invalid',team:'runner',x:NaN,y:0,z:0},
]});
const players=mp.minimapPlayers();assert.equal(players.length,3);
assert(players.find(p=>p.id==='pending').lastKnown);assert(players.find(p=>p.id==='downed').downed);
assert(players.find(p=>p.id==='offline').lastKnown);
mp.avatars.set('pending',{mesh:{position:new THREE.Vector3(NaN,0,0)}});
assert.equal(mp.minimapPlayers()[0].x,10,'An invalid interpolation erased a valid server position');
assert.equal(locatedPlayers([{x:0,y:0,z:0,seen:false,eliminated:true}]).length,1);
console.log('PASS participant markers retain pending, eliminated, disconnected and distant positions; invalid interpolation falls back to server coordinates');

const camera=new THREE.OrthographicCamera(),center=new THREE.Vector3();configureTerrainCamera(camera,center,180);
for(const size of [168,298])for(const p of [{x:0,y:0,z:0},{x:5000,y:1000,z:5000},{x:-5000,y:-30,z:-5000}]){
  for(const view of [null,camera]){const marker=actorOverlayPoint(p,center,180,size,view);
    assert([marker.x,marker.y].every(Number.isFinite));assert(marker.x>=12 && marker.x<=size-12);assert(marker.y>=12 && marker.y<=size-12);
    if(Math.abs(p.x)>180)assert(marker.offscreen);
  }
}
console.log('PASS 3D and fallback projections keep far/high/behind-map markers inside large and narrow map bounds');

function element(){return {children:[],style:{},dataset:{},classList:{toggle(){}},append(...nodes){this.children.push(...nodes);},setAttribute(){},remove(){this.removed=true;}};}
const previousDocument=globalThis.document;globalThis.document={createElement:element};
try{
  const map=Object.create(HongKongMinimap.prototype),root=element();
  Object.assign(map,{actorRoot:root,actorLabels:new Map(),players:()=>players,size:298,range:180,renderer:{},mapCamera:camera});
  map.drawActorOverlay(center);assert.equal(root.children.length,3);assert.equal(map.actorLabels.size,3);
  assert(map.actorLabels.get('pending').children[1].textContent.includes('대기 위치'));
  assert(map.actorLabels.get('downed').children[1].textContent.includes('탈락'));
  assert(map.actorLabels.get('offline').children[1].textContent.includes('마지막 위치'));
  const removed=[...map.actorLabels.values()];map.players=()=>[];map.drawActorOverlay(center);
  assert.equal(map.actorLabels.size,0);assert(removed.every(el=>el.removed));
  console.log('PASS overlay labels show name/distance/status and remove stale room participants');
  const silent=new Proxy({},{get:()=>()=>{}});globalThis.document={createElement:()=>({getContext:()=>silent})};
  const city=new City(new THREE.Scene());
  assert(city.matGlass.metalness<=.3);assert(city.matDark.metalness<=.3);
  for(const material of [city.matConcrete,city.matRoof])assert(material.color.getHex()>0x808080);
  for(const texture of [city.windowGlassTex,city.windowBrickTex,city.windowDarkTex,city.roadTex])assert.equal(texture.colorSpace,THREE.SRGBColorSpace);
  assert.deepEqual(city.colliders.map(c=>[c.minX,c.maxX,c.minY,c.maxY,c.minZ,c.maxZ]),proceduralCollision().colliders.map(c=>[c.minX,c.maxX,c.minY,c.maxY,c.minZ,c.maxZ]));
  console.log('PASS brighter daytime materials use sRGB textures and preserve every authoritative city collider');
}finally{globalThis.document=previousDocument;}
