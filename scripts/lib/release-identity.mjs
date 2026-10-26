import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const root=path.resolve(import.meta.dirname,'../..');
export const sha256=data=>createHash('sha256').update(data).digest('hex');
export function filesUnder(folder){
 if(!fs.existsSync(folder))return [];
 return fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?filesUnder(path.join(folder,e.name)):[path.join(folder,e.name)]);
}
export function fingerprint(files){
 return sha256([...new Set(files)].sort().map(file=>`${path.relative(root,file).split(path.sep).join('/')}\0${sha256(fs.readFileSync(file))}`).join('\n'));
}
function dependencies(file,seen=new Set()){
 if(seen.has(file))return seen;seen.add(file);
 const code=fs.readFileSync(file,'utf8');
 for(const match of code.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)){
  const target=path.resolve(path.dirname(file),match[1]);if(fs.existsSync(target)&&fs.statSync(target).isFile())dependencies(target,seen);
 }
 return seen;
}
export function releaseIdentity(){
 const source=[...filesUnder(path.join(root,'src')),...filesUnder(path.join(root,'scripts')),
  ...filesUnder(path.join(root,'config')),
  ...filesUnder(path.join(root,'supabase/functions')),...filesUnder(path.join(root,'supabase/migrations')),
  ...['package.json','package-lock.json','index.html','vite.config.js','vite.itch.config.js'].map(p=>path.join(root,p))];
 const backend=[...dependencies(path.join(root,'scripts/room-server.mjs')),
  ...dependencies(path.join(root,'scripts/serve.mjs')),...['package.json','package-lock.json'].map(p=>path.join(root,p))];
 let revision=null;try{revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
 const assets=filesUnder(path.join(root,'public'));
 return {sourceId:fingerprint([...source,...assets]),codeId:fingerprint(source),assetId:fingerprint(assets),backendId:fingerprint(backend),databaseId:fingerprint(filesUnder(path.join(root,'supabase/migrations'))),revision};
}
