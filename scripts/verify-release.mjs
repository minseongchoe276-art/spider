import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {sha256,releaseIdentity} from './lib/release-identity.mjs';

export async function verifyRelease({site,room,manifest=JSON.parse(fs.readFileSync('dist/release.json')),all=false}){
 const checks=[],check=(name,pass,detail)=>checks.push({name,status:pass?'PASS':'FAIL',detail});
 const get=async url=>{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);return r;};
 const identity=releaseIdentity();check('Local source matches the built artifact',manifest.sourceId===identity.sourceId);
 check('Build asset budgets pass',Object.values(manifest.checks||{}).length>0&&Object.values(manifest.checks).every(v=>v===true));
 try{
  const remote=await (await get(new URL('/release.json',site))).json();
  check('Published release manifest matches the expected build',remote.releaseId===manifest.releaseId&&remote.sourceId===manifest.sourceId);
  const entries=manifest.entries.filter(e=>all||e.role==='bootstrap');
  for(const entry of entries){try{const bytes=await (await get(new URL(entry.url,site))).arrayBuffer();check(`Bytes ${entry.url}`,sha256(Buffer.from(bytes))===entry.sha256);}catch(e){check(`Bytes ${entry.url}`,false,e.message);}}
 }catch(e){check('Published artifact is identifiable',false,e.message);}
 try{const health=await (await get(new URL('/healthz',room))).json();
  check('Room service is ready',health.status==='ready');check('Room authority matches the expected backend',health.backendId===manifest.backendId,{expected:manifest.backendId,observed:health.backendId??null});
  check('Room service expects the same database migrations',health.databaseId===manifest.databaseId);
 }catch(e){check('Room service health',false,e.message);}
 return {status:checks.every(c=>c.status==='PASS')?'PASS':'FAIL',checkedAt:new Date().toISOString(),sourceId:manifest.sourceId,releaseId:manifest.releaseId,
  byteScope:all?'all published uncompressed entries':'bootstrap entries only',databaseScope:'Expected migration source fingerprint; not proof of applied operating DB state',checks};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const args=process.argv.slice(2),site=args[0],room=args[1];if(!site||!room)throw Error('Usage: node scripts/verify-release.mjs SITE_URL ROOM_URL [--all]');
 const report=await verifyRelease({site,room,all:args.includes('--all')});console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
}
