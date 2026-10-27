import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {MOTIONS} from '../src/MotionCatalog.js';
import {BINDINGS,cleanSettings} from '../src/PlayerSettings.js';
const folder='docs/qa/mode-controls-2026-10-27';
const read=p=>fs.readFileSync(p,'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=execFileSync('rg',['--files','--hidden','-g','!.git','-g','!node_modules','-g','!docs/qa/mode-controls-2026-10-27/before','-g','*.fbx','-g','*.glb','-g','*.gltf','-g','*.bvh'],{encoding:'utf8'}).trim().split('\n');
const assets=files.filter(Boolean).map(file=>({file,bytes:fs.statSync(file).size,sha256:sha(file),runtimeSource:MOTIONS.some(m=>'public'+m.url===file)}));
const allCoverage=JSON.parse(read('docs/qa/all-motions-2026-10-15/coverage.json'));
const sourceCoverage=JSON.parse(read('docs/qa/all-motions-2026-10-15/source-coverage.json'));
const archivedCoverage=JSON.parse(read(folder+'/archived-sources/source-coverage.json'));
for(const asset of assets){
 const source=[...sourceCoverage.results,...archivedCoverage.results].filter(r=>assets.find(a=>a.file===r.file)?.sha256===asset.sha256);
 if(source.length){asset.animationAuditStatus=source.some(r=>r.status==='FAIL')?'FAIL':source.every(r=>['EMPTY','NOT_APPLICABLE'].includes(r.status))?'NOT_APPLICABLE':'PASS';}
 else if(asset.file.endsWith('.glb')){const data=fs.readFileSync(asset.file),g=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)));asset.animationAuditStatus=g.animations?.length?'UNVERIFIED':'NOT_APPLICABLE';}
 else asset.animationAuditStatus='UNVERIFIED';
}
const manualRetired=new Set(['airTrick','backTrick','special','slam','slamLand','rightHook','hook','jumpDown','jumpDownVariant','fallVariant','fallIdle','injuredIdle']);
const motions=MOTIONS.map(m=>{
 const c=JSON.parse(read('public/motions/'+m.key+'.json'));
 const intervals=c.tracks.flatMap(t=>t.times.slice(1).map((v,i)=>v-t.times[i])).filter(n=>n>1e-6);
 const samples=allCoverage.filter(r=>r.key===m.key);
 return {key:m.key,source:m.url,take:m.take??null,duration:c.duration,loop:!!m.loop,
  minSamplingInterval:Math.min(...intervals),tracks:c.tracks.length,
  bones:[...new Set(c.tracks.map(t=>t.name.split('.')[0]))],
  rootMotion:c.userData?.rootMotion??null,
  dispatch:['src/Character.js: update','src/RemoteMotion.js: capturePose / RemoteMotion.update'],
  runtimeRole:manualRetired.has(m.key)?'preserved-review-fallback-or-legacy-network':'active-local-gameplay',
  networkSynchronization:'Existing capturePose animation key/phase and combat action; protocol unchanged',
  trigger:({jab:'Combat left click grounded',cross:'Combat right click grounded',heavy:'Combat E grounded; retained heavy packet key for compatibility',guard:'Combat F held grounded',swing:'Web left/right held with valid anchor',zip:'Web E airborne with valid target',wall:'Web F + movement at wall'})[m.key]??(manualRetired.has(m.key)?'Preserved authoring / review or legacy network clip; no dedicated live shortcut':'Automatic locomotion / recovery / reaction; unchanged'),
  exit:'Character state or CombatSystem action duration; no changes to physical position / damage windows',
  automaticStatus:samples.length===4?'PASS':'UNVERIFIED',sampledFps:samples.map(r=>r.fps),
  visualStatus:['combatIdle','heavy','jab','cross','guard','swing','zip','wall','jump','land'].includes(m.key)?'LIMITED_BROWSER_REVIEW':'UNVERIFIED',
 };
});
fs.writeFileSync(folder+'/inventory.json',JSON.stringify({assets,uniqueAssetContents:new Set(assets.map(a=>a.sha256)).size,motions,sourceCoverage,archivedCoverage},null,2));
// Compare the actual old/new held-input methods without involving a renderer.
const baseline=read(folder+'/before/src/main.js'),current=read('src/main.js');
function method(source){const body=source.match(/  syncHeldInput\(\) \{([\s\S]*?)\n  \}/)[1];return new Function(body);}
const oldSync=method(baseline),newSync=method(current);
const state=()=>({heldKeys:new Set(['KeyW','KeyF']),gamepadHeldKeys:new Set(),touchHeldKeys:new Set(),input:{},preferences:{values:{settings:cleanSettings()}},combat:{mode:'combat'}});
const bench=fn=>{const g=state(),runs=[];for(let warm=0;warm<20000;warm++)fn.call(g);for(let k=0;k<7;k++){const begin=performance.now();for(let i=0;i<100000;i++)fn.call(g);runs.push((performance.now()-begin)*1000/100000);}return runs.sort((a,b)=>a-b)[3];};
const performanceReport={method:'median of 7 × 100,000 held-input updates after warmup',beforeMicroseconds:bench(oldSync),afterMicroseconds:bench(newSync),limitation:'CPU microbenchmark only; real device FPS / GPU / eight rendered players remain unverified.'};
fs.writeFileSync(folder+'/performance.json',JSON.stringify(performanceReport,null,2));
const changed=fs.readdirSync(folder+'/before/src').filter(n=>n!== 'locales' && fs.statSync(folder+'/before/src/'+n).isFile()).map(n=>'src/'+n).filter(f=>sha(f)!==sha(folder+'/before/'+f));
const fingerprints=Object.fromEntries([...changed,'index.html','src/locales/en.js','src/MotionCatalog.js','src/Character.js','src/CharacterPose.js','src/SwingPhysics.js','src/MotionRetarget.js'].map(f=>[f,sha(f)]));
fs.writeFileSync(folder+'/final-source-hashes.json',JSON.stringify(fingerprints,null,2));
console.log(JSON.stringify({registered:motions.length,automaticallyPassed:motions.filter(m=>m.automaticStatus==='PASS').length,sourceFiles:sourceCoverage.files+archivedCoverage.files,sourceTakes:sourceCoverage.animatedTakes+archivedCoverage.animatedTakes,inventoryPaths:assets.length,changed,performanceReport},null,2));
