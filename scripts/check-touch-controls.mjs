import assert from 'node:assert/strict';
import { TouchControls, stickState, isTouchDevice } from '../src/TouchControls.js';

assert.equal(isTouchDevice({coarsePointer:false,mobileUserAgent:false}),false,'Touchscreen laptop with a mouse must keep desktop controls');
assert.equal(isTouchDevice({coarsePointer:true}),true,'Primary touch input must enable mobile controls');
assert.equal(isTouchDevice({mobileUserAgent:true}),true,'Mobile UA must cover browsers without pointer media support');

assert(!stickState(0,0).forward);
assert(!stickState(5,-5).forward,'Central deadzone must reject thumb jitter');
assert(stickState(0,-30).forward&&!stickState(0,-30).sprint);
assert(stickState(0,-100).forward&&stickState(0,-100).sprint);
assert(!stickState(12,-40).right,'A nearly straight thumb drag must keep moving straight');
assert(!stickState(0,-48).sprint,'Walking must remain available close to the outer ring');
assert(stickState(0,-44,52,true).sprint,'Small thumb drift must not cancel an active sprint');
assert(!stickState(0,-35,52,true).sprint,'Pulling back must exit sprint');
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
const disabled=Object.assign(target({key:'heavy'}),{disabled:true});
controls.down(event(99,disabled));assert(!controls.pointers.has(99),'Disabled actions captured a finger');
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
const firstDrag=calls.filter(c=>c[0]==='look').at(-1);
assert(firstDrag[1]>0&&firstDrag[1]<20,'Action aiming must subtract its deadzone without a camera jump');
controls.up({pointerId:12});assert.equal(controls.pointers.size,0);
console.log('PASS: floating stick neutral acquisition, screen-edge origin, sprint drag, offhand independence, rest-position reset, jump drag aiming and jitter rejection');

const oldDocument=globalThis.document;
try{
 globalThis.document={body:{classList:cls}};let writes=0;
 const caption=()=>({textContent:''});
 const button=()=>{const span=caption();return {hidden:false,dataset:{},querySelector:s=>s==='span'?span:{setAttribute(){writes++;}},setAttribute(){writes++;}};};
 const mode=button(),zip=caption(),buttons=Object.fromEntries(['wall','guard','trick','heavy'].map(k=>[k,button()]));
 const webButtons=[0,2].map(n=>Object.assign(button(),{dataset:{mouse:String(n)}}));
 controls.root={dataset:{},querySelector:s=>s==='.touch-mode'?mode:s==='.touch-zip span'?zip:s==='.touch-zip'?button():buttons[s.replace('.touch-','')],querySelectorAll:()=>webButtons};
 controls.extra={hidden:true};controls.announced=true;game.combat={mode:'web'};game.physics.state='IDLE';
 controls.update();assert(buttons.guard.hidden&&!buttons.wall.hidden);
 game.combat.allowGuardInWeb=true;controls.update();assert(buttons.guard.hidden,'Wire mode must keep F assigned to walls');game.combat.allowGuardInWeb=false;controls.update();
 const steady=writes;controls.update();assert.equal(writes,steady,'Unchanged HUD rewrote icons/labels every animation frame');
 game.combat.mode='combat';controls.update();assert(!buttons.guard.hidden&&buttons.wall.hidden);
 assert.equal(zip.textContent,'강공격');
 buttons.guard.dataset.key='wall';const guard=target({key:'wall'});controls.down(event(20,guard));controls.down(event(21,left));
 game.physics.state='FALLING';controls.update();assert(!controls.pointers.has(20),'A hidden guard retained its held key');assert(controls.pointers.has(21),'Changing context cancelled an independent strand');
 assert(calls.some(c=>c[0]==='wall'&&c[1]===false));assert.equal(zip.textContent,'착지 후 강공격');assert(webButtons.every(b=>b.disabled));
 controls.up({pointerId:21});
 game.physics.state='ROLLING';controls.update();assert.equal(zip.textContent,'회복 후 강공격','Recovery labels must update even while both states are airborne');
 controls.release();
 console.log('PASS: contextual combat HUD, cached DOM updates, airborne guard cleanup and independent held strand');
}finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}

// Split road buttons own independent fingers; a screen tap is distinct from orbit.
{
 const road=Object.create(TouchControls.prototype),events=[];
 const canvas=target();canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:400});
 const physics={setWebAimPoint:(...args)=>events.push(['aim',...args]),findBestAnchor:()=>true};
 const g={isPlaying:true,canvas,physics,camera:{},input:{},combat:{mode:'web'},vehicle:{driving:true},audio:{ensureContext(){}},syncHeldInput(){},showNotice(){}};
 Object.assign(road,{game:g,enabled:true,pointers:new Map(),key(){},mouse:(...args)=>events.push(['mouse',...args])});
 road.down(event(101,target({drive:'forward'})));road.down(event(102,target({drive:'left'})));
 assert.deepEqual(g.touchDirections,{forward:true,left:true});
 road.up({pointerId:102,type:'pointerup'});assert.deepEqual(g.touchDirections,{forward:true});
 road.up({pointerId:101,type:'pointercancel'});assert.deepEqual(g.touchDirections,{});
 g.vehicle.driving=false;road.down(event(103,canvas,190,70));road.up({pointerId:103,type:'pointerup'});
 assert(road.wireLatched&&physics.mobileExactAim);assert.equal(g.input.webFireHeld,false);
 assert(events.some(e=>e[0]==='aim'&&e[1]===190&&e[2]===70),'Screen tap must use the touched coordinates');
 road.releaseWire();const count=events.length;
 road.down(event(104,canvas,190,70));road.up({pointerId:104,type:'pointercancel'});assert.equal(events.length,count,'Cancelled tap fired a web');
 console.log('PASS: split pedals/steering, independent road release, exact screen attachment and canceled tap');
}
