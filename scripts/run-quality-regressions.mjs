import fs from 'node:fs';
import {spawn} from 'node:child_process';
const folder='docs/qa/quality-upgrade-2026-10-28/regressions';fs.mkdirSync(folder,{recursive:true});
const pkg=JSON.parse(fs.readFileSync('package.json'));
const commands=pkg.scripts.test.split(' && '),start=commands.findIndex(c=>c.includes('check-multiplayer.mjs'));
const results=[];
for(const cmd of commands.slice(start)){
 const name=cmd.split(' ').at(-1).split('/').at(-1),file=fs.openSync(`${folder}/${name}.log`,'w');
 console.log('RUN',name);
 const code=await new Promise(resolve=>{const child=spawn(process.execPath,cmd.split(' ').slice(1),{stdio:['ignore',file,file],env:{...process.env,ONLINE_QA_DIR:folder}});child.on('exit',resolve);child.on('error',e=>{console.error(e);resolve(-1);});});fs.closeSync(file);
 results.push({name,code,pass:code===0});console.log(code===0?'PASS':'FAIL',name);
 fs.writeFileSync(`${folder}/results.json`,JSON.stringify(results,null,2));
}
if(results.some(r=>!r.pass))process.exitCode=1;
