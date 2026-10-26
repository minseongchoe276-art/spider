import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Multiplayer} from '../src/Multiplayer.js';
import {CAMERA_PITCH_MAX, CAMERA_PITCH_MIN, ThirdPersonCamera} from '../src/Camera.js';

const camera=new THREE.PerspectiveCamera(65,16/9,.2,1000);
camera.position.set(0,1,0);camera.lookAt(0,1,10);camera.updateMatrixWorld(true);
let sends=0,charges=0,shots=0,available=true,blocked=false;
const runner={id:'runner',team:'runner',name:'Runner',seen:true,x:3,y:0,z:10};
const online={id:'cop',players:[{id:'cop',team:'police'},runner],room:{phase:'playing',mode:'tag'},
 game:{camera,physics:{position:new THREE.Vector3()},city:{raycast:()=>blocked?{}:null}},
 send(){sends++;},feedback:{canFire(){charges++;return available;},sent(){shots++;},show(){}},
};
const fire=()=>Multiplayer.prototype.sendAttack.call(online,'web',0);
const preview=()=>Multiplayer.prototype.attackPreview.call(online,'web');
assert.equal(preview().aimReady,false);
assert.equal(fire(),false);assert.equal(sends,0);assert.equal(charges,0);
runner.x=0;assert.equal(preview().aimReady,true);
assert.equal(fire(),true);assert.equal(sends,1);assert.equal(shots,1);
available=false;assert.equal(fire(),true,'Cooldown click fell through into traversal');assert.equal(sends,1);
blocked=true;const before=charges;assert(preview().blocked);assert.equal(fire(),true);assert.equal(sends,1);assert.equal(charges,before);
blocked=false;runner.z=-10;assert.equal(fire(),false);assert.equal(sends,1);
for(const fps of [24,60,144]){
 const view=new ThirdPersonCamera(camera,{});
 for(let frame=0;frame<fps;frame++)view.handleKeyboardLook(new Set(['End']),1/fps);
 assert(Math.abs(view.yaw+1.32)<1e-9);assert.equal(view.lockBehind,false);
 view.handleKeyboardLook(new Set(['Home','End']),1);assert(Math.abs(view.yaw+1.32)<1e-9);
 view.handleKeyboardLook(new Set(['PageUp']),10);assert.equal(view.pitch,CAMERA_PITCH_MIN);
 view.handleKeyboardLook(new Set(['PageDown']),10);assert.equal(view.pitch,CAMERA_PITCH_MAX);
}
const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshBasicMaterial());
ground.rotation.x=-Math.PI/2;ground.position.y=0;ground.updateMatrixWorld(true);
const viewCamera=new THREE.PerspectiveCamera(64,16/9,.1,200);
const street=new ThirdPersonCamera(viewCamera,{});
const feet=new THREE.Vector3(0,.1,0),still=new THREE.Vector3();
const aim=new THREE.Vector3();
street.placeBehind(feet,0,CAMERA_PITCH_MIN);street.lockBehind=false;
for(let i=0;i<90;i++)street.update(1/60,feet,still,false,[ground]);
viewCamera.getWorldDirection(aim);
assert(aim.y>0.9,`flat ground should aim steeply up, elevation ${aim.y}`);
street.pitch=CAMERA_PITCH_MAX;street.clampPitch();
for(let i=0;i<90;i++)street.update(1/60,feet,still,false,[ground]);
viewCamera.getWorldDirection(aim);
assert(aim.y<-0.9,`flat ground should aim steeply down, elevation ${aim.y}`);
assert(CAMERA_PITCH_MAX<Math.PI/2-0.25 && CAMERA_PITCH_MIN>-Math.PI/2+0.12,'pitch stays short of a vertical flip');
console.log('PASS shared reticle gate, no off-aim damage/cooldown, no traversal during aimed cooldown/occlusion, frame-independent keyboard aim');
