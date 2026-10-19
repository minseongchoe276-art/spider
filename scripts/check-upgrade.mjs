import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cleanSettings,canonicalKey,rebind,deadzone} from '../src/PlayerSettings.js';
import {StuntSystem} from '../src/StuntSystem.js';
import {Progression} from '../src/Progression.js';
import {PerformanceBudget} from '../src/PerformanceBudget.js';
import {CombatSystem} from '../src/Combat.js';
import {blockedSegment,proceduralCollision} from './city-collision.mjs';
import {City} from '../src/City.js';
const settings=cleanSettings({sensitivity:Infinity,fov:1000,shake:-1,bindings:{forward:'Escape'}});
assert.equal(settings.sensitivity,1);assert.equal(settings.fov,95);assert.equal(settings.shake,0);assert.equal(settings.bindings.forward,'KeyW');
assert(rebind(settings,'forward','KeyE'));assert.equal(settings.bindings.zip,'KeyW');assert.equal(canonicalKey('KeyE',settings),'KeyW');assert.equal(canonicalKey('KeyW',settings),'KeyE');assert.equal(canonicalKey('ArrowUp',settings),'KeyW');assert.equal(deadzone(.1),0);
const s=new StuntSystem();const first=s.add('flip',250);assert.equal(first,250);assert(s.add('flip',250)<first);s.add('wall',100);assert(s.multiplier>1);assert.equal(s.total,0);assert(s.bank(12)>0);assert(s.total>0);s.add('flip',250);s.fail();assert.equal(s.pending,0);
let saved;const storage={getItem:()=>saved,setItem:(_key,value)=>{saved=value;}};
const p=new Progression(storage);assert.equal(p.unlocked[0].id,'cyan');p.data.theme='cyan';p.visit(new THREE.Vector3(10,20,30),'procedural',true);p.save();const loaded=new Progression(storage);assert(!Object.hasOwn(loaded.data,'score'));assert.equal(loaded.color,0x72f1ff);assert.deepEqual(loaded.data.safe.procedural,[10,20,30]);
const denied=new Progression({getItem:()=>'{broken',setItem:()=>{throw Error('quota');}});denied.visit(new THREE.Vector3(1,1,1),'procedural');assert.equal(denied.save(),false);assert(denied.dirty);
const budget=new PerformanceBudget();let change;for(let i=0;i<180;i++)change=budget.update(1/25,true,1.5)??change;assert(change<1.5);assert(budget.p95>25);
const city=proceduralCollision();assert.equal(city.buildings.length,16);assert(city.colliders.length<250);const c=city.colliders[0],y=(c.minY+c.maxY)/2-1;
assert(blockedSegment({x:c.minX-2,y,z:(c.minZ+c.maxZ)/2},{x:c.maxX+2,y,z:(c.minZ+c.maxZ)/2},[c]));assert(!blockedSegment({x:c.minX-2,y:c.maxY+5,z:c.minZ},{x:c.maxX+2,y:c.maxY+5,z:c.minZ},[c]));
// The client map's seeded texture draws and server's map must match exactly.
const client=Object.create(City.prototype);Object.assign(client,{randomState:0x5f3759df});const expected=45+Math.max(0,1-Math.hypot(-1.5,-1.5)/2.8)*70+client.random()*40;assert(Math.abs(city.buildings[0].height-expected)<1e-10);
const scene=new THREE.Scene(),character={group:new THREE.Group()},physics={position:new THREE.Vector3(),velocity:new THREE.Vector3(),state:'IDLE',facingAngle:0,city:{raycast:()=>null},clearWebAnchor(){},clearPendingInput(){}};
const combat=new CombatSystem(scene,physics,character);const enemy={type:'shield',position:new THREE.Vector3(0,0,1),health:140,mesh:new THREE.Group()};combat.enemies=[enemy];combat.strike({key:'jab',hits:new Set()},{damage:12,reach:2});assert.equal(enemy.health,140);combat.strike({key:'hook',hits:new Set()},{damage:32,reach:2});assert.equal(enemy.health,108);
physics.state='FALLING';assert(combat.airStrike(new THREE.PerspectiveCamera()));assert.equal(combat.action.key,'slam');assert(physics.velocity.y<=-14);
console.log('PASS upgrade: key remaps, corrupt settings, combo banking/failure, persistent rewards, safe saves, quota failure, adaptive quality, identical server terrain, shield and air strike');
// Exercise the real browser input handler, including release behavior and remaps.
const {GameApp}=await import('../src/main.js');const previousWindow=globalThis.window,previousDocument=globalThis.document;
const win=new EventTarget(),doc=new EventTarget(),canvas=new EventTarget();doc.getElementById=()=>null;canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});globalThis.window=win;globalThis.document=doc;
try{let released=0;const app=Object.create(GameApp.prototype);const prefs=cleanSettings({webToggle:true,sprintToggle:true});rebind(prefs,'forward','KeyI');
 Object.assign(app,{preferences:{values:{settings:prefs}},canvas,input:{},heldKeys:new Set(),isPlaying:true,isPaused:false,physics:{state:'FALLING',setWebAimPoint(){},findBestAnchor(){},releaseWebButton(){released++;},clearPendingInput(){}},combat:{mode:'web',clearHeld(){}},audio:{ensureContext(){}}});app.initInputListeners();
 const mouse=(type,button)=>{const e=new Event(type);Object.defineProperties(e,{button:{value:button},clientX:{value:400},clientY:{value:300},target:{value:canvas}});win.dispatchEvent(e);};
 const key=(type,code)=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,'code',{value:code});win.dispatchEvent(e);};
 mouse('mousedown',0);mouse('mouseup',0);assert.equal(app.input.webHold,true);assert.equal(released,0);mouse('mousedown',0);assert.equal(app.input.webHold,false);assert.equal(released,1);
 key('keydown','KeyI');assert.equal(app.input.forward,true);key('keyup','KeyI');assert.equal(app.input.forward,false);key('keydown','KeyW');assert.equal(app.input.forward,false);
 key('keydown','ShiftLeft');key('keyup','ShiftLeft');assert.equal(app.input.sprint,true);key('keydown','ShiftLeft');assert.equal(app.input.sprint,false);
 app.clearInput();assert.equal(app.input.webHold,false);assert.equal(app.input.sprint,false);
 console.log('PASS real input: mouse toggle, remapped movement, unbound original key, sprint toggle, pause clearing');
}finally{globalThis.window=previousWindow;globalThis.document=previousDocument;}

// Returning to a saved position restores the location and clears velocity.
const {PlayerExperience}=await import('../src/PlayerExperience.js');let stopped=0,ghostStopped=0,failed=0;
const restore=Object.create(PlayerExperience.prototype);restore.safe=()=>true;
restore.game={city:{isStreamed:false},progression:{data:{safe:{procedural:[4,20,6]}}},timeTrial:{stop(){stopped++;}},updateTrialHUD(){},clearInput(){},resetCamera(){},physics:{resetPosition(){},position:new THREE.Vector3(),previousFixedPosition:new THREE.Vector3(),renderPosition:new THREE.Vector3(),velocity:new THREE.Vector3(5,4,3)}};
restore.ghost={stop(){ghostStopped++;}};assert(restore.restorePosition());assert.deepEqual(restore.game.physics.position.toArray(),[4,20,6]);assert.equal(restore.game.physics.velocity.length(),0);
const mantle=new StuntSystem();mantle.update(.1,'MANTLING');assert(mantle.pending>0);mantle.update(.1,'IDLE');assert(mantle.total>0);assert.equal(mantle.pending,0);
console.log('PASS saved-position restore, velocity reset, standalone mantle animation checks');
