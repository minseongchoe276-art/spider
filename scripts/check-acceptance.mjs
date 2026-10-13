import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const root='docs/qa/acceptance-2026-10-13';fs.mkdirSync(root,{recursive:true});
function sourceSnapshot(){
  const walk=base=>fs.readdirSync(base,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${base}/${entry.name}`):[`${base}/${entry.name}`]);
  const files=['src','scripts','supabase/migrations','supabase/functions','public/motions','public/models'].filter(base=>fs.existsSync(base)).flatMap(walk);
  files.push('package.json','package-lock.json','index.html','vite.config.js');
  return Object.fromEntries(files.sort().map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
}
const initialSource=sourceSnapshot();
const steps=[
  {name:'Complete gameplay and motion suite',command:'npm',args:['test'],log:'tests.log'},
  {name:'Actual PostgreSQL roles, transactions and multiple connections',command:process.execPath,args:['scripts/check-postgres-rules.mjs'],log:'postgres.log'},
  {name:'Trusted terrain contract (isolated fixture only)',command:process.execPath,args:['scripts/check-trusted-terrain.mjs'],log:'trusted-terrain.log'},
  {name:'Official Hong Kong geometry: actual wall, clear path and cache',command:process.execPath,args:['scripts/check-hong-kong-terrain.mjs'],log:'hong-kong-terrain.log'},
  {name:'Hong Kong damage authority: PostgreSQL roles, replay and delayed lifecycle',command:process.execPath,args:['scripts/check-hong-kong-db-authority.mjs'],log:'hong-kong-authority.log'},
  {name:'Hong Kong transport: slow attack does not block leaving or affect a later session',command:process.execPath,args:['scripts/check-hong-kong-transport.mjs'],log:'hong-kong-transport.log'},
  {name:'Production build',command:'npm',args:['run','build'],log:'build.log'},
  {name:'Independent Hong Kong competitive damage authority',command:process.execPath,args:['scripts/diagnose-release-security.mjs'],log:'security-final.log'},
];
const results=[];
for(const step of steps){
  console.log('Checking: '+step.name);
  const output=fs.createWriteStream(`${root}/${step.log}`);
  const code=await new Promise(resolve=>{
    const child=spawn(step.command,step.args,{stdio:['ignore','pipe','pipe']});
    child.stdout.pipe(output,{end:false});child.stderr.pipe(output,{end:false});
    child.once('error',error=>{output.write(String(error));resolve(1);});
    child.once('close',code=>resolve(code??1));
  });
  await new Promise(resolve=>output.end(resolve));
  const result={name:step.name,status:code===0?'PASS':'FAIL',exit_code:code,log:step.log};results.push(result);
  console.log(result.status+': '+step.name);
}
let operating;
try{operating=JSON.parse(fs.readFileSync(`${root}/operating-verification.json`));}catch{}
const postgres=JSON.parse(fs.readFileSync(`${root}/postgres-results.json`));
const expected=postgres.command_md5;
const evidenceAge=Date.now()-Date.parse(operating?.checked_at||'');
results.push({name:'Operating Supabase function matches tested movement/rescue rules',
  status:operating?.command_md5===expected&&operating?.resolver_md5===postgres.resolver_md5&&operating?.defender_clear_flag===false&&operating?.resolver_service_only===true&&operating?.private_permissions_preserved&&evidenceAge>=0&&evidenceAge<1800000?'PASS':'BLOCKED',
  expected_command_md5:expected,observed_command_md5:operating?.command_md5||null});
const readEvidence=path=>{try{return JSON.parse(fs.readFileSync(path));}catch{return null;}};
const fresh=e=>{const age=Date.now()-Date.parse(e?.checked_at||'');return age>=0&&age<1800000;};
const live=readEvidence('docs/qa/hong-kong-authority-2026-10-13/operating-live.json');
results.push({name:'Operating Auth, official map, Edge and persisted HP pass with two real guest sessions',
  status:fresh(live)&&live.status==='PASS'&&live.results?.length===4&&live.results.every(r=>r.status==='PASS')&&live.results[0].data?.status==='BLOCKED'&&live.results[1].health===75?'PASS':'BLOCKED',
  evidence:'../hong-kong-authority-2026-10-13/operating-live.json'});
const edge=readEvidence('docs/qa/hong-kong-authority-2026-10-13/deployed-edge.json');
const requiredEdgeFiles=['hong-kong-attack/index.ts','_shared/hong-kong-terrain.js','hong-kong-attack/deno.json'];
const edgeMatches=fresh(edge)&&edge.status==='PASS'&&requiredEdgeFiles.every(file=>{
  const proof=edge.files?.find(row=>row.file===file),path=`supabase/functions/${file}`;
  return proof?.matches===true&&fs.existsSync(path)&&proof.remote_sha256===createHash('sha256').update(fs.readFileSync(path)).digest('hex');
});
results.push({name:'All deployed Hong Kong worker files match the tested local source',status:edgeMatches?'PASS':'BLOCKED',
  evidence:'../hong-kong-authority-2026-10-13/deployed-edge.json'});
const source=sourceSnapshot();
results.push({name:'Source and motion/model assets stayed unchanged throughout verification',
  status:JSON.stringify(initialSource)===JSON.stringify(source)?'PASS':'FAIL'});
const passed=results.every(result=>result.status==='PASS');
fs.writeFileSync(`${root}/execution.json`,JSON.stringify({prompt:'PROMPT.md',
  status:passed?'PASS':'FAIL',scope:'Defined desktop support and complete required gates; not a guarantee of all future situations.',
  results,source},null,2)+'\n');
console.log(passed?'PASS: All required acceptance gates':'FAIL: Required gates remain; no perfection/acceptance claim is permitted.');
if(!passed)process.exitCode=1;
