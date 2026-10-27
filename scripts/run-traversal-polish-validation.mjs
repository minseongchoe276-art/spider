import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const folder='docs/qa/traversal-polish-2026-10-26';
const suites=['all-motions','full-appearance-motions','motion-adversarial','motion-combinations','motion-cleanup','expanded-terrain-motion','web-hand-pose','web-continuity','motion-reset','traversal-handoffs'];
const files=['index.html','package.json','public/images/ability-atlas-v2.jpg',...fs.readdirSync('src').filter(n=>/\.(js|css)$/.test(n)).map(n=>'src/'+n)];
const fingerprint=()=>Object.fromEntries(files.map(path=>[path,crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
const before=fingerprint(),results=[];let next=0;
async function worker(){while(next<suites.length){
 const suite=suites[next++],start=Date.now(),output=fs.openSync(`${folder}/delivered-${suite}.log`,'w');
 const code=await new Promise(resolve=>{const child=spawn(process.execPath,[`scripts/check-${suite}.mjs`],{stdio:['ignore',output,output]});child.on('close',resolve);child.on('error',()=>resolve(-1));});
 fs.closeSync(output);results.push({suite,pass:code===0,exitCode:code,seconds:(Date.now()-start)/1000});
 fs.writeFileSync(folder+'/delivered-validation.json',JSON.stringify({completed:results.length,total:suites.length,results},null,2));console.log(code===0?'PASS':'FAIL',suite);
}}
await Promise.all([worker(),worker(),worker()]);
const after=fingerprint(),changed=files.filter(path=>before[path]!==after[path]);
fs.writeFileSync(folder+'/delivered-source-integrity.json',JSON.stringify({stable:changed.length===0,changed,fingerprints:after},null,2));
if(changed.length||results.some(r=>!r.pass))process.exitCode=1;
