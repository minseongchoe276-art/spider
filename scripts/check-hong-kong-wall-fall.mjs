import assert from 'node:assert/strict';
import * as T from 'three';
import {StreamedCollision} from '../src/StreamedCollision.js';
import {UrbanGroundCity} from '../src/UrbanGroundCity.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
const silent=new Proxy({},{get:()=>()=>{}}),held={forward:true,wallRun:true,strafe:0};
async function fixture(railing=true,x=.3){
 const world=new StreamedCollision();await world.initialized;const meshes=[];
 const box=(size,pos)=>{const m=new T.Mesh(new T.BoxGeometry(...size));m.position.set(...pos);m.updateMatrixWorld(true);meshes.push(m);world.enqueue(m);return m;};
 const roof=box([12,20,14],[0,10,7]);
 if(railing){box([12,.12,.12],[0,21.1,.08]);for(let x=-5.5;x<6;x+=.65)box([.06,1.1,.06],[x,20.55,.08]);}
 world.setActiveMeshes(meshes);for(let i=0;i<meshes.length+8;i++)world.update(new T.Vector3(0,19.3,-.4));
 const city=Object.create(UrbanGroundCity.prototype);Object.assign(city,{isStreamed:true,isReady:true,collisionWorld:world,colliders:[],buildingMeshes:meshes,playerPosition:new T.Vector3(),playableHalfExtent:2400,getRooftopSpawn:()=>new T.Vector3(0,20.1,5)});
 const character={group:new T.Group(),update(){},stopAnimation(){},cancelAirTrick(){}},p=new SwingPhysics(new T.Scene(),city,character,silent);
 p.position.set(x,19.3,-.4);p.state='WALL_RUNNING';p.wallNormal.set(0,0,-1);p.character.wallNormal=p.wallNormal;
 return {world,roof,meshes,city,p};
}
let failures=0;
async function test(name,fn){try{await fn();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+': '+e.message);}}
await test('A real streamed facade with open railing gaps reaches a supported roof at 24/30/60/144 FPS',async()=>{
 for(const fps of [24,30,60,144])for(const x of [.3,5.6,-5.6]){const f=await fixture(true,x);try{
 let arrived=false;for(let frame=0;frame<fps*5;frame++){f.p.update(1/fps,{...held},new T.PerspectiveCamera());if(['IDLE','RUNNING','SPRINTING'].includes(f.p.state)&&f.p.position.z>.5&&Math.abs(f.p.position.y-20.1)<.1){arrived=true;break;}}
 assert(arrived,`${fps}fps x=${x} stayed ${f.p.state} at y=${f.p.position.y}`);assert(['IDLE','RUNNING','SPRINTING'].includes(f.p.state));assert(f.p.position.z>.5);assert(Math.abs(f.p.position.y-20.1)<.1);for(let i=0;i<fps;i++)f.p.update(1/fps,{strafe:0},new T.PerspectiveCamera());assert(Math.abs(f.p.position.y-20.1)<.1,'Arrival did not remain supported after releasing climb');
 }finally{f.world.dispose();}}
});
await test('Visual LOD eviction preserves a nearby climbing facade, then releases it after departure',async()=>{
 const f=await fixture(false),old=globalThis.performance;let now=0;globalThis.performance={now:()=>now};
 try{const center=new T.Vector3(0,12,-.4);f.world.setActiveMeshes([]);f.world.update(center);now=3000;f.world.update(center);
 assert(f.world.meshes.has(f.roof.uuid),'Climbing wall disappeared while the player was beside it');
 now=6000;f.world.update(new T.Vector3(50,12,-20));assert(!f.world.meshes.has(f.roof.uuid),'Departed terrain was retained forever');
 }finally{globalThis.performance=old;f.world.dispose();}
});
await test('An under-map fall restores the most recent supported position rather than an obsolete origin',async()=>{
 const f=await fixture(false);try{
 f.p.position.set(1,20.1,5);f.p.state='IDLE';for(let i=0;i<40;i++)f.p.update(1/60,{strafe:0},new T.PerspectiveCamera());
 const saved=f.p.position.clone();f.p.position.set(50,-13,50);f.p.velocity.set(0,-25,0);f.p.state='FALLING';f.p.update(1/60,{strafe:0},new T.PerspectiveCamera());
 assert(f.p.position.distanceTo(saved)<.3,'Did not recover to the last supported feet');assert(f.p.velocity.length()<.01);
 }finally{f.world.dispose();}
});
await test('The recovery floor stays available across an unloaded district and is released when superseded',async()=>{
 const f=await fixture(false),old=globalThis.performance;let now=0;
 try{
 f.p.position.set(1,20.1,5);f.p.state='IDLE';for(let i=0;i<40;i++)f.p.update(1/60,{strafe:0},new T.PerspectiveCamera());
 assert.equal(f.world.recoveryHandle,f.world.meshes.get(f.roof.uuid).collider.handle);
 globalThis.performance={now:()=>now};f.world.setActiveMeshes([]);const away=new T.Vector3(100,35,50);f.world.update(away);now=5000;f.world.update(away);
 assert(f.world.meshes.has(f.roof.uuid),'Last safe recovery floor was evicted');
 f.world.setRecoveryCollider(null);now=8000;f.world.update(away);assert(!f.world.meshes.has(f.roof.uuid),'Superseded recovery floor leaked');
 }finally{globalThis.performance=old;f.world.dispose();}
});
if(failures)process.exitCode=1;
