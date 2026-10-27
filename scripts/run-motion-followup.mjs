import fs from 'node:fs';
import {spawn} from 'node:child_process';
const folder='docs/qa/system-motion-2026-10-27/final-checks';fs.mkdirSync(folder,{recursive:true});
const suites=['controller','physics-invariants','motions','combat-rig','combat-quality','stance-combat','low-stance','low-stance-online','strike-steering','combat-jump-and-web-speed','web-shot-body'];
const results=[];let next=0;
async function worker(){while(next<suites.length){const suite=suites[next++],start=Date.now(),out=fs.openSync(`${folder}/${suite}.log`,'w');const exitCode=await new Promise(resolve=>{const child=spawn(process.execPath,[`scripts/check-${suite}.mjs`],{stdio:['ignore',out,out]});child.on('error',()=>resolve(-1));child.on('close',resolve);});fs.closeSync(out);const result={suite,startedAt:new Date(start).toISOString(),exitCode,pass:exitCode===0,seconds:(Date.now()-start)/1000};results.push(result);fs.writeFileSync(folder+'/results.json',JSON.stringify({completed:results.length,total:suites.length,results},null,2)+'\n');console.log(`${result.pass?'PASS':'FAIL'} ${suite} ${result.seconds.toFixed(1)}s`);}}
await Promise.all([worker(),worker()]);if(results.some(r=>!r.pass))process.exitCode=1;
