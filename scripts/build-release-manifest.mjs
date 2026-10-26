import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {MOTIONS} from '../src/MotionCatalog.js';
import {root,filesUnder,sha256,releaseIdentity} from './lib/release-identity.mjs';

export function buildReleaseManifest(directory=path.join(root,'dist')){
 const html=fs.readFileSync(path.join(directory,'index.html'),'utf8');
 const boot=new Set([...html.matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^"?#]+)"/g)].map(m=>'/'+m[1].replace(/^(?:\.\/|\/)/,'')));
 const fallback=new Set(MOTIONS.map(m=>m.url));
 const entries=filesUnder(directory).filter(p=>!/(?:\.br|\.gz)$/.test(p)&&path.basename(p)!=='release.json').map(file=>{
  const url='/'+path.relative(directory,file).split(path.sep).join('/'),data=fs.readFileSync(file);
  const role=boot.has(url)||url==='/index.html'?'bootstrap':url.startsWith('/motions/')||/\/models\/(?:shadow-pulse-rig|appearance-\w+)\.glb$/.test(url)?'character':fallback.has(url)?'fallback':url.startsWith('/assets/')?'on-demand':'support';
  const size=suffix=>fs.existsSync(file+suffix)?fs.statSync(file+suffix).size:null;
  return {url,role,bytes:data.length,gzipBytes:size('.gz'),brotliBytes:size('.br'),sha256:sha256(data)};
 });
 const groups=Object.fromEntries(['bootstrap','character','fallback','on-demand','support'].map(role=>[role,{
  files:entries.filter(e=>e.role===role).length,bytes:entries.filter(e=>e.role===role).reduce((n,e)=>n+e.bytes,0),
  encodedBytes:entries.filter(e=>e.role===role).reduce((n,e)=>n+(e.brotliBytes??e.gzipBytes??e.bytes),0)}]));
 // Budgets are project acceptance limits, not browser capability claims.
 const limits={bootstrapEncodedBytes:600000,characterEncodedBytes:30000000,totalBytes:250000000};
 const totalBytes=entries.reduce((n,e)=>n+e.bytes,0);
 const checks={bootstrap:groups.bootstrap.encodedBytes<=limits.bootstrapEncodedBytes,character:groups.character.encodedBytes<=limits.characterEncodedBytes,total:totalBytes<=limits.totalBytes};
 const manifest={version:1,...releaseIdentity(),releaseId:sha256(JSON.stringify(entries.map(e=>[e.url,e.sha256]))),entries,groups,totalBytes,limits,checks};
 fs.writeFileSync(path.join(directory,'release.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){const m=buildReleaseManifest();console.log(JSON.stringify({releaseId:m.releaseId,groups:m.groups,checks:m.checks},null,2));if(Object.values(m.checks).some(v=>!v))process.exitCode=1;}
