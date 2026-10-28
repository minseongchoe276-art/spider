// Snapshot the working app so parallel edits cannot invalidate an A/B drive.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const source=process.cwd(),destination=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'vehicle-fps-benchmark-'));
fs.mkdirSync(destination,{recursive:true});
for(const name of ['src','scripts','config','supabase'])fs.cpSync(path.join(source,name),path.join(destination,name),{recursive:true,filter:file=>!file.split(path.sep).some(part=>['node_modules','.temp','__pycache__'].includes(part))});
for(const entry of execFileSync('git',['ls-tree','-z','HEAD']).toString().split('\0')){if(!entry)continue;const [meta,name]=entry.split('\t');if(meta.split(' ')[1]==='blob'&&fs.statSync(path.join(source,name)).isFile())fs.copyFileSync(path.join(source,name),path.join(destination,name));}
for(const name of ['public','node_modules'])fs.symlinkSync(path.join(source,name),path.join(destination,name),'dir');
const probe=path.join(destination,'src/QualityDirector.js');fs.writeFileSync(probe,fs.readFileSync(probe,'utf8').replace('this.api = {','this.api = {\n      benchmarkApp:()=>app,'));
console.log(destination);
