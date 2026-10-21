import fs from 'node:fs';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import {MOTIONS} from '../src/MotionCatalog.js';
import {AIR_TRICKS} from '../src/AirTricks.js';

const suites=[
 'third-person-only','motions','pose','controller','gameplay','air-tricks',
 'dual-web','pendulum','physics-invariants','mechanics-audit','traversal','qa','review-2',
 'combat','combat-rig','motion-timeline','motion-transitions','remote-motion',
 'swing-accessibility','cross-system-regressions','web-continuity','expert-audit',
 'camera-motion-web','full-game-audit','input-lifecycle','wall-ledge','wall-ledge-rig',
 'all-motions','motion-sources','web-hand-pose','silk-gait','wall-crawl','natural-wall-motion','end-joint-stability','limb-continuity','turn-joint-stability','motion-cleanup',
 'combat-traversal','combat-aim','combat-quality','combat-feet','moving-combat-skin','appearances','full-appearance-motions','motion-expression',
 'impact-body','drop-motion','human-mode','wall-cross-crawl',
];
const folder=process.env.MOTION_AUDIT_DIR || 'docs/qa/complete-motion-2026-10-19';fs.mkdirSync(folder,{recursive:true});
const model=fs.readFileSync('public/models/shadow-pulse-rig.glb');
const modelJson=JSON.parse(model.subarray(20,20+model.readUInt32LE(12)));
const manifest={date:process.env.MOTION_AUDIT_DATE || '2026-10-19',motions:MOTIONS.map(({key,url,loop})=>({key,source:url,loop:!!loop})),
 embedded:modelJson.animations?.length?['default']:[],airTricks:Object.keys(AIR_TRICKS),appearances:['web','combat'],cameraModes:['close','follow','swing'],
 frameRates:[24,30,60,144],suiteCount:suites.length,
 limits:'Finite, explicitly enumerated automated matrix plus visual contact-sheet review. Passing does not prove all possible inputs, terrain or subjective artistic perfection.'};
fs.writeFileSync(folder+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
const tracked=[...fs.readdirSync('src').filter(n=>n.endsWith('.js')).map(n=>'src/'+n),
 ...fs.readdirSync('public/motions').filter(n=>n.endsWith('.json')).map(n=>'public/motions/'+n),
 'public/models/shadow-pulse-rig.glb','public/models/appearance-web.glb','public/models/appearance-combat.glb'];
const fingerprint=()=>Object.fromEntries(tracked.map(path=>[path,crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
const sourceBefore=fingerprint();
const results=[];let next=0;
async function worker(){while(next<suites.length){
 const suite=suites[next++],start=Date.now(),output=fs.openSync(`${folder}/${suite}.log`,'w');
 const code=await new Promise(resolve=>{const child=spawn(process.execPath,[`scripts/check-${suite}.mjs`],{stdio:['ignore',output,output]});child.on('error',error=>{fs.writeSync(output,String(error));resolve(-1);});child.on('close',resolve);});
 fs.closeSync(output);const result={suite,pass:code===0,exitCode:code,seconds:(Date.now()-start)/1000};results.push(result);
 fs.writeFileSync(folder+'/suite-results.json',JSON.stringify({completed:results.length,total:suites.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results},null,2)+'\n');
 console.log(`${result.pass?'PASS':'FAIL'} ${suite} (${result.seconds.toFixed(1)}s)`);
}}
const workers=Math.max(1,Math.min(4,Number(process.env.MOTION_AUDIT_WORKERS)||2));
await Promise.all(Array.from({length:workers},()=>worker()));
const sourceAfter=fingerprint(),changed=tracked.filter(path=>sourceBefore[path]!==sourceAfter[path]);
fs.writeFileSync(folder+'/source-integrity.json',JSON.stringify({stable:changed.length===0,changed,fingerprints:sourceAfter},null,2)+'\n');
const failed=results.filter(r=>!r.pass);console.log(`COMPLETE: ${results.length-failed.length}/${suites.length} suites passed; source ${changed.length?'CHANGED':'stable'}`);if(failed.length || changed.length)process.exitCode=1;
