import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { attachRooms,ROOM_FEATURES } from './rooms.mjs';
import {assetEncoding} from './asset-encoding.mjs';
import {releaseIdentity} from './lib/release-identity.mjs';

process.env.GAME_ADMIN_TOKEN ||= 'alalal1010';

// Production assets and an allowlisted, read-only Hong Kong tile proxy.
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const identity=releaseIdentity();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm',
  '.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.fbx':'application/octet-stream'};
const server=createServer(async(req,res)=>{
  const fail=(code,message)=>{if(!res.headersSent){res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'});res.end(message);}else res.destroy();};
  if(!['GET','HEAD'].includes(req.method)) {res.setHeader('Allow','GET, HEAD');return fail(405,'Method not allowed');}
  let path;
  try {path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{return fail(400,'Invalid URL');}
  if(path==='/healthz'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ready',protocol:2,features:ROOM_FEATURES,...identity}));return;
  }
  if(path.startsWith('/urban-tiles/')) {
    const upstreamPath=path.slice('/urban-tiles'.length);
    if(!upstreamPath.startsWith('/api/3d-data/') || upstreamPath.includes('..')) return fail(403,'Tile path denied');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    res.on('close',()=>controller.abort());
    try {
      const response=await fetch(new URL(upstreamPath,'https://data.map.gov.hk'),{method:req.method,signal:controller.signal});
      res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/octet-stream',
        'X-Content-Type-Options':'nosniff','Cache-Control':response.ok?(upstreamPath.endsWith('.json')?'public, max-age=300':'public, max-age=86400'):'no-store'});
      if(req.method==='HEAD'||!response.body) res.end();
      else await pipeline(Readable.fromWeb(response.body),res);
    } catch {fail(502,'City data unavailable. Retry or choose the local city.');}
    finally {clearTimeout(timer);}
    return;
  }
  const target=resolve(root, '.'+(path==='/'?'/index.html':path));
  if(!target.startsWith(root.endsWith(sep)?root:root+sep)||path.split('/').some(part=>part.startsWith('.'))) return fail(403,'Path denied');
  try {
    const info=await stat(target);if(!info.isFile())return fail(404,'Not found');
    const representations=new Map([['identity',{path:target,size:info.size}]]);
    if(/\.(?:js|css|json|svg|wasm|glb|fbx)$/i.test(target))for(const [encoding,suffix]of [['br','.br'],['gzip','.gz']]){
      try{const compressed=await stat(target+suffix);if(compressed.isFile()&&compressed.mtimeMs>=info.mtimeMs)representations.set(encoding,{path:target+suffix,size:compressed.size});}catch{}
    }
    const encoding=assetEncoding(req.headers['accept-encoding'],['br','gzip','identity'].filter(name=>representations.has(name)));
    if(!encoding)return fail(406,'No acceptable asset encoding');
    const selected=representations.get(encoding);res.setHeader('Vary','Accept-Encoding');
    if(encoding!=='identity')res.setHeader('Content-Encoding',encoding);
    res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Content-Length':selected.size,
      'X-Content-Type-Options':'nosniff','Cache-Control':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});
    if(req.method==='HEAD')res.end();else await pipeline(createReadStream(selected.path),res);
  } catch {fail(404,'Not found');}
});
attachRooms(server);
server.listen(Number(process.env.PORT||4173),process.env.HOST||'127.0.0.1',()=>console.log(`Game server: http://${process.env.HOST||'127.0.0.1'}:${server.address().port}`));
