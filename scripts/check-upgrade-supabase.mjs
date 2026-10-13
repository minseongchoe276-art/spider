import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {proceduralCollision} from './city-collision.mjs';
const source=fs.readFileSync('src/SupabaseRooms.js','utf8');const url=process.env.SUPABASE_URL||source.match(/https:\/\/[a-z]+\.supabase\.co/)[0],key=process.env.SUPABASE_PUBLISHABLE_KEY||source.match(/sb_publishable_[A-Za-z0-9_-]+/)[0];
const clients=[0,1].map(()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}));
const cmd=async(c,action,data={})=>{const {data:result,error}=await c.rpc('game_command',{p_action:action,p_data:data});if(error)throw error;return result;};
let code;
try{for(const c of clients){const{error}=await c.auth.signInAnonymously();if(error)throw error;}
 const [a,b]=clients;const room=await cmd(a,'create',{name:'upgrade integration test',mode:'tag',city:'procedural',capacity:2,enhanced:true});code=room.room.code;await cmd(b,'join',{code,city:'procedural'});
 await assert.rejects(()=>cmd(a,'ready',{code,ready:true,terrainReady:false}));
 const city=proceduralCollision(),s=city.getRooftopSpawn(95),roofs=city.rooftopSpawns.filter(p=>p.distanceTo(s)>25&&p.distanceTo(s)<275).slice(0,12).map(p=>({x:p.x,y:p.y,z:p.z}));
 await cmd(a,'ready',{code,ready:true,terrainReady:true,spawn:{x:s.x,y:s.y,z:s.z},roofs});await cmd(b,'ready',{code,ready:true,terrainReady:true});
 const started=await cmd(a,'start',{code});assert(started.room.enhanced);assert.equal(started.arena.radius,300);assert(started.endsAt-started.serverNow<=180000);assert.equal(started.arena.points.length,roofs.length);
 const id=(await a.auth.getSession()).data.session.user.id;const spawn={x:s.x,y:s.y,z:s.z,facing:0,code};await cmd(a,'move',spawn);
 await new Promise(r=>setTimeout(r,70));const correction=await cmd(a,'move',{...spawn,x:s.x+1000});assert.equal(correction.type,'correction');
 const resumed=await a.rpc('game_resume');assert.equal(resumed.data.players.find(p=>p.id===id).seen,true);
 const denied=await a.from('game_rooms').select('*');assert(denied.error||!denied.data?.length,'Direct room access exposed');
 console.log('PASS live Supabase: authenticated enhanced room, readiness rejection, valid arena, 2-player duration, boundary correction, resume state, direct table access denied');
}finally{for(const c of clients){if(code)await cmd(c,'leave',{code}).catch(()=>{});c.realtime.disconnect();await c.auth.signOut().catch(()=>{});}}
