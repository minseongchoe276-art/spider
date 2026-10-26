import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {attachRooms,ROOM_FEATURES} from './rooms.mjs';
import {HongKongTerrain} from '../supabase/functions/_shared/hong-kong-terrain.js';
import {releaseIdentity} from './lib/release-identity.mjs';

process.env.GAME_ADMIN_TOKEN ||= 'alalal1010';

// Independent authoritative game service. No Supabase secret is needed:
// room membership, movement budget, roles and damage belong to this server.
export function createRoomServer({terrain=new HongKongTerrain(),origins=['https://minogame.site'],prewarm=true}={}){
 let stopping=false,warm=false,warmStatus='loading';const started=Date.now(),identity=releaseIdentity();
 const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path!=='/healthz'){res.writeHead(404);res.end('Not found');return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  const data=JSON.stringify({status:stopping?'stopping':'ready',transport:'websocket',authority:'server-owned-rooms',protocol:2,features:ROOM_FEATURES,...identity,revision:process.env.RENDER_GIT_COMMIT||identity.revision,uptimeSeconds:Math.floor((Date.now()-started)/1000),terrainSeedWarm:warm,terrainSeedStatus:warmStatus});
  res.writeHead(stopping?503:200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
 });
 server.maxConnections=256;
 // Browser callers must come from the configured frontend. Non-browser clients
 // can connect to the public anonymous game protocol without an Origin header.
 const api=attachRooms(server,{terrain});
 const upgrades=server.listeners('upgrade');server.removeAllListeners('upgrade');
 server.on('upgrade',(req,socket,head)=>{
  if(stopping||(req.headers.origin&&!origins.includes(req.headers.origin))){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  if(new URL(req.url,'http://localhost').pathname!=='/ws'){socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');return;}
  for(const upgrade of upgrades)upgrade(req,socket,head);
 });
 const warmup=prewarm?terrain.visibility({x:0,y:18,z:0},{x:0,y:18,z:2}).then(result=>{warm=result.status!=='UNKNOWN';warmStatus=result.status;return result;}):Promise.resolve(null);
 const close=async()=>{
  if(stopping)return;stopping=true;
  const forced=setTimeout(()=>{for(const client of api.wss.clients)client.terminate();},5000);forced.unref();
  for(const client of api.wss.clients)client.close(1012,'Game server restarting');
  await Promise.all([new Promise(r=>api.wss.close(r)),new Promise(r=>server.close(r))]);clearTimeout(forced);
 };
 return {server,api,terrain,warmup,close};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const port=Number(process.env.PORT||4180);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
 const origins=(process.env.GAME_ALLOWED_ORIGINS||'https://minogame.site').split(',').map(s=>s.trim()).filter(Boolean);
 if(!origins.length||origins.some(s=>{try{const u=new URL(s);return !['http:','https:'].includes(u.protocol)||u.origin!==s;}catch{return true;}}))throw Error('GAME_ALLOWED_ORIGINS must contain exact HTTP(S) origins');
 const service=createRoomServer({origins});
 service.server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Room authority listening on port ${port}`));
 service.warmup.then(result=>console.log(`Official terrain seed: ${result.status}`)).catch(()=>console.error('Official terrain warmup unavailable'));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>service.close().then(()=>process.exit(0)));
}
