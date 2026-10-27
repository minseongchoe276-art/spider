import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const folder='docs/qa/mode-controls-2026-10-27';
fs.mkdirSync(folder,{recursive:true});
const tracked=['index.html',...fs.readdirSync('src').filter(n=>n.endsWith('.js')||n.endsWith('.css')).map(n=>'src/'+n),'src/locales/en.js'];
const hash=()=>Object.fromEntries(tracked.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const before=hash(),results=[];
for(const name of ['input-lifecycle','expanded-input-camera','expert-audit','touch-controls','session-flow','modal-lifecycle','cross-system-regressions','traversal-handoffs','upgrade','mode-rig','loading-performance']){
 const start=Date.now(),result=spawnSync(process.execPath,['scripts/check-'+name+'.mjs'],{encoding:'utf8'});
 fs.writeFileSync(folder+'/final-'+name+'.log',(result.stdout||'')+(result.stderr||''));
 results.push({suite:name,pass:result.status===0,exitCode:result.status,seconds:(Date.now()-start)/1000});
 console.log(`${result.status===0?'PASS':'FAIL'} ${name}`);
}
const after=hash(),changed=tracked.filter(p=>before[p]!==after[p]);
const output={date:'2026-10-27',passed:results.filter(r=>r.pass).length,total:results.length,results,sourceStable:!changed.length,changed,sourceHashes:after};
fs.writeFileSync(folder+'/final-validation.json',JSON.stringify(output,null,2));
if(changed.length||results.some(r=>!r.pass))process.exitCode=1;
