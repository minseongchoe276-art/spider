import assert from 'node:assert/strict';
import { TouchControls, stickState, isTouchDevice } from '../src/TouchControls.js';

assert.equal(isTouchDevice({coarsePointer:false,mobileUserAgent:false}),false,'Touchscreen laptop with a mouse must keep desktop controls');
assert.equal(isTouchDevice({coarsePointer:true}),true,'Primary touch input must enable mobile controls');
assert.equal(isTouchDevice({mobileUserAgent:true}),true,'Mobile UA must cover browsers without pointer media support');

assert(!stickState(0,0).forward);
assert(!stickState(5,-5).forward,'Central deadzone must reject thumb jitter');
assert(stickState(0,-30).forward&&!stickState(0,-30).sprint);
assert(stickState(0,-100).forward&&stickState(0,-100).sprint);
assert(stickState(100,100).right&&stickState(100,100).backward);
const edge=stickState(999,999);assert(Math.abs(Math.hypot(edge.x,edge.y)-52)<1e-8);

// Use the real pointer ownership/release methods without a browser renderer.
const controls=Object.create(TouchControls.prototype),calls=[];
const cls={add(){},remove(){},toggle(){}};
const stick={getBoundingClientRect:()=>({x:0,y:0,width:132,height:132}),classList:cls};
const game={isPlaying:true,isPaused:false,physics:{setWebAimPoint(){}},audio:{ensureContext(){}},syncHeldInput(){},tpsCamera:{handleMouseMove(...args){calls.push(['look',...args]);}}};
Object.assign(controls,{game,enabled:true,pointers:new Map(),stick,knob:{style:{}},key:(action,down)=>calls.push([action,down]),mouse:(button,down)=>calls.push([button,down])});
const target=(dataset={},isStick=false)=>({dataset,classList:cls,setPointerCapture(){},closest(sel){if(sel==='button')return isStick?null:this;if(sel==='.touch-stick')return isStick?stick:null;return null;}});
const event=(id,el,x=66,y=66)=>({pointerId:id,pointerType:'touch',target:el,clientX:x,clientY:y,preventDefault(){}});
const left=target({mouse:'0'}),right=target({mouse:'2'}),movement=target({},true);
controls.down(event(1,left));controls.down(event(2,right));controls.down(event(3,movement,66,0));
assert.equal(controls.pointers.size,3);assert(game.touchDirections.forward&&game.touchDirections.sprint);
controls.move(event(2,right,90,70));assert(calls.some(c=>c[0]==='look'),'A held web button must also support looking');
controls.up({pointerId:1});assert(controls.pointers.has(2)&&controls.pointers.has(3),'One release cancelled other fingers');
controls.up({pointerId:999});assert.equal(controls.pointers.size,2);
controls.release();assert.equal(controls.pointers.size,0);assert.deepEqual(game.touchDirections,{});
assert(calls.some(c=>c[0]===0&&c[1]===false)&&calls.some(c=>c[0]===2&&c[1]===false));
const jump=target({key:'jump'});controls.down(event(4,jump));game.isPaused=true;controls.move(event(4,jump,70,70));
assert.equal(controls.pointers.size,0);assert(calls.some(c=>c[0]==='jump'&&c[1]===false));
console.log('PASS: stick deadzone/directions/sprint/clamp, three simultaneous touches, held-web look, independent release, cancel and pause cleanup');
