import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {HongKongTerrain} from '../_shared/hong-kong-terrain.js';
const terrain=new HongKongTerrain({timeoutMs:8000,maxBytes:32*1024*1024});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const authorization=req.headers.get('authorization')||'';if(!/^Bearer .+/i.test(authorization))return reply({error:'Authentication required'},401);
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!;
  const client=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  // Verified by Supabase Auth, never by decoding user-provided claims.
  const {data:{user},error:authError}=await client.auth.getUser(authorization.slice(7));if(authError||!user)return reply({error:'Invalid session'},401);
  const reader=req.body?.getReader();if(!reader)return reply({error:'Missing request'},400);
  const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return reply({error:'Request too large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const request=JSON.parse(new TextDecoder().decode(bytes));if(!request||!Number.isFinite(request.facing))return reply({error:'Invalid attack'},400);
  const {data:pending,error}=await client.rpc('game_command',{p_action:'attack',p_data:{kind:request.kind==='web'?'web':'punch',facing:request.facing,code:request.code}});
  if(error)return reply({error:error.message},400);
  if(pending?.type!=='terrain-check')return reply(pending);
  // Both endpoints and the one-time claim come only from locked database rows.
  const decision=await terrain.visibility(pending.from,pending.to);
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:result,error:resolutionError}=await admin.rpc('game_resolve_terrain_hit',{p_hit_id:pending.hitId,p_status:decision.status,p_version:decision.version||null});
  if(resolutionError)return reply({error:'Damage resolution unavailable'},503);
  return reply(result);
 }catch(error){console.error('Hong Kong attack failed',error instanceof Error?error.message:'Unknown error');return reply({error:'Terrain verification unavailable'},503);}
});
