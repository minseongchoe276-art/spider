import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GameApp} from '../src/main.js';
import {ThirdPersonCamera} from '../src/Camera.js';
const oldWindow=globalThis.window,oldDocument=globalThis.document;
const win=new EventTarget(),doc=new EventTarget();globalThis.window=win;globalThis.document=doc;
doc.getElementById=()=>null;doc.querySelectorAll=()=>[];doc.body={classList:{remove(){},toggle(){}}};
try{
 const game=Object.create(GameApp.prototype),canvas=new EventTarget(),camera=new THREE.PerspectiveCamera();
 const rig=new ThirdPersonCamera(camera,canvas),physics={state:'IDLE',clearPendingInput(){},releaseWebButton(){}};
 let shots=0;
 Object.assign(game,{canvas,camera,tpsCamera:rig,physics,heldKeys:new Set(),input:{},isPlaying:true,isPaused:false,
  preferences:{values:{settings:{}}},audio:{ensureContext(){}},combat:{mode:'combat',firearm:()=> 'sniper-rifle',attack(){shots++;return true;},straight(){throw Error('scope must not fire');},clearHeld(){}},multiplayer:null});
 game.initInputListeners();
 const mouse=(type,button)=>{const e=new Event(type,{cancelable:true});Object.defineProperties(e,{button:{value:button},target:{value:canvas},clientX:{value:400},clientY:{value:300}});win.dispatchEvent(e);};
 const wheel=delta=>{const e=new Event('wheel',{cancelable:true});Object.defineProperty(e,'deltaY',{value:delta});canvas.dispatchEvent(e);};
 mouse('mousedown',2);assert(rig.isAiming);assert.equal(rig.scopeZoom,2);assert.equal(camera.userData.firearmScoped,true);assert.equal(shots,0);
 wheel(-1);assert.equal(rig.scopeZoom,4);wheel(-1);assert.equal(rig.scopeZoom,8);wheel(-1);assert.equal(rig.scopeZoom,8);
 mouse('mousedown',0);assert.equal(shots,1);mouse('mouseup',0);mouse('mouseup',2);assert(!rig.isAiming);assert.equal(camera.userData.firearmScoped,false);
 physics.state='FALLING';mouse('mousedown',2);assert(!rig.isAiming);mouse('mouseup',2);
 physics.state='IDLE';mouse('mousedown',2);game.clearInput();assert(!rig.isAiming);assert.equal(camera.userData.firearmScoped,false);
 const normal=new ThirdPersonCamera(new THREE.PerspectiveCamera(),{}),zoomed=new ThirdPersonCamera(new THREE.PerspectiveCamera(),{});zoomed.isAiming=true;zoomed.scopeZoom=4;
 normal.handleMouseMove(100,0);zoomed.handleMouseMove(100,0);assert(Math.abs(zoomed.yaw)<Math.abs(normal.yaw));
 console.log('PASS scoped input: hold, wheel limits, fire, release, airborne and input reset');
}finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
