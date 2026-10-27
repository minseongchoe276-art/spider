import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GameApp} from '../src/main.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {ThirdPersonCamera} from '../src/Camera.js';
import {cleanSettings} from '../src/PlayerSettings.js';
const folder='docs/qa/expanded-motion-2026-10-19';fs.mkdirSync(folder,{recursive:true});
const results=[];function check(name,fn){try{results.push({name,pass:true,detail:fn()});}catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);}}
function dom(fn){const old={window:globalThis.window,document:globalThis.document};globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.getElementById=()=>null;document.querySelector=()=>null;try{return fn();}finally{Object.assign(globalThis,old);}}
function app(){const g=Object.create(GameApp.prototype),scene=new T.Scene(),camera=new T.PerspectiveCamera(),audio=new Proxy({},{get:()=>()=>{}}),character={group:new T.Group(),update(){},fireWeb(){}};
 const city={buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false})},physics=new SwingPhysics(scene,city,character,audio);physics.position.set(0,20,0);physics.state='FALLING';physics.findBestAnchor=()=>new T.Vector3(0,45,12);
 Object.assign(g,{scene,camera,character,city,physics,audio,canvas:new EventTarget(),input:{},heldKeys:new Set(),preferences:{values:{settings:cleanSettings()}},isPlaying:true,isPaused:false,combat:{mode:'web',guard(){},clearHeld(){},cancel(){}},tpsCamera:new ThirdPersonCamera(camera,{}),showNotice(){},showCameraMode(){}});g.canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});g.initInputListeners();return g;}
const sources=[{}, {gamepadInput:true},{touchInput:true}],orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
function event(g,type,code,source){const e=new Event(type,{cancelable:true});for(const [k,v]of Object.entries({...sources[source],...(type.startsWith('key')?{code,repeat:false}:{button:code,target:g.canvas,clientX:400,clientY:300})}))Object.defineProperty(e,k,{value:v});window.dispatchEvent(e);}
for(const [code,mode,flag] of [['KeyW','web','forward'],['KeyS','web','backward'],['KeyA','web','left'],['KeyD','web','right'],['ShiftLeft','web','sprint'],['KeyF','web','wallRun'],['KeyF','combat','guard']])for(const order of orders)check(`three input owners ${mode}/${code}, release ${order}`,()=>dom(()=>{const g=app();g.combat.mode=mode;for(let s=0;s<3;s++)event(g,'keydown',code,s);for(let n=0;n<3;n++){event(g,'keyup',code,order[n]);assert.equal(g.input[flag],n<2,'A released device cancelled a still-held action');}assert(!g.heldKeys.size);return {owners:3};}));
for(const mode of ['close','follow','swing'])for(const order of orders)for(const toggle of [false,true])check(`dual-web jump/rearm ${mode}, ${order}, toggle ${toggle}`,()=>dom(()=>{const g=app(),p=g.physics;g.tpsCamera.setMode(mode);g.preferences.values.settings.webToggle=toggle;
 for(const s of [0,1,2])for(const b of [0,2])event(g,'mousedown',b,s);
 p.update(1/60,g.input,g.camera);assert.equal(p.webs.length,2);
 for(let n=0;n<3;n++){event(g,'keydown','KeyV',order[n]);event(g,'keyup','KeyV',order[n]);}assert.equal(g.tpsCamera.mode,mode);
 event(g,'keydown','Space',order[0]);event(g,'keyup','Space',order[0]);assert(!p.isSwinging && !p.webs.length);assert(p.velocity.y>=p.jumpForce);
 for(const s of order)for(const b of [0,2])event(g,'mouseup',b,s);
 event(g,'mousedown',0,order[2]);p.update(1/60,g.input,g.camera);assert.equal(p.webs.length,1,'A release after jumping prevented the next shot');assert(p.isSwinging);return {jumpVelocity:p.jumpForce};}));
for(let mask=0;mask<16;mask++)check(`opposing direction mask ${mask}`,()=>dom(()=>{const g=app();g.physics.position.set(0,.1,0);g.physics.state='IDLE';g.camera.rotation.y=Math.PI;
 for(const [i,c]of ['KeyW','KeyS','KeyA','KeyD'].entries())if(mask&(1<<i))event(g,'keydown',c,i%3);
 for(let i=0;i<30;i++)g.physics.update(1/60,g.input,g.camera);
 if((mask&3)===3)assert(Math.abs(g.physics.velocity.z)<1e-8,'Forward/backward did not cancel');if((mask&12)===12)assert(Math.abs(g.physics.velocity.x)<1e-8,'Left/right did not cancel');return {velocity:g.physics.velocity.toArray()};}));
// Real rendered mesh obstacles, including a thin wall and low ceiling. Every
// ordered camera pair is exercised while orbiting, zooming and moving.
const wall=new T.Mesh(new T.BoxGeometry(.08,15,16),new T.MeshBasicMaterial({side:T.DoubleSide}));wall.position.set(2,5,0);
const ceiling=new T.Mesh(new T.BoxGeometry(16,.1,16),new T.MeshBasicMaterial({side:T.DoubleSide}));ceiling.position.y=4;
const corner=new T.Mesh(new T.BoxGeometry(16,15,.08),new T.MeshBasicMaterial({side:T.DoubleSide}));corner.position.set(0,5,-2);
const fixtures={open:[],wall:[wall],ceiling:[ceiling],corner:[wall,corner]};Object.values(fixtures).flat().forEach(m=>m.updateMatrixWorld(true));
for(const fps of [24,30,60,144])for(const [terrain,meshes]of Object.entries(fixtures))for(const start of ['close','follow','swing'])for(const end of ['close','follow','swing'])for(const pitch of [-.52,0,.58])check(`camera ${fps}fps ${terrain} ${start}->${end} pitch${pitch}`,()=>{
 const camera=new T.PerspectiveCamera(64,1.6,.01,100),c=new ThirdPersonCamera(camera,{}),p=new T.Vector3(),v=new T.Vector3(6,0,3);c.placeBehind(p,0);c.lockBehind=false;c.pitch=pitch;c.setMode(start);let maxObstruction=0,maxStep=0,last=c.currentPos.clone();
 for(let i=0;i<Math.ceil(fps*.45);i++){p.x=Math.sin(i/fps)*.4;if(i===Math.ceil(fps*.1)){const yaw=c.yaw,angle=c.pitch;c.setMode(end);assert.equal(c.yaw,yaw);assert.equal(c.pitch,angle);}c.handleMouseMove(15/fps,0);c.handleWheel(i%2?1:-1);c.update(1/fps,p,v,true,meshes);
  assert(camera.position.toArray().concat(camera.quaternion.toArray(),camera.fov).every(Number.isFinite));assert(camera.fov>=50 && camera.fov<=80);
  const center=p.clone().add(new T.Vector3(0,1.7,0)),dir=camera.position.clone().sub(center),distance=dir.length();const ray=new T.Raycaster(center,dir.normalize(),0,distance),hit=ray.intersectObjects(meshes,true)[0];if(hit)maxObstruction=Math.max(maxObstruction,distance-hit.distance);assert(maxObstruction<.001,'Camera crossed rendered collision geometry');
  if(i>0)maxStep=Math.max(maxStep,camera.position.distanceTo(last));last.copy(camera.position);
 }return {frames:Math.ceil(fps*.45),maxObstruction,maxStep};
});
fs.writeFileSync(folder+'/input-camera-results.json',JSON.stringify({cases:results.length,failed:results.filter(r=>!r.pass).length,results},null,2)+'\n');console.log(`Expanded input/camera: ${results.filter(r=>r.pass).length}/${results.length}`);if(results.some(r=>!r.pass))process.exitCode=1;
