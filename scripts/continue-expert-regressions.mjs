import fs from 'node:fs';
import {spawn} from 'node:child_process';

// Continue the recorded audit without repeating expensive completed rig tests.
// Each check runs in its own process and writes its own named log.
const folder='docs/qa/expert-game-audit-2026-10-30/regressions';
const previous=JSON.parse(fs.readFileSync(`${folder}/${fs.existsSync(`${folder}/final-suite.json`)?'final-suite.json':'suite.json'}`,'utf8'));
const manifest=JSON.parse(fs.readFileSync('package.json','utf8'));
const commands=manifest.scripts.test.split(' && ').filter(command=>!command.includes('build-motions.mjs'));
const results=new Map(previous.results.map(result=>[result.name,result]));
const pending=commands.filter(command=>results.get(command.split('/').at(-1))?.status!=='PASS');
let cursor=0;
function save(){
  const ordered=commands.map(command=>results.get(command.split('/').at(-1))).filter(Boolean);
  fs.writeFileSync(`${folder}/final-suite.json`,JSON.stringify({total:commands.length,finished:ordered.length,passed:ordered.filter(result=>result.status==='PASS').length,concurrency:3,initialRun:'suite.json',results:ordered},null,2));
}
async function worker(){
  while(cursor<pending.length){
    const command=pending[cursor++],args=command.split(' ');args.shift();
    if(args.length!==1||!/^scripts\/[\w-]+\.mjs$/.test(args[0]))throw Error('Unexpected test command');
    const name=args[0].split('/').at(-1),started=performance.now(),file=fs.openSync(`${folder}/${name}.recheck.log`,'w');
    const status=await new Promise(resolve=>{
      const child=spawn(process.execPath,args,{stdio:['ignore',file,file]});
      const timer=setTimeout(()=>child.kill('SIGTERM'),600000);
      child.on('error',()=>{clearTimeout(timer);resolve(-1);});
      child.on('exit',code=>{clearTimeout(timer);resolve(code);});
    });
    fs.closeSync(file);results.set(name,{name,status:status===0?'PASS':'FAIL',milliseconds:Math.round(performance.now()-started),log:`${name}.recheck.log`});
    console.log(status===0?'PASS':'FAIL',name);save();
  }
}
await Promise.all([worker(),worker(),worker()]);save();
if([...results.values()].some(result=>result.status!=='PASS'))process.exitCode=1;
