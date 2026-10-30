import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {AmbientCitizens} from '../src/AmbientCitizens.js';
import {citizenRoute} from '../src/CitizenNavigation.js';
import {CitizenActor} from '../src/CitizenActor.js';
import {CombatSystem} from '../src/Combat.js';
import {loadCitizenRigs} from './lib/citizen-rig.mjs';
import {attachFootpaths} from '../src/PedestrianRoutes.js';
import {districtLayout} from '../src/DistrictLayout.js';
import {LOCAL_CITY} from '../src/LocalCityLayout.js';
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
 for(const key of ['jab','cross','hook','combatIdle','idle','walk','run','startle','hit','hitBody','hitUppercut']){
  actor.play(key,0);const clip=actor.actions[key].getClip();assert(clip.duration>0);assert(clip.tracks.every(t=>t.values.every(Number.isFinite)));
  for(const phase of [0,.25,.5,.75]){actor.current.time=phase*clip.duration;actor.mixer.update(0);actor.group.updateMatrixWorld(true);mesh.skeleton.update();const bounds=new T.Box3();for(let i=0;i<mesh.geometry.attributes.position.count;i+=25)bounds.expandByPoint(mesh.localToWorld(mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i))));assert(bounds.min.toArray().every(Number.isFinite));assert(bounds.max.y-bounds.min.y>.6&&bounds.max.y-bounds.min.y<2.5,asset.id+': collapsed or stretched body '+key);if(['walk','run'].includes(key))assert(bounds.min.y>-.12&&bounds.min.y<.25,asset.id+': gait lost floor '+bounds.min.y);}
 }
 actor.dispose();results.push({asset:asset.id,rig:'11 clips, unique bones, deformed gait/body bounds pass'});
}
for(const fps of [24,60,144]){
 const {manager,player,city}=fixture(),dt=1/fps,cpu=[],positions=new Map();
 for(let i=0;i<fps*15;i++){manager.update(dt);cpu.push(manager.metrics.lastMs);assert(manager.targets.length<=10);for(const n of manager.targets){assert(n.position.y>1.99&&n.position.y<2.03);assert(!(n.position.x>9.7&&n.position.x<14.3&&Math.abs(n.position.z)<17.7),'Citizen penetrated wall');const prev=positions.get(n);if(prev && prev.id===n.id)assert(n.position.distanceTo(prev.p)<.7,'Citizen teleported between logic ticks');positions.set(n,{id:n.id,p:n.position.clone()});}}
 assert.equal(manager.targets.length,10);assert.equal(manager.slots.length,10);assert.equal(new Set(manager.targets.map(n=>n.actor.variant)).size,3);
 const victim=manager.targets[0];player.position.copy(victim.position).add(new T.Vector3(0,0,-1));player.facingAngle=0;let scores=0;const combat=new CombatSystem(manager.scene,player,{},{getTargets:()=>manager.targets,onHit:()=>scores++});const action={key:'cross',hits:new Set()};combat.strike(action,{damage:12,reach:1.9});assert.equal(victim.state,'HURT');assert.equal(victim.hitSerial,1);combat.strike(action,{damage:12,reach:1.9});assert.equal(victim.hitSerial,1);assert.equal(scores,0,'Civilians must not grant enemy/mission rewards');
 for(let i=0;i<fps*1.8;i++)manager.update(dt);assert.equal(victim.state,'FLEE');const distance=victim.position.distanceTo(player.position);for(let i=0;i<fps*2;i++)manager.update(dt);assert(victim.position.distanceTo(player.position)>distance+1,'Citizen did not escape threat');
 const before=manager.time;manager.update(1,false);assert.equal(manager.time,before,'Paused citizens advanced');
 player.position.x+=500;for(let i=0;i<fps*8;i++)manager.update(dt);assert.equal(manager.slots.length,10,'Population recycling grew the pool');assert(manager.metrics.recycled>=10);assert(manager.targets.every(n=>n.position.distanceTo(player.position)<100));
 const sorted=cpu.slice(fps*3).sort((a,b)=>a-b);results.push({fps,population:manager.targets.length,pool:manager.slots.length,cpuP50:sorted[Math.floor(sorted.length*.5)],cpuP95:sorted[Math.floor(sorted.length*.95)],recycled:manager.metrics.recycled});manager.dispose();assert.equal(manager.slots.length,0);
}
// Building frontage is the sidewalk. A lamp in the carriageway must not become the route.
{
 const blocks=[new T.Mesh(new T.BoxGeometry(6,12,160)),new T.Mesh(new T.BoxGeometry(6,12,160))];
 blocks[0].position.set(11,6,0);blocks[1].position.set(-11,6,0);
 const lamp=new T.Mesh(new T.BoxGeometry(.4,4,.4));lamp.position.set(.2,2,0);lamp.userData.surfaceType='infrastructure';
 for(const mesh of blocks)mesh.userData.surfaceType='building';
 const floor=new T.Mesh(new T.PlaneGeometry(400,400));floor.rotation.x=-Math.PI/2;floor.position.y=2;floor.userData.surfaceType='terrain';
 const meshes=[floor,...blocks,lamp];for(const mesh of meshes)mesh.updateMatrixWorld(true);
 const ray=new T.Raycaster();
 const city={isStreamed:true,collisionWorld:{ready:true},raycast(origin,direction,distance){ray.set(origin,direction);ray.far=distance;const h=ray.intersectObjects(meshes,false)[0];return h?{distance:h.distance,point:h.point,normal:h.face.normal.clone().transformDirection(h.object.matrixWorld),mesh:h.object}:null;}};
 const player={position:new T.Vector3(0,2.01,0),velocity:new T.Vector3(),state:'IDLE',facingAngle:0};
 const manager=new AmbientCitizens({scene:new T.Scene(),city,player,assets,random:seed(),max:4});
 assert(manager.lane(new T.Vector3(0,2.01,12)),'Carriageway was accepted as a sidewalk');
 assert(!manager.lane(new T.Vector3(6.8,2.01,4)),'Sidewalk beside the building was rejected');
 const stranded={position:new T.Vector3(0,2.01,12)};
 const out=citizenRoute(manager,stranded,0);
 assert.equal(out.length,0,'A stranded resident must not walk across the carriageway');
 assert(manager.lane(new T.Vector3(4,2.01,12)),'Road edge within four metres of a facade was accepted');
 assert(!manager.lane(new T.Vector3(6.8,2.01,12)),'Valid sidewalk was rejected after a nearby road query');
 assert(manager.lane(new T.Vector3(6.8,22,12)),'Sidewalk cache reused a different elevation');
 const walker={position:new T.Vector3(6.8,2.01,0)};
 const along=citizenRoute(manager,walker,0);
 assert(along.length>=3&&along.every(p=>p.x>5&&p.x<8.4)&&Math.abs(along.at(-1).z)>2,`Sidewalk route left the frontage ${along.map(p=>[p.x,p.z].map(v=>v.toFixed(1)).join(','))}`);
 // Walk past the end of both frontages: never bridge the road to another face.
 for(const yaw of [0,Math.PI]){
  const edge={position:new T.Vector3(6.8,2.01,yaw===0?78:-78)};
  const route=citizenRoute(manager,edge,yaw);
  let from=edge.position;
  for(const to of route){
   assert(to.cross!==true,'Unmarked crossing was generated');
   const count=Math.ceil(from.distanceTo(to)/.1);
   for(let j=1;j<=count;j++)assert(!manager.lane(from.clone().lerp(to,j/count)),'Corner cut through the road');
   from=to;
  }
 }
 for(let i=0;i<90;i++)manager.update(1/30);
 assert(manager.targets.length>0,'No residents spawned on the sidewalk');
 assert(manager.targets.every(n=>Math.abs(n.position.x)>5),`Resident walked into the carriageway ${manager.targets.map(n=>n.position.x.toFixed(2))}`);
 manager.dispose();
}
// A tree canopy / small low roof must not be mistaken for a street.
{const {manager,city}=fixture(),base=city.raycast,box=new T.Box3(new T.Vector3(-3,2,-3),new T.Vector3(3,8,3));city.raycast=(origin,direction,distance)=>{const p=new T.Ray(origin,direction).intersectBox(box,new T.Vector3()),ground=base(origin,direction,distance);if(p&&p.distanceTo(origin)<=distance&&(!ground||p.distanceTo(origin)<ground.distance))return {point:p,distance:p.distanceTo(origin),normal:new T.Vector3(0,1,0)};return ground;};assert(!manager.streetPatch(new T.Vector3(0,8.01,0),new T.Vector3(0,0,1)));manager.dispose();}
// Official layer metadata excludes building roofs and water from pedestrian routes.
{const {manager}=fixture();const hit={point:new T.Vector3(0,8,0),normal:new T.Vector3(0,1,0),mesh:{userData:{surfaceType:'building'}}};assert.equal(manager.isStreetSurface(hit),false);hit.mesh.userData.surfaceType='terrain';assert.equal(manager.isStreetSurface(hit),true);hit.point.y=0;assert.equal(manager.isStreetSurface(hit),false);manager.dispose();}
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
 for(let i=0;i<fps*2.5;i++)manager.update(1/fps);
 assert.equal(hits,1,'One contact per counterattack');assert.equal(damage,12);assert.equal(n.actor.key,'jab');manager.alarm(n.position,14);assert.equal(n.state,'ATTACK','Witness alarm interrupted self defense');
 player.position.set(0,2.01,-10);for(let i=0;i<fps*2;i++)manager.update(1/fps);assert.equal(hits,1,'Out of range attacks cannot damage');assert.equal(n.state,'FLEE');manager.dispose();
}
// Counterattacks rotate real clips; lethal damage ends combat and preserves the body.
for(const fps of [24,60,144]){
 const {manager,player}=fixture();for(let i=0;i<fps*3;i++)manager.update(1/fps);
 const n=manager.targets[0];for(const other of manager.targets)if(other!==n)manager.retire(other);manager.max=1;
 n.position.set(0,2.01,3);n.moveFrom.copy(n.position);n.moveTo.copy(n.position);n.yaw=n.targetYaw=Math.PI;player.position.set(0,2.01,1.7);
 n.retaliates=true;n.fearUntil=manager.time+60;manager.change(n,'DEFEND');
 const keys=[],damage=[];manager.onPlayerHit=amount=>damage.push(amount);let previous;
 for(let i=0;i<fps*12;i++){manager.update(1/fps);if(n.state==='ATTACK'&&n.attackStarted!==previous){previous=n.attackStarted;keys.push(n.actor.key);}}
 assert.deepEqual(keys.slice(0,3),['jab','cross','hook']);assert.deepEqual(damage.slice(0,3),[12,15,18]);
 manager.hit(n,'cross',25,player.position);assert.equal(n.health,75);assert(n.actor.healthBar.visible);assert.equal(n.actor.healthFill.scale.x,.75);
 manager.hit(n,'hook',100,player.position);assert.equal(n.health,0);assert.equal(n.state,'DEAD');assert(!manager.targets.includes(n));assert(!n.actor.healthBar.visible);
 const hits=damage.length;manager.hit(n,'jab',12,player.position);
 for(let i=0;i<fps*2;i++)manager.update(1/fps);
 assert.equal(damage.length,hits);assert.equal(n.health,0);assert(n.active);assert.equal(n.actor.model.rotation.x,-Math.PI/2);
 manager.visible=()=>true;for(let i=0;i<fps*8;i++)manager.update(1/fps);assert(n.active,'Visible corpse disappeared');
 manager.visible=()=>false;for(let i=0;i<fps;i++)manager.update(1/fps);
 assert(n.health===100||!n.active,'Dead slot was not retired or reset');
 if(n.active){assert.equal(n.actor.model.rotation.x,0);assert(!n.actor.healthBar.visible);}
 manager.dispose();
}
// Warning backs away while facing the player; witnesses watch safely then resume.
for(const fps of [24,60,144]){
 const {manager,player}=fixture();for(let i=0;i<fps*3;i++)manager.update(1/fps);const n=manager.targets[0];for(const other of manager.targets)if(other!==n)manager.retire(other);manager.max=1;
 n.position.set(0,2.01,3);n.moveFrom.copy(n.position);n.moveTo.copy(n.position);n.yaw=n.targetYaw=Math.PI;player.position.set(0,2.01,0);
 let notices=0;manager.onNotice=()=>notices++;manager.hit(n,'jab',12,player.position);
 for(let i=0;i<fps*.85;i++)manager.update(1/fps);assert.equal(n.state,'WARN');assert.equal(notices,1);const before=n.position.clone();
 for(let i=0;i<fps*.5;i++)manager.update(1/fps);assert(n.position.z>before.z,'Warning did not step backward');assert(Math.cos(n.yaw)<-.8,'Warning turned its back to player');assert(n.actor.current.timeScale<0,'Retreat did not reuse reversed walk');
 manager.change(n,'IDLE',100);n.retaliates=false;manager.alarm(player.position,20);
 for(let i=0;i<fps*4.5;i++)manager.update(1/fps);assert.equal(n.state,'WATCH');assert(n.position.distanceTo(player.position)>=6.7,'Witness watched inside danger radius');
 for(let i=0;i<fps*5;i++)manager.update(1/fps);assert(['IDLE','WALK'].includes(n.state),'Witness never resumed daily routine');manager.dispose();
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
{
 const onRoad=(roads,x,z)=>roads.some(road=>Math.abs(x-road.x)<road.width/2-1.2&&Math.abs(z-road.z)<road.depth/2-1.2);
 const cityPaths=id=>attachFootpaths({mapId:id,layout:{...LOCAL_CITY,blockSize:id==='procedural'?32:24,streetWidth:id==='procedural'?28:18},buildings:districtLayout(id).buildings,district:districtLayout(id)});
 const procedural=cityPaths('procedural');
 assert.equal(procedural.allows(-73.15,-90),true);assert.equal(procedural.allows(-60,-90),false);
 for(const id of ['harbor','gardens','old-town','skyline']){
  const paths=cityPaths(id),roads=districtLayout(id).roads;let samples=0,stray=0;
  for(const road of roads)for(let s=-.4;s<=.4;s+=.4)for(let t=-.2;t<=.2;t+=.2){
   const x=road.x+road.width*s*.5,z=road.z+road.depth*t*.5;if(!onRoad(roads,x,z))continue;samples++;
   if(paths.allows(x,z)&&!paths.nodes.some(node=>node.kind==='cross'&&Math.hypot(node.x-x,node.z-z)<2.4))stray++;
  }
  assert(samples>0&&stray===0,`${id} carriageway was walkable`);
  for(const node of paths.nodes){
   if(node.kind==='cross')assert(roads.filter(road=>Math.abs(node.x-road.x)<road.width/2+1.6&&Math.abs(node.z-road.z)<road.depth/2+1.6).length>=2,`${id} crossing left the junction`);
   else assert(paths.allows(node.x,node.z),`${id} footpath rejected`);
  }
  const start=paths.nodes.find(node=>node.kind==='sidewalk');
  const route=paths.route(start.x,start.z,start.yaw,()=>true);
  assert(route.length>0&&route.every(point=>paths.allows(point.x,point.z)),`${id} route left the path`);
 }
}
const manifest=JSON.parse(fs.readFileSync('public/citizens/manifest.json'));assert.equal(manifest.characters.length,3);for(const asset of manifest.characters){assert.equal(asset.meshes,1);assert.equal(asset.materials,1);assert(asset.bytes<5*1024*1024);assert(asset.triangles<60000);}
fs.mkdirSync('docs/qa/citizens-2026-10-27',{recursive:true});fs.writeFileSync('docs/qa/citizens-2026-10-27/results.json',JSON.stringify({scope:'CPU simulation and real skinned vertex validation, not GPU FPS',results},null,2)+'\n');console.table(results);console.log('PASS citizens: 3 textured-source rigs / 11 motions, 10-person cap, hits->startle->flee, one hit per action, no rewards, walls/ground, pause, offscreen spawn, missing terrain, pool reuse and CPU measurements at 24/60/144 FPS');
