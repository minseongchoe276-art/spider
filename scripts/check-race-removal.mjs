import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {Preferences} from '../src/Preferences.js';
import {Progression} from '../src/Progression.js';
import {BINDINGS,cleanSettings} from '../src/PlayerSettings.js';
const retired=/TimeTrial|RaceGhost|타임트라이얼|레이스|btn-(?:menu-)?time-trial|trial-status/;
for(const file of [...readdirSync('src').filter(f=>/\.(js|css)$/.test(f)).map(f=>`src/${f}`),'index.html'])
  assert(!retired.test(readFileSync(file,'utf8')),`${file} still contains a race feature`);
assert(!existsSync('src/TimeTrial.js')&&!existsSync('src/RaceGhost.js'));
assert(!Object.hasOwn(BINDINGS,'trial'));assert(!Object.hasOwn(cleanSettings({ghost:true,bindings:{trial:'KeyR'}}),'ghost'));
const values=new Map([
 ['spiderman-preferences-v1',JSON.stringify({muted:true,quality:'low',bestTimes:{'procedural-v5-12345678':12},settings:{sensitivity:1.4,ghost:true}})],
 ['web-runner-progress-v1',JSON.stringify({score:2000,bestCombo:100,ghosts:{old:{}},medals:{old:'gold'},distance:140,safe:{'hong-kong':[2,20,3]},theme:'cyan',discoveries:['hong-kong:0:0']})],
]);
const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
const prefs=new Preferences(storage),progress=new Progression(storage);
assert.equal(prefs.values.muted,true);assert.equal(prefs.values.quality,'low');assert.equal(prefs.values.settings.sensitivity,1.4);
assert(!Object.hasOwn(prefs.values,'bestTimes'));assert.equal(prefs.recordTime,undefined);
assert.deepEqual(progress.data.safe['hong-kong'],[2,20,3]);assert.equal(progress.data.theme,'cyan');assert.equal(progress.color,0x72f1ff);
assert.equal(progress.data.distance,140);assert.equal(progress.unlocked.length,3);assert.equal(progress.recordGhost,undefined);
assert(prefs.save());assert(progress.save());
for(const [key,json] of values){const saved=JSON.parse(json);for(const field of ['bestTimes','score','bestCombo','ghosts','medals'])assert(!Object.hasOwn(saved,field),`${key} kept ${field}`);}
for(const storage of [{getItem(){throw Error('denied');}}, {getItem:()=>'{broken'}]){
  assert.doesNotThrow(()=>new Preferences(storage));assert.doesNotThrow(()=>new Progression(storage));
}
assert.equal(new Preferences({setItem(){throw Error('quota');}}).save(),false);
console.log('PASS: no race modules/UI/bindings; old records removed while settings, saved positions and web colors survive; corrupt/unavailable storage remains safe');
