import assert from 'node:assert/strict';
import * as T from 'three';
import {sanitizePose} from '../src/RemoteMotion.js';
import {CombatPractice} from '../src/CombatPractice.js';

const v=(x=0,y=0,z=0)=>({x,y,z});
const base={state:'WALL_RUNNING',velocity:v(),wallNormal:v(),webs:[{hand:'left',anchor:v(1,2,3)},{hand:'left',anchor:v(9,8,7)}]};
let pose=sanitizePose(base);assert.equal(pose.wallNormal,null);assert.equal(pose.webs.length,1);
pose=sanitizePose({...base,wallNormal:v(300,0,400)});assert(Math.abs(Math.hypot(...Object.values(pose.wallNormal))-1)<1e-12);
const mantle={elapsed:0,duration:1,gap:.7,height:10,normal:v(),edge:v(),start:v(),end:v()};
assert.equal(sanitizePose({...base,mantle}).mantle,null);
assert.equal(sanitizePose({...base,mantle:{...mantle,normal:v(0,0,1),height:1e100}}).mantle,null);
assert(sanitizePose({...base,mantle:{...mantle,normal:v(0,0,5)}}).mantle);
console.log('PASS remote pose boundaries: zero/long normals, duplicate hands, degenerate mantle and extreme heights');

let cases=0;
for(const [wallDistance,expected] of [[null,1],[.2,0],[2,1],[.4,0]]){
  const practice=Object.create(CombatPractice.prototype),scene=new T.Scene();let damage=0;
  const game={scene,multiplayer:null,physics:{position:new T.Vector3()},camera:new T.PerspectiveCamera(),showNotice(){},city:{raycast:()=>wallDistance===null?null:{distance:wallDistance}},combat:{enemies:[],receiveDamage(){damage++;},clearEnemies(){this.enemies=[];}}};
  Object.assign(practice,{game,active:true,projectiles:[]});
  const enemy=practice.spawn('dummy',new T.Vector3(10,0,0));
  const mesh=new T.Mesh(new T.SphereGeometry(.12),new T.MeshBasicMaterial());mesh.position.set(0,1,-1);scene.add(mesh);
  practice.projectiles.push({mesh,enemy,velocity:new T.Vector3(0,0,40),life:3});
  practice.update(.1);assert.equal(damage,expected,`Incorrect collision order with wall at ${wallDistance}`);
  assert.equal(practice.projectiles.length,0);practice.stop();cases++;
}
console.log(`PASS ${cases} swept projectile cases: clear hit, wall before player, wall after player and tied contact`);
