import assert from 'node:assert/strict';
import * as T from 'three';
import {CombatSystem,ATTACKS} from '../src/Combat.js';
import {weatherAt,WEATHER_TYPES} from '../src/WorldWeather.js';
import {repairTileGeometry} from '../src/TileGeometryIntegrity.js';
import {guardedDamage} from '../src/AttackRules.js';
import {cleanSettings,canonicalKey} from '../src/PlayerSettings.js';
const physics={position:new T.Vector3(),velocity:new T.Vector3(),state:'IDLE',facingAngle:0,city:{raycast:()=>null},clearPendingInput(){},clearWebAnchor(){}},character={actions:{rightHook:{}}};
const c=new CombatSystem(new T.Scene(),physics,character),input={};
c.toggle(input);assert.equal(c.mode,'combat');assert(!character.combatStance);c.before(.016,null,input);assert(!character.combatAction);c.before(.016,null,{combatStance:true});assert(character.combatStance);c.before(.016,null,input);assert(!character.combatStance);
for(const side of ['left','right']){c.cancel();c.stamina=100;assert(c.dodge({[side]:true}));assert.equal(c.action.key,side==='left'?'dodgeLeft':'dodgeRight');c.before(.08,null,input);const hp=c.health;assert.equal(c.receiveDamage(15,{position:new T.Vector3(0,0,1)}),0);assert.equal(c.health,hp);c.action.time=c.action.duration*.94;assert.equal(c.receiveDamage(15,{position:new T.Vector3(0,0,1)}),15);c.invulnerable=0;}
const random=Math.random;const keys=[];try{for(const value of [0,.99]){Math.random=()=>value;c.cancel();c.stamina=100;assert(c.straight());keys.push(c.action.key);assert(ATTACKS[c.action.key].duration<.6);}}finally{Math.random=random;}assert.deepEqual(keys,['rightHook','cross']);
const defender={pose:{state:'IDLE',combat:{key:'dodgeLeft',time:.15,duration:.38}},lastMove:1000,x:0,z:0};assert.equal(guardedDamage({x:0,z:1},defender,'punch',1030).damage,0);assert(guardedDamage({x:0,z:1},defender,'punch',1400).damage>0);
const settings=cleanSettings({bindings:{mode:'KeyQ',recenter:'KeyX'}});assert.equal(canonicalKey('KeyX',settings),'KeyX');assert.equal(settings.bindings.mode,'KeyX');assert.equal(settings.bindings.evadeLeft,'KeyQ');
const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));g.setIndex([0,1,2,2,0,1,0,0,1,0,1,9]);assert.deepEqual(repairTileGeometry(g),{invalid:1,degenerate:1,duplicates:1,repairedUVValues:0,recomputedNormals:false});assert.equal(g.index.count,3);g.dispose();
const types=new Set();for(let i=0;i<96;i++){const w=weatherAt(Date.UTC(2026,9,29)+i*1800000);types.add(w.type);assert(w.rain>=0&&w.rain<=1);assert(w.hour>=0&&w.hour<24);}assert.equal(types.size,WEATHER_TYPES.length);assert(weatherAt(Date.UTC(2026,9,29,4)).day>.99);assert(weatherAt(Date.UTC(2026,9,29,16)).day<.01);
console.log('PASS mode/held stance, both slips and damage windows, hook/cross selection, server freshness, binding migration, tile integrity, six weather states and solar cycle');
