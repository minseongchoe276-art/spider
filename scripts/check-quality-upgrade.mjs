import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {assessChallenge,challengePar,cleanChallenge} from '../src/MissionChallenge.js';
import {JourneyProgress} from '../src/SoloJourney.js';
import {ThirdPersonCamera} from '../src/Camera.js';
import {prepareCityFacade} from '../src/CityFacades.js';
import {streamingBudget} from '../src/StreamingBudget.js';
import {City} from '../src/City.js';
import {guardedDamage} from '../src/AttackRules.js';
const results=[];
const test=(name,fn)=>{fn();results.push({name,pass:true});console.log('PASS',name);};
test('Runner guard cannot be forged even with a combat stance or legacy capability',()=>{
 const defender={x:0,y:0,z:0,facing:0,team:'runner',lastMove:1000,allowRunnerGuard:true,pose:{state:'IDLE',combatStance:true,combat:{key:'guard'}}};
 assert.equal(guardedDamage({x:0,y:0,z:1},defender,'punch',1000).damage,25);
 defender.team='police';assert.equal(guardedDamage({x:0,y:0,z:1},defender,'punch',1000).damage,10);
});
test('Personal challenge rewards pace and variety without changing completion rules',()=>{
 const m={type:'delivery',points:[{x:80,y:20,z:0},{x:160,y:20,z:0}],elapsed:80,skills:new Set(['swing']),par:28};
 assert.equal(challengePar(m,{x:0,y:20,z:0}),28);
 const first=assessChallenge(m);m.elapsed=20;const faster=assessChallenge(m);assert(faster.score>first.score);
 m.skills=new Set(['swing','wall','zip','roll']);assert.equal(assessChallenge(m).medal,'gold');assert.equal(assessChallenge(m).score,1000);
 assert.equal(cleanChallenge({score:1e9,seconds:0,skills:0}),null);
 const saved={lesson:6,completed:4,last:{type:'travel',distance:500,seconds:80,sectors:0},records:{'procedural:travel':assessChallenge(m),'bad:key':assessChallenge(m)}};
 const p=new JourneyProgress({getItem:()=>JSON.stringify(saved)});assert.equal(p.data.completed,4);assert.equal(p.data.last.distance,500);assert.equal(Object.keys(p.data.records).length,1);assert.equal(p.data.records['procedural:travel'].medal,'gold');
});
test('Explicit recenter restores the horizon; ordinary orbit never drifts',()=>{
 const c=new ThirdPersonCamera(new T.PerspectiveCamera(),{});c.handleMouseMove(0,-1000);const pitch=c.pitch;
 for(let i=0;i<60;i++)c.update(1/60,new T.Vector3(),new T.Vector3(),false,[],null,0,{});
 assert.equal(c.pitch,pitch);c.recenterBehind(1);
 for(let i=0;i<120;i++)c.update(1/60,new T.Vector3(),new T.Vector3(),false,[],null,1,{});
 assert(Math.abs(c.pitch-.16)<.01);assert(Math.abs(c.yaw-1)<.01);
});
test('Geometry-only building polish preserves authored textures and vertex colors',()=>{
 const textured=new T.MeshStandardMaterial({map:new T.Texture()}),colored=new T.MeshStandardMaterial({vertexColors:true});
 const basic=new T.MeshBasicMaterial(),glass=new T.MeshStandardMaterial({transparent:true}),plain=new T.MeshStandardMaterial({color:0x888888});
 for(const material of [textured,colored,glass])assert.equal(prepareCityFacade(material),false);
 assert(prepareCityFacade(basic));assert(prepareCityFacade(plain));assert(!prepareCityFacade(plain));
 const shader={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};plain.onBeforeCompile(shader);
 assert(shader.vertexShader.includes('vFacadeWorld=(modelMatrix*vec4(transformed,1.0)).xyz'));
 assert(shader.fragmentShader.includes('wall*pane*0.65'));
});
test('Streaming cache scales to constrained devices without confusing cache and heap',()=>{
 const desktop=streamingBudget('balanced'),mobile=streamingBudget('balanced',{mobile:true}),small=streamingBudget('high',{memoryGB:4});
 assert(mobile.maxBytes<desktop.maxBytes);assert(small.maxBytes<streamingBudget('high').maxBytes);
 for(const b of [desktop,mobile,small]){assert(b.minBytes<b.maxBytes);assert(b.minTiles<b.maxTiles);}
});
test('Optimized city raycasts retain nearest hits for 5,000 random finite segments',()=>{
 let seed=17;const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/2**32;
 const city=Object.create(City.prototype);city.colliders=Array.from({length:184},()=>{const x=random()*400-200,z=random()*400-200,y=random()*80;return {minX:x,minY:0,minZ:z,maxX:x+8+random()*30,maxY:y+10,maxZ:z+8+random()*30};});
 const ray=new T.Ray(),box=new T.Box3(),point=new T.Vector3();let measured=0;
 const started=performance.now();
 for(let i=0;i<5000;i++){
  const origin=new T.Vector3(random()*600-300,random()*140,random()*600-300),direction=new T.Vector3(random()-.5,random()-.5,random()-.5).normalize(),range=random()*150;
  ray.set(origin,direction);let reference=null;
  for(const b of city.colliders){box.min.set(b.minX,b.minY,b.minZ);box.max.set(b.maxX,b.maxY,b.maxZ);if(ray.intersectBox(box,point)){const d=origin.distanceTo(point);if(d<=range&&(!reference||d<reference.distance))reference={point:point.clone(),distance:d};}}
  const actual=city.raycast(origin,direction,range);assert.equal(!!actual,!!reference);
  if(actual){assert(Math.abs(actual.distance-reference.distance)<1e-8);assert(actual.point.distanceTo(reference.point)<1e-8);assert.equal(actual.normal.length(),1);measured++;}
 }
 results.push({rays:5000,hits:measured,comparisonMs:performance.now()-started});
});
fs.mkdirSync('docs/qa/quality-upgrade-2026-10-28',{recursive:true});fs.writeFileSync('docs/qa/quality-upgrade-2026-10-28/unit.json',JSON.stringify(results,null,2));
