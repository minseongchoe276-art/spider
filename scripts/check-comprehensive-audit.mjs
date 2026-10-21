import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

// Explicit allowlist: live production account/room tests are separate gates.
// Continue after failures so one broken motion cannot hide the other systems.
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const suites=[...new Set([
  ...[...pkg.scripts.test.matchAll(/node scripts\/(check-[\w-]+\.mjs)/g)].map(match=>match[1]),
  ...['third-person-only','touch-controls','display-mode','physics-invariants','reticle-only',
    'appearances','moving-combat-skin','full-appearance-motions','remote-appearance',
    'modal-lifecycle','audit-edge-cases','mantle-balcony','room-entry','city-authority','postgres-rules',
    'trusted-terrain','hong-kong-terrain','hong-kong-db-authority','hong-kong-transport',
    'room-server','motion-expression','online-guard','online-motion-sync','online-stance',
    'mode-selection','expanded-input-camera','expanded-terrain-motion','expanded-gait-stability','wall-cross-crawl'].map(name=>`check-${name}.mjs`),
])];
const folder=process.env.COMPREHENSIVE_AUDIT_DIR||'docs/qa/comprehensive-2026-10-19';fs.mkdirSync(folder,{recursive:true});
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${dir}/${entry.name}`):[`${dir}/${entry.name}`]);
const snapshot=()=>Object.fromEntries(['src','scripts','public/models','public/motions','supabase/functions','supabase/migrations'].flatMap(walk).concat(['package.json','package-lock.json','index.html','vite.config.js']).sort().map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
const before=snapshot(),results=[];let next=0,status='RUNNING',changed=[];
function save(){fs.writeFileSync(`${folder}/results.json`,JSON.stringify({checkedAt:new Date().toISOString(),status,sourceChanged:changed,total:suites.length,completed:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status!=='PASS').length,results},null,2)+'\n');}
async function worker(){while(next<suites.length){
  const suite=suites[next++],start=Date.now(),fd=fs.openSync(`${folder}/${suite}.log`,'w');
  const outcome=await new Promise(resolve=>{
    const child=spawn(process.execPath,[`scripts/${suite}`],{stdio:['ignore',fd,fd]});
    let timedOut=false;
    // Dense 144 FPS skin/contact matrices can take several minutes on a busy
    // workstation. A timeout is a failed gate, never a reason to skip cases.
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},900000);
    child.once('error',error=>{clearTimeout(timer);resolve({code:-1,error:String(error)});});
    child.once('close',code=>{clearTimeout(timer);resolve({code,timedOut});});
  });
  fs.closeSync(fd);results.push({suite,status:outcome.code===0?'PASS':'FAIL',...outcome,seconds:(Date.now()-start)/1000});save();
  console.log(`${outcome.code===0?'PASS':'FAIL'} ${suite} (${((Date.now()-start)/1000).toFixed(1)}s)`);
}}
const workers=Math.max(1,Math.min(4,Number(process.env.COMPREHENSIVE_AUDIT_WORKERS)||2));
await Promise.all(Array.from({length:workers},()=>worker()));
const after=snapshot();changed=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(path=>before[path]!==after[path]);
status=results.some(r=>r.status!=='PASS')||changed.length?'FAIL':'PASS';save();
fs.writeFileSync(`${folder}/source-snapshot.json`,JSON.stringify({before,after,changed},null,2)+'\n');
console.log(`COMPLETE ${results.filter(r=>r.status==='PASS').length}/${suites.length}; source changes during run: ${changed.length}`);
if(results.some(r=>r.status!=='PASS')||changed.length)process.exitCode=1;
