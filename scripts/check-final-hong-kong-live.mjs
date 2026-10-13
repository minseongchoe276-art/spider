import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const source=fs.readFileSync('src/SupabaseRooms.js','utf8');
const url=source.match(/https:\/\/[a-z]+\.supabase\.co/)[0],key=source.match(/sb_publishable_[A-Za-z0-9_-]+/)[0];
const clients=Array.from({length:2},()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cmd=async(c,action,data={})=>{const {data:result,error}=await c.rpc('game_command',{p_action:action,p_data:data});if(error)throw error;return result;};
let code;
try{
 for(const client of clients){const {error}=await client.auth.signInAnonymously();if(error)throw error;}
 const created=await cmd(clients[0],'create',{name:'final HK authority smoke',city:'hong-kong',mode:'tag',capacity:2,enhanced:true});code=created.room.code;
 await cmd(clients[1],'join',{code,city:'hong-kong'});
 for(const client of clients)await cmd(client,'ready',{code,ready:true,terrainReady:true,spawn:{x:0,y:18,z:0},roofs:[{x:70,y:18,z:0},{x:-70,y:18,z:0}]});
 const state=await cmd(clients[0],'start',{code});
 const users=await Promise.all(clients.map(c=>c.auth.getUser()));
 const cop=clients[users.findIndex(u=>u.data.user.id===state.players.find(p=>p.team==='police').id)];
 const victim=clients.find(c=>c!==cop),victimId=(await victim.auth.getUser()).data.user.id;
 await wait(Math.max(0,state.vulnerableAt-state.serverNow)+150);
 const move=async(from,to)=>{await cmd(cop,'move',{code,...from,facing:Math.atan2(to.x-from.x,to.z-from.z)});await cmd(victim,'move',{code,...to,facing:0});await wait(80);};
 const health=async()=>{const {data,error}=await victim.rpc('game_resume');if(error)throw error;return data.players.find(p=>p.id===victimId).health;};
 const edge=async(from,to)=>{
  const facing=Math.atan2(to.x-from.x,to.z-from.z);let running=true;
  // Match the game's continuous accepted movement protocol during the request.
  const movement=(async()=>{while(running){await cmd(cop,'move',{code,...from,facing});await wait(120);}})();
  try{const started=performance.now();const {data,error}=await cop.functions.invoke('hong-kong-attack',{body:{code,kind:'punch',facing}});if(error)throw error;assert(!data?.error,JSON.stringify(data));return {...data,responseMs:performance.now()-started};}
  finally{running=false;await movement;}
 };
 const from={x:0,y:18,z:0},to={x:0,y:18,z:2};
 await move(from,to);
 await cmd(victim,'hit-confirm',{code,hitId:'00000000-0000-0000-0000-000000000000',clear:false});
 const hit=await edge(from,to);assert.equal(hit?.type,'hit',JSON.stringify(hit));assert.equal(hit.health,75);assert.equal(await health(),75);
 await wait(650);
 const wallFrom={x:11.997259613504008,y:12.954967295603236,z:9.49292698412102};
 const wallTo={x:12.89044527246819,y:12.958305340883367,z:8.165445068585282};
 await move(wallFrom,wallTo);
 await cmd(victim,'hit-confirm',{code,hitId:'00000000-0000-0000-0000-000000000000',clear:true});
 const blocked=await edge(wallFrom,wallTo);assert.equal(blocked?.status,'BLOCKED');assert.equal(await health(),75);
 const denied=await victim.rpc('game_resolve_terrain_hit',{p_hit_id:'00000000-0000-0000-0000-000000000000',p_status:'CLEAR',p_version:'a'.repeat(64)});assert(denied.error,'Client could call trusted resolver');
 console.log(JSON.stringify({status:'PASS',checked_at:new Date().toISOString(),scope:'Two isolated real guest sessions in a temporary operating Hong Kong match; real Auth, Edge runtime, official map and database damage.',clearHealth:hit.health,clearResponseMs:hit.responseMs,blockedResponseMs:blocked.responseMs,throughWallHealth:await health(),defenderClaimsIgnored:true,clientResolverDenied:true},null,2));
}finally{
 for(const client of clients){if(code)await cmd(client,'leave',{code}).catch(()=>{});client.realtime.disconnect();await client.auth.signOut().catch(()=>{});}
}
