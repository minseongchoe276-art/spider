import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {AmbientCitizens} from '../src/AmbientCitizens.js';
import {CitizenActor} from '../src/CitizenActor.js';
import {CombatSystem} from '../src/Combat.js';
import {loadCitizenRigs} from './lib/citizen-rig.mjs';
const assets=await loadCitizenRigs(),results=[];
const seed=()=>{let x=7281;return()=>((x=(1664525*x+1013904223)>>>0)/4294967296);};
function fixture(){
 const meshes=[],scene=new T.Scene(),floor=new T.Mesh(new T.PlaneGeometry(2000,2000),new T.MeshBasicMaterial({side:T.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.y=2;scene.add(floor);meshes.push(floor);
 const wall=new T.Mesh(new T.BoxGeometry(4,5,35),new T.MeshBasicMaterial({side:T.DoubleSide}));wall.position.set(12,4.5,0);scene.add(wall);meshes.push(wall);scene.updateMatrixWorld(true);const ray=new T.Raycaster();
 const city={raycast(origin,direction,distance){ray.set(origin,direction);ray.far=distance;const h=ray.intersectObjects(meshes,false)[0];return h?{distance:h.distance,point:h.point,normal:h.face.normal.clone().transformDirection(h.object.matrixWorld)}:null;}};
 const player={position:new T.Vector3(0,2.01,0),velocity:new T.Vector3(),state:'IDLE',facingAngle:0,city},manager=new AmbientCitizens({scene,city,player,assets,random:seed()});return {manager,scene,city,player};
}
// Measure actual deformed vertices: duplicate FBX bone names must not corrupt legs.
for(const asset of assets){const actor=new CitizenActor(asset),mesh=actor.model.getObjectByProperty('isSkinnedMesh',true),names=[];actor.model.traverse(n=>{if(n.isBone)names.push(n.name);});assert.equal(new Set(names).size,names.length);assert.equal(asset.model.getObjectByProperty('isSkinnedMesh',true).geometry.groups.length,0);
 for(const key of ['jab','idle','walk','run','startle','hit','hitBody','hitUppercut']){
  actor.play(key,0);const clip=actor.actions[key].getClip();assert(clip.duration>0);assert(clip.tracks.every(t=>t.values.every(Number.isFinite)));
  for(const phase of [0,.25,.5,.75]){actor.current.time=phase*clip.duration;actor.mixer.update(0);actor.group.updateMatrixWorld(true);mesh.skeleton.update();const bounds=new T.Box3();for(let i=0;i<mesh.geometry.attributes.position.count;i+=25)bounds.expandByPoint(mesh.localToWorld(mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i))));assert(bounds.min.toArray().every(Number.isFinite));assert(bounds.max.y-bounds.min.y>.6&&bounds.max.y-bounds.min.y<2.5,asset.id+': collapsed or stretched body '+key);if(['walk','run'].includes(key))assert(bounds.min.y>-.12&&bounds.min.y<.25,asset.id+': gait lost floor '+bounds.min.y);}
 }
 actor.dispose();results.push({asset:asset.id,rig:'8 clips, unique bones, deformed gait/body bounds pass'});
}
for(const fps of [24,60,144]){
 const {manager,player,city}=fixture(),dt=1/fps,cpu=[],positions=new Map();
 for(let i=0;i<fps*15;i++){manager.update(dt);cpu.push(manager.metrics.lastMs);assert(manager.targets.length<=10);for(const n of manager.targets){assert(n.position.y>1.99&&n.position.y<2.03);assert(!(n.position.x>9.7&&n.position.x<14.3&&Math.abs(n.position.z)<17.7),'Citizen penetrated wall');const prev=positions.get(n);if(prev && prev.id===n.id)assert(n.position.distanceTo(prev.p)<.7,'Citizen teleported between logic ticks');positions.set(n,{id:n.id,p:n.position.clone()});}}
 assert.equal(manager.targets.length,10);assert.equal(manager.slots.length,10);assert.equal(new Set(manager.targets.map(n=>n.actor.variant)).size,3);
 const victim=manager.targets[0];player.position.copy(victim.position).add(new T.Vector3(0,0,-1));player.facingAngle=0;let scores=0;const combat=new CombatSystem(manager.scene,player,{},{getTargets:()=>manager.targets,onHit:()=>scores++});const action={key:'cross',hits:new Set()};combat.strike(action,{damage:12,reach:1.9});assert.equal(victim.state,'HURT');assert.equal(victim.hitSerial,1);combat.strike(action,{damage:12,reach:1.9});assert.equal(victim.hitSerial,1);assert.equal(scores,0,'Civilians must not grant enemy/mission rewards');
 for(let i=0;i<fps*1.1;i++)manager.update(dt);assert.equal(victim.state,'FLEE');const distance=victim.position.distanceTo(player.position);for(let i=0;i<fps*2;i++)manager.update(dt);assert(victim.position.distanceTo(player.position)>distance+1,'Citizen did not escape threat');
 const before=manager.time;manager.update(1,false);assert.equal(manager.time,before,'Paused citizens advanced');
 player.position.x+=500;for(let i=0;i<fps*8;i++)manager.update(dt);assert.equal(manager.slots.length,10,'Population recycling grew the pool');assert(manager.metrics.recycled>=10);assert(manager.targets.every(n=>n.position.distanceTo(player.position)<100));
 const sorted=cpu.slice(fps*3).sort((a,b)=>a-b);results.push({fps,population:manager.targets.length,pool:manager.slots.length,cpuP50:sorted[Math.floor(sorted.length*.5)],cpuP95:sorted[Math.floor(sorted.length*.95)],recycled:manager.metrics.recycled});manager.dispose();assert.equal(manager.slots.length,0);
}
// A tree canopy / small low roof must not be mistaken for a street.
{const {manager,city}=fixture(),base=city.raycast,box=new T.Box3(new T.Vector3(-3,2,-3),new T.Vector3(3,8,3));city.raycast=(origin,direction,distance)=>{const p=new T.Ray(origin,direction).intersectBox(box,new T.Vector3()),ground=base(origin,direction,distance);if(p&&p.distanceTo(origin)<=distance&&(!ground||p.distanceTo(origin)<ground.distance))return {point:p,distance:p.distanceTo(origin),normal:new T.Vector3(0,1,0)};return ground;};assert(!manager.streetPatch(new T.Vector3(0,8.01,0),new T.Vector3(0,0,1)));manager.dispose();}
// A camera covering every candidate must never see a civilian pop into existence.
{const {manager}=fixture();manager.visible=()=>true;for(let i=0;i<120;i++)manager.update(1/30);assert.equal(manager.targets.length,0);manager.dispose();}
// Unavailable terrain is never replaced by an invisible fallback floor.
{const {manager}=fixture();manager.city.raycast=()=>null;for(let i=0;i<120;i++)manager.update(1/30);assert.equal(manager.targets.length,0);manager.dispose();}
// Offscreen bodies remain simulated while their skinned draw is culled.
{const {manager}=fixture();for(let i=0;i<120;i++)manager.update(1/30);const camera=new T.PerspectiveCamera(55,1,.1,150);camera.position.set(0,4,-5);camera.lookAt(0,3,20);manager.camera=camera;manager.update(1/30);assert(manager.targets.some(n=>!n.mesh.visible));for(const n of manager.targets)assert.equal(n.mesh.visible,manager.visible(n.position));manager.dispose();}
// Asset failures retry on a bounded timer; late completion after disposal is ignored.
{const {manager}=fixture();manager.assets=null;manager.time=2;let loads=0;manager.loadAssets=async()=>{if(++loads===1)throw Error('temporary');return assets;};manager.update(.1);await new Promise(r=>setTimeout(r,0));assert.equal(loads,1);assert(!manager.failed);for(let i=0;i<160;i++)manager.update(.1);await new Promise(r=>setTimeout(r,0));assert.equal(loads,2);assert.equal(manager.assets,assets);manager.dispose();}
// Repeated assault enables a readable counterattack, one damage event per swing.
for(const fps of [24,60,144]){
 const {manager,player}=fixture();for(let i=0;i<fps*3;i++)manager.update(1/fps);
 const n=manager.targets[0];for(const other of manager.targets)if(other!==n)manager.retire(other);manager.max=1;n.position.set(0,2.01,3);n.moveFrom.copy(n.position);n.moveTo.copy(n.position);n.yaw=n.targetYaw=Math.PI;n.mesh.rotation.y=n.yaw;
 player.position.set(0,2.01,1.7);let damage=0,hits=0;manager.onPlayerHit=(amount,enemy)=>{assert.equal(enemy,n);damage+=amount;hits++;};
 manager.hit(n,'jab',12,player.position);manager.hit(n,'jab',12,player.position);
 for(let i=0;i<fps*1.1;i++)manager.update(1/fps);
 assert.equal(hits,1,'One contact per counterattack');assert.equal(damage,12);assert.equal(n.actor.key,'jab');manager.alarm(n.position,14);assert.equal(n.state,'ATTACK','Witness alarm interrupted self defense');
 player.position.set(0,2.01,-10);for(let i=0;i<fps*2;i++)manager.update(1/fps);assert.equal(hits,1,'Out of range attacks cannot damage');assert.equal(n.state,'FLEE');manager.dispose();
}
// Damage uses the real player health/invulnerability path; walls and height reject contact.
{const {manager,player}=fixture();for(let i=0;i<90;i++)manager.update(1/30);const n=manager.targets[0];
 const combat=new CombatSystem(manager.scene,player,{});manager.onPlayerHit=(amount,enemy)=>combat.receiveDamage(amount,enemy);
 n.position.set(0,2.01,3);n.moveFrom.copy(n.position);n.moveTo.copy(n.position);n.yaw=n.targetYaw=Math.PI;player.position.set(0,2.01,1.7);
 n.attackStarted=manager.time;n.attackAt=manager.time+10;n.attackHit=false;n.fearUntil=100;manager.change(n,'ATTACK',1.2);
 for(let i=0;i<20;i++)manager.update(1/30);assert.equal(combat.health,88,'NPC contact did not reduce actual health');
 manager.onPlayerHit=()=>assert.fail('Blocked or elevated contact dealt damage');
 const raycast=manager.city.raycast;manager.city.raycast=(origin,direction,distance)=>Math.abs(direction.y)<.01?{distance:.4,point:origin.clone().addScaledVector(direction,.4),normal:direction.clone().negate()}:raycast(origin,direction,distance);
 n.attackStarted=manager.time;n.attackHit=false;manager.change(n,'ATTACK',1.2);for(let i=0;i<20;i++)manager.update(1/30);
 manager.city.raycast=raycast;
 for(const [npc,hero] of [[[9,2.01,0],[15,2.01,0]],[[0,2.01,3],[0,5,3.5]]]){
  n.position.fromArray(npc);n.moveFrom.copy(n.position);n.moveTo.copy(n.position);player.position.fromArray(hero);n.attackStarted=manager.time;n.attackHit=false;manager.change(n,'ATTACK',1.2);for(let i=0;i<20;i++)manager.update(1/30);
 }
 manager.dispose();}
// Escape turns around the end of a blocking building, without crossing it.
{const {manager,player}=fixture();for(let i=0;i<120;i++)manager.update(1/30);const n=manager.targets[0];for(const other of manager.targets)if(other!==n)manager.retire(other);manager.max=1;
 n.position.set(8,2.01,16);n.moveFrom.copy(n.position);n.moveTo.copy(n.position);player.position.set(0,2.01,16);n.threat=player.position.clone();n.fearUntil=100;manager.change(n,'FLEE');n.routeAt=0;
 for(let i=0;i<600;i++){manager.update(1/30);assert(!(n.position.x>9.7&&n.position.x<14.3&&Math.abs(n.position.z)<17.7),'Escape crossed wall');}
 assert(n.position.x>16,'Escape never rounded building corner');manager.dispose();}
const manifest=JSON.parse(fs.readFileSync('public/citizens/manifest.json'));assert.equal(manifest.characters.length,3);for(const asset of manifest.characters){assert.equal(asset.meshes,1);assert.equal(asset.materials,1);assert(asset.bytes<5*1024*1024);assert(asset.triangles<60000);}
fs.mkdirSync('docs/qa/citizens-2026-10-27',{recursive:true});fs.writeFileSync('docs/qa/citizens-2026-10-27/results.json',JSON.stringify({scope:'CPU simulation and real skinned vertex validation, not GPU FPS',results},null,2)+'\n');console.table(results);console.log('PASS citizens: 3 textured-source rigs / 8 motions, 10-person cap, hits->startle->flee, one hit per action, no rewards, walls/ground, pause, offscreen spawn, missing terrain, pool reuse and CPU measurements at 24/60/144 FPS');
