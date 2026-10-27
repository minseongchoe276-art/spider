import fs from 'node:fs';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
const dir='docs/qa/steady-punches-2026-10-27';fs.mkdirSync(dir,{recursive:true});
const replay=process.argv.includes('--replay');
const suites=[['steady-punches'],['strike-steering'],['combat-quality'],['combat-traversal'],['motion-combinations'],['moving-actions'],['moving-action-input'],['online-motion-sync'],['end-joint-stability','--keys=jab,cross'],['motion-cleanup'],['all-motions'],['input-lifecycle'],['moving-actions-skin']];
if(replay)suites.splice(0,suites.length,...[['steady-punches'],['strike-steering'],['motion-combinations'],['moving-action-input'],['online-motion-sync'],['input-lifecycle']]);
const final=process.argv.includes('--final');
if(final)suites.splice(0,suites.length,...[['steady-punches'],['motion-combinations'],['input-lifecycle']]);
const prefix=final?'final-':replay?'replay-':'';
const files=['src/Character.js','src/CharacterPose.js','src/MotionRetarget.js','src/MixamoMotion.js','src/MotionCatalog.js','src/SwingPhysics.js','src/Combat.js','public/motions/jab.json','public/motions/cross.json','public/motions/manifest.json'];
const hash=()=>Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const before=hash(),results=[];let next=0;
async function worker(){while(next<suites.length){const [suite,...args]=suites[next++],start=Date.now(),file=fs.openSync(dir+'/'+prefix+suite+'.log','w');const code=await new Promise(resolve=>{const child=spawn(process.execPath,['scripts/check-'+suite+'.mjs',...args],{stdio:['ignore',file,file],env:{...process.env,ONLINE_QA_DIR:dir+'/online',JOINT_AUDIT_DIR:dir+'/joints'}});child.on('close',resolve);child.on('error',()=>resolve(-1));});fs.closeSync(file);results.push({suite,pass:code===0,code,seconds:(Date.now()-start)/1000});fs.writeFileSync(dir+'/'+prefix+'validation.json',JSON.stringify({completed:results.length,total:suites.length,results},null,2));console.log(`${code===0?'PASS':'FAIL'} ${suite}`);}}
await Promise.all([worker(),worker()]);const after=hash(),changed=files.filter(p=>before[p]!==after[p]);fs.writeFileSync(dir+'/'+prefix+'validation.json',JSON.stringify({completed:results.length,total:suites.length,passed:results.filter(r=>r.pass).length,results,sourceStable:!changed.length,changed,sourceHashes:after},null,2));
if(changed.length||results.some(r=>!r.pass))process.exitCode=1;
