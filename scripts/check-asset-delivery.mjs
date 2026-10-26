import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync,brotliDecompressSync} from 'node:zlib';
import {assetEncoding} from './asset-encoding.mjs';
import {compressAssets} from './compress-assets.mjs';
assert.equal(assetEncoding(undefined),'identity');assert.equal(assetEncoding('br, gzip'),'br');
assert.equal(assetEncoding('br;q=0,gzip'),'gzip');assert.equal(assetEncoding('gzip;q=.5,identity;q=0'),'gzip');
assert.equal(assetEncoding('*;q=0'),null);assert.equal(assetEncoding('br;q=oops,gzip;q=0'),'identity');
assert.equal(assetEncoding('br',['identity']),'identity');assert.equal(assetEncoding('br;q=0,identity;q=0',['br','identity']),null);
const folder=await mkdtemp(join(tmpdir(),'shadow-assets-'));
try{
 const data=Buffer.from('const repeatableAsset = "SHADOW PULSE";\n'.repeat(200)),path=join(folder,'asset.js');
 await writeFile(path,data);await writeFile(join(folder,'tiny.json'),'{}');
 const result=await compressAssets(folder);assert.equal(result.files,1);assert(result.brotliBytes<data.length*.2);assert(result.gzipBytes<data.length*.2);
 assert.deepEqual(gunzipSync(await readFile(path+'.gz')),data);assert.deepEqual(brotliDecompressSync(await readFile(path+'.br')),data);
 console.log('PASS asset delivery: encoding preferences, refusal, fallback, byte-exact Brotli/gzip and bounded static compression');
}finally{await rm(folder,{recursive:true,force:true});}

if(process.argv.includes('--http')){
 const {spawn}=await import('node:child_process');const {request}=await import('node:http');
 const child=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'0'},stdio:['ignore','pipe','pipe']});
 try{
  const base=await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(Error('HTTP server startup timed out')),12000);
   child.once('error',e=>{clearTimeout(timeout);reject(e);});child.once('exit',code=>{clearTimeout(timeout);reject(Error(`HTTP server exited ${code}`));});
   child.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});
  });
  const html=await readFile('dist/index.html','utf8'),asset=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1],original=await readFile('dist'+asset);
  const get=(path,encoding,method='GET')=>new Promise((resolve,reject)=>{const req=request(base+path,{method,headers:{'accept-encoding':encoding}},res=>{const parts=[];res.on('data',c=>parts.push(c));res.on('end',()=>resolve({code:res.statusCode,headers:res.headers,body:Buffer.concat(parts)}));});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('HTTP request timed out')));req.end();});
  const cases=[];
  for(const [accept,encoding]of [['br, gzip','br'],['gzip','gzip'],['br;q=0,gzip;q=0','identity']]){
   const r=await get(asset,accept);assert.equal(r.code,200);assert.equal(r.headers['content-encoding']||'identity',encoding);assert.equal(r.headers.vary,'Accept-Encoding');
   const decoded=encoding==='br'?brotliDecompressSync(r.body):encoding==='gzip'?gunzipSync(r.body):r.body;assert.deepEqual(decoded,original);
   const head=await get(asset,accept,'HEAD');assert.equal(head.body.length,0);assert.equal(head.headers['content-length'],String(r.body.length));
   cases.push({encoding,originalBytes:original.length,transferredBytes:r.body.length,byteExact:true,headMatches:true});
  }
  assert.equal((await get(asset,'*;q=0')).code,406);assert.equal((await get('/missing-qa-asset.js','br')).code,404);assert.equal((await get('/.env','br')).code,403);
  const binaryCases=[];
  for(const [path,type]of [['/models/shadow-pulse-rig.glb','model/gltf-binary'],['/models/Idle.fbx','application/octet-stream']]){
   const original=await readFile('dist'+path);
   for(const [accept,decode]of [['br',brotliDecompressSync],['gzip',gunzipSync]]){
    const r=await get(path,accept);assert.equal(r.code,200);assert.equal(r.headers['content-encoding'],accept);assert.equal(r.headers['content-type'],type);
    assert.deepEqual(decode(r.body),original);binaryCases.push({path,encoding:accept,originalBytes:original.length,transferredBytes:r.body.length,byteExact:true});
   }
  }
  const {mkdir}=await import('node:fs/promises');await mkdir('docs/qa/player-completion-2026-10-25',{recursive:true});
  await writeFile('docs/qa/player-completion-2026-10-25/http-delivery.json',JSON.stringify({status:'PASS',cases,binaryCases,refusal406:true,missing404:true,hiddenFile403:true},null,2)+'\n');
  console.log('PASS real HTTP: Brotli/gzip/identity decode identically, HEAD sizes match, refusal/404/hidden-file protection');
 }finally{child.kill('SIGTERM');}
}
