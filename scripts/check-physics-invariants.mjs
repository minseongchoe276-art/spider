import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {constrainWebs} from '../src/WebConstraints.js';
const silent=new Proxy({},{get:()=>()=>{}}),camera=new THREE.PerspectiveCamera();
function player(){
  const p=new SwingPhysics(new THREE.Scene(),{colliders:[],buildingMeshes:[],checkCollision:()=>({collided:false}),getRooftopSpawn:()=>new THREE.Vector3(0,.1,0)},
    {group:new THREE.Group(),update(){},stopAnimation(){},fireWeb(){},requestTurn(){}},silent);
  p.position.set(0,500,0);p.state='FALLING';return p;
}
const report={rates:[24,30,60,90,120,144,240],parameters:{gravity:28,jumpImpulse:26,speedCap:48,fixedStep:1/120},ballistics:[],pendulum:[],randomDualConstraints:{samples:10000,maxStretch:0,maxOutwardSpeed:0,maxKineticGain:0},groundContact:[],collisions:[]};
let reference=null;
for(const fps of report.rates){
  const p=player();p.velocity.x=10;for(let i=0;i<fps;i++)p.update(1/fps,{},camera);
  const verticalError=Math.abs(p.position.y-(500-.5*p.gravity)),dragError=Math.abs(p.velocity.x-10*Math.exp(-.25));
  assert(Math.abs(p.velocity.y+p.gravity)<1e-8);assert(verticalError<.13);assert(dragError<.003);
  const jump=player();jump.position.y=.1;jump.state='IDLE';let peak=.1,landings=0;jump.onLanding=()=>landings++;
  for(let i=0;i<fps*2;i++){jump.update(1/fps,{jump:i===0},camera);peak=Math.max(peak,jump.position.y);}
  const jumpHeightError=Math.abs(peak-.1-jump.jumpForce**2/(2*jump.gravity));assert(jumpHeightError<.13);assert.equal(landings,1);
  report.ballistics.push({fps,verticalError,dragError,jumpHeightError,landings});
  const swing=player();swing.position.set(-12,44,0);swing.findBestAnchor=()=>new THREE.Vector3(0,60,0);assert(swing.startSwing(camera));
  const anchor=swing.anchorPoint.clone(),length=swing.ropeLength,baseY=anchor.y-length;
  const energy=()=>swing.velocity.lengthSq()*.5+swing.gravity*(swing.position.y-baseY),initial=energy();let maxGain=0,maxStretch=0;
  for(let i=0;i<fps*8;i++){swing.update(1/fps,{webHold:true},camera);maxGain=Math.max(maxGain,energy()-initial);maxStretch=Math.max(maxStretch,swing.position.distanceTo(anchor)-length);assert(swing.anchorPoint.equals(anchor));}
  const loss=1-energy()/initial;assert(maxGain<.1);assert(maxStretch<1e-6);assert(loss>=0&&loss<.02);
  const divergence=reference?swing.position.distanceTo(reference):0;assert(divergence<1e-7);reference??=swing.position.clone();
  const before=swing.velocity.clone();swing.releaseSwing(false);assert(swing.velocity.equals(before));
  report.pendulum.push({fps,maxEnergyGain:maxGain,energyLossFraction:loss,maxStretch,positionDivergence:divergence});
  const grounded=player();grounded.position.set(0,.1,0);grounded.state='IDLE';grounded.findBestAnchor=()=>new THREE.Vector3(0,30,30);grounded.startSwing(camera);
  let maxRise=0;for(let i=0;i<fps*2;i++){grounded.update(1/fps,{webHold:true},camera);maxRise=Math.max(maxRise,grounded.position.y-.1);assert(grounded.velocity.length()<1e-7);}
  assert(maxRise<1e-7);report.groundContact.push({fps,maxUncommandedRise:maxRise});
  const wall=player();wall.position.set(0,5,0);wall.velocity.set(0,0,48);wall.city.colliders=[{minX:-10,maxX:10,minY:0,maxY:20,minZ:2,maxZ:2.01}];
  for(let i=0;i<fps;i++){wall.update(1/fps,{},camera);assert(wall.position.z<=1.300001,'Crossed a 1cm wall');assert(wall.velocity.length()<=48.000001);}
  report.collisions.push({fps,maxForwardPosition:wall.position.z,wallFront:2,bodyRadius:.7});
}
let seed=1234;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let i=0;i<10000;i++){
  const origin=new THREE.Vector3((random()-.5)*10,(random()-.5)*10,(random()-.5)*10);
  const webs=[0,1].map(()=>{const anchor=new THREE.Vector3((random()-.5)*40,(random()-.5)*40,(random()-.5)*40);return {anchor,length:origin.distanceTo(anchor)};});
  const position=origin.clone().add(new THREE.Vector3((random()-.5)*.8,(random()-.5)*.8,(random()-.5)*.8));
  const velocity=new THREE.Vector3((random()-.5)*40,(random()-.5)*40,(random()-.5)*40),initial=velocity.lengthSq()*.5;
  constrainWebs(position,velocity,webs);assert([...position,...velocity].every(Number.isFinite));
  const gain=velocity.lengthSq()*.5-initial;assert(gain<1e-8);
  report.randomDualConstraints.maxKineticGain=Math.max(report.randomDualConstraints.maxKineticGain,gain);
  for(const web of webs){const stretch=position.distanceTo(web.anchor)-web.length;assert(stretch<1e-6);
    report.randomDualConstraints.maxStretch=Math.max(report.randomDualConstraints.maxStretch,stretch);
    if(stretch>=-1e-4){const outward=velocity.dot(position.clone().sub(web.anchor).normalize());assert(outward<1e-7);report.randomDualConstraints.maxOutwardSpeed=Math.max(report.randomDualConstraints.maxOutwardSpeed,outward);}
  }
}
const directory='docs/qa/fullscreen-physics-2026-10-19';fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(`${directory}/metrics.json`,JSON.stringify(report,null,2)+'\n');
console.log(`PASS: 7 frame rates, analytical freefall/drag/jump, one landing per jump, 8s unpowered pendulum, release momentum, no automatic ground bounce, 1cm walls, 10,000 random two-web constraints. Max stretch ${report.randomDualConstraints.maxStretch}m; 8s energy loss ${(report.pendulum[0].energyLossFraction*100).toFixed(3)}%.`);
