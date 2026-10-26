import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const folder=process.env.RELEASE_QUALITY_DIR||'docs/qa/player-completion-2026-10-25';fs.mkdirSync(folder,{recursive:true});
const manifest=JSON.parse(fs.readFileSync('package.json','utf8'));
// Animation source assets are unchanged in this review. Avoid rewriting an
// existing artist's motion output merely to validate gameplay changes.
const commands=manifest.scripts.test.split(' && ').filter(c=>c!=='node scripts/build-motions.mjs');
const results=[];
for(const command of commands){
 const args=command.split(' ');if(args.shift()!=='node'||args.length!==1||!/^scripts\/[\w-]+\.mjs$/.test(args[0]))throw Error('Unexpected test command');
 const start=performance.now(),r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});
 const name=args[0].split('/').pop(),output=(r.stdout||'')+(r.stderr||'')+(r.error?'\n'+r.error.message:'');
 fs.writeFileSync(`${folder}/${name}.log`,output);
 results.push({name,status:r.status===0?'PASS':'FAIL',milliseconds:Math.round(performance.now()-start)});
 console.log(`${r.status===0?'PASS':'FAIL'} ${name} (${results.at(-1).milliseconds}ms)`);
 if(r.status!==0)console.log(output.slice(-2500));
 fs.writeFileSync(`${folder}/suite.json`,JSON.stringify({animationAssetsRegenerated:false,total:commands.length,finished:results.length,passed:results.filter(x=>x.status==='PASS').length,results},null,2)+'\n');
}
if(results.some(x=>x.status!=='PASS'))process.exitCode=1;
