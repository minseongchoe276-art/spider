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

game.isPaused=false;stick.style={};
controls.moveZone={getBoundingClientRect:()=>({x:10,y:100,width:180,height:400})};
controls.down(event(10,movement,66,220));
assert(!game.touchDirections.forward&&!game.touchDirections.left,'Floating stick must start neutral even near the screen edge');
controls.move(event(10,movement,66,160));assert(game.touchDirections.forward&&game.touchDirections.sprint);
assert.equal(stick.style.left,'10px','Floating stick coordinates must include the movement zone offset');
controls.down(event(11,right));controls.up({pointerId:10});
assert(controls.pointers.has(11),'Releasing movement cancelled the held offhand');
assert.equal(controls.stickOrigin,null);assert.equal(stick.style.top,'');controls.release();
const lookCalls=()=>calls.filter(c=>c[0]==='look').length;
const before=lookCalls();controls.down(event(12,jump,100,100));
controls.move(event(12,jump,103,101));assert.equal(lookCalls(),before,'Button jitter moved the camera');
controls.move(event(12,jump,120,100));assert.equal(lookCalls(),before+1,'Held jump cannot drag to aim');
controls.up({pointerId:12});assert.equal(controls.pointers.size,0);
console.log('PASS: floating stick neutral acquisition, screen-edge origin, sprint drag, offhand independence, rest-position reset, jump drag aiming and jitter rejection');

const oldDocument=globalThis.document;
try{
 globalThis.document={body:{classList:cls}};let writes=0;
 const caption=()=>({textContent:''});
 const button=()=>{const span=caption();return {hidden:false,dataset:{},querySelector:s=>s==='span'?span:{setAttribute(){writes++;}},setAttribute(){writes++;}};};
 const mode=button(),zip=caption(),buttons=Object.fromEntries(['wall','guard','trick','heavy'].map(k=>[k,button()]));
 const webButtons=[0,2].map(n=>Object.assign(button(),{dataset:{mouse:String(n)}}));
 controls.root={dataset:{},querySelector:s=>s==='.touch-mode'?mode:s==='.touch-zip span'?zip:buttons[s.match(/data-key="(\w+)"/)?.[1]],querySelectorAll:()=>webButtons};
 controls.extra={hidden:true};controls.announced=true;game.combat={mode:'web'};game.physics.state='IDLE';
 controls.update();assert(buttons.guard.hidden&&buttons.heavy.hidden&&!buttons.wall.hidden&&!buttons.trick.hidden);
 const steady=writes;controls.update();assert.equal(writes,steady,'Unchanged HUD rewrote icons/labels every animation frame');
 game.combat.mode='combat';controls.update();assert(!buttons.guard.hidden&&!buttons.heavy.hidden&&buttons.wall.hidden&&buttons.trick.hidden);
 assert.equal(zip.textContent,'훅');
 const guard=target({key:'guard'});controls.down(event(20,guard));controls.down(event(21,left));
 game.physics.state='FALLING';controls.update();assert(!controls.pointers.has(20),'A hidden guard retained its held key');assert(controls.pointers.has(21),'Changing context cancelled an independent strand');
 assert(calls.some(c=>c[0]==='guard'&&c[1]===false));assert.equal(zip.textContent,'착지 후 훅');assert(webButtons.every(b=>b.disabled));
 controls.up({pointerId:21});
 console.log('PASS: contextual combat HUD, cached DOM updates, airborne guard cleanup and independent held strand');
}finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
