import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const url='https://zzencpfytpdbjmqvtquc.supabase.co',key='sb_publishable_RmGBXvDq4fk7ZJdL295uzw_5SBwGyCS';
const clients=[],results=[];let code;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rpc(client,action,data={}){const {data:result,error}=await client.rpc('game_command',{p_action:action,p_data:{code,...data}});if(error)throw error;return result;}
async function state(client){const {data,error}=await client.rpc('game_state',{p_code:code});if(error)throw error;return data;}
async function invoke(client,facing,position){
 let running=true;const keepAlive=(async()=>{while(running){await rpc(client,'move',{...position,facing});await sleep(120);}})();
 try{const t=performance.now();const {data,error}=await client.functions.invoke('hong-kong-attack',{body:{code,kind:'punch',facing,from:{x:999,y:999,z:999},clear:true}});if(error){let body;try{body=await error.context?.json();}catch{}throw Error('Edge request failed: '+JSON.stringify(body||{message:error.message}));}return {data,ms:performance.now()-t};}finally{running=false;await keepAlive;}}
try{
 for(let i=0;i<2;i++){const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const {error}=await client.auth.signInAnonymously();if(error)throw error;clients.push(client);}
 const opened=await rpc(clients[0],'create',{name:'서버 피격 판정 검수',city:'hong-kong',mode:'tag',capacity:2,enhanced:true});code=opened.room.code;await rpc(clients[1],'join',{city:'hong-kong'});
 for(const client of clients)await rpc(client,'ready',{ready:true,terrainReady:true,spawn:{x:0,y:18,z:0},roofs:[{x:70,y:18,z:0},{x:-70,y:18,z:0}]});
 const started=await rpc(clients[0],'start');const identities=await Promise.all(clients.map(async c=>(await c.auth.getUser()).data.user.id));const policeIndex=identities.indexOf(started.players.find(p=>p.team==='police').id),runnerIndex=1-policeIndex,cop=clients[policeIndex],runner=clients[runnerIndex],runnerId=identities[runnerIndex];
 await sleep(Math.max(0,started.vulnerableAt-Date.now()+50));
 const move=async(c,p,facing)=>{const r=await rpc(c,'move',{...p,facing});assert.equal(r?.type,'move',JSON.stringify(r));};
 const blockedFrom={x:11.997259613504008,y:12.954967295603236,z:9.49292698412102},blockedTo={x:12.89044527246819,y:12.958305340883367,z:8.165445068585282};
 const facing=Math.atan2(blockedTo.x-blockedFrom.x,blockedTo.z-blockedFrom.z);
 await move(cop,blockedFrom,facing);await move(runner,blockedTo,0);
 const blocked=await invoke(cop,facing,blockedFrom);assert.equal(blocked.data?.status,'BLOCKED',JSON.stringify(blocked));assert.equal((await state(runner)).players.find(p=>p.id===runnerId).health,100);results.push({name:'Actual official wall blocks damage, even with client clear:true and forged from coordinates',status:'PASS',...blocked});
 await sleep(600);await move(cop,{x:0,y:18,z:0},0);await move(runner,{x:0,y:18,z:2},0);
 const clear=await invoke(cop,0,{x:0,y:18,z:0});assert.equal(clear.data?.type,'hit',JSON.stringify(clear));assert.equal(clear.data.health,75);assert.equal((await state(runner)).players.find(p=>p.id===runnerId).health,75);results.push({name:'Server-only clear-path damage succeeds without any defender acknowledgement',status:'PASS',ms:clear.ms,health:75});
 await rpc(runner,'hit-confirm',{hitId:'00000000-0000-0000-0000-000000000000',clear:false});await rpc(runner,'hit-confirm',{hitId:'00000000-0000-0000-0000-000000000000',clear:true});assert.equal((await state(runner)).players.find(p=>p.id===runnerId).health,75);
 const denied=await runner.rpc('game_resolve_terrain_hit',{p_hit_id:'00000000-0000-0000-0000-000000000000',p_status:'CLEAR',p_version:'a'.repeat(64)});assert(denied.error&&/permission denied/i.test(denied.error.message));results.push({name:'Defender false/true claims do not change HP; client access to finalizer is denied',status:'PASS'});
 const unauthorized=await fetch(url+'/functions/v1/hong-kong-attack',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"facing":0}'});assert.equal(unauthorized.status,401);results.push({name:'Unauthenticated endpoint access is denied before any game operation',status:'PASS'});
 console.log(JSON.stringify({status:'PASS',checked_at:new Date().toISOString(),project:'spider',results,scope:'Real Supabase guest JWTs, actual deployed Edge runtime, official map, authenticated RPC and persisted HP. Only fresh test participants were attacked.'},null,2));
}finally{for(const client of clients){try{await rpc(client,'leave');}catch{}try{await client.auth.signOut();}catch{}}}
