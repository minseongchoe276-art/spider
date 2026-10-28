-- One owned vehicle snapshot per authenticated player. No direct client write grants.
alter table public.game_players add column if not exists vehicle_state jsonb;
alter table public.game_players add column if not exists vehicle_at bigint not null default 0;
alter table public.game_players add column if not exists vehicle_round integer not null default 0;
alter table public.game_players add column if not exists vehicle_life integer not null default 0;

create or replace function game.vehicle_rect_overlap(ax float8,az float8,ar float8,aw float8,al float8,bx float8,bz float8,br float8,bw float8,bl float8)
returns boolean language sql immutable set search_path='' as $$
 select bool_and(abs((bx-ax)*x+(bz-az)*z)<
 aw*abs(cos(ar)*x-sin(ar)*z)+al*abs(sin(ar)*x+cos(ar)*z)+
 bw*abs(cos(br)*x-sin(br)*z)+bl*abs(sin(br)*x+cos(br)*z)+.025)
 from (values(cos(ar),-sin(ar)),(sin(ar),cos(ar)),(cos(br),-sin(br)),(sin(br),cos(br))) axes(x,z);
$$;

create or replace function game.vehicle_valid(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare k text; n float8;
begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'sequence') is distinct from 'number' or
 (v->>'sequence')::numeric<>trunc((v->>'sequence')::numeric) or not((v->>'sequence')::numeric between 0 and 2147483647) then return false;end if;
 if v->>'phase'='NONE' then return true;end if;
 if not(coalesce(v->>'phase','') in ('PARKED','ENTERING','DRIVING','EXITING')) or not(coalesce(v->>'model','') in ('bmw','corvette')) then return false;end if;
 foreach k in array array['yaw','pitch','roll','speed','steering','spin','elapsed','startYaw'] loop
  if jsonb_typeof(v->k) is distinct from 'number' then return false;end if;n:=(v->>k)::float8;
  if not(n between -(case k when 'pitch' then .55 when 'roll' then .55 when 'speed' then 24.1 when 'steering' then .6 when 'spin' then 1000000 when 'elapsed' then 0 else 2*pi() end)
   and (case k when 'pitch' then .55 when 'roll' then .55 when 'speed' then 24.1 when 'steering' then .6 when 'spin' then 1000000 when 'elapsed' then 1.5 else 2*pi() end)) then return false;end if;
 end loop;
 if v->>'phase' in ('PARKED','EXITING') and abs((v->>'speed')::float8)>1.21 then return false;end if;
 foreach k in array array['position','start','exit'] loop
  if jsonb_typeof(v->k) is distinct from 'object' or jsonb_typeof(v->k->'x') is distinct from 'number' or jsonb_typeof(v->k->'y') is distinct from 'number' or jsonb_typeof(v->k->'z') is distinct from 'number' then return false;end if;
  if not((v->k->>'x')::float8 between -2500 and 2500 and (v->k->>'y')::float8 between -2500 and 2500 and (v->k->>'z')::float8 between -2500 and 2500) then return false;end if;
 end loop;
 if v?'wheelDrops' then
  if jsonb_typeof(v->'wheelDrops') is distinct from 'array' or jsonb_array_length(v->'wheelDrops')<>4 then return false;end if;
  for k in select value::text from jsonb_array_elements(v->'wheelDrops') loop if not(k::float8 between -.2 and .2) then return false;end if;end loop;
 end if;
 return true;
exception when others then return false;
end;$$;
revoke all on function game.vehicle_valid(jsonb),game.vehicle_rect_overlap(float8,float8,float8,float8,float8,float8,float8,float8,float8,float8) from public,anon,authenticated;

create or replace function public.game_move_pose(p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=(select auth.uid());p public.game_players%rowtype;r public.game_rooms%rowtype;
 result jsonb;v jsonb:=p_data->'pose'->'vehicle';old jsonb;pose jsonb:=p_data->'pose';correction jsonb;
 now_ms bigint:=game.now_ms();elapsed float8;vx float8;vy float8;vz float8;yaw float8;distance float8;limit_m float8;
 other record;solid record;start_x float8;start_z float8;start_y float8;steps integer;step integer;t float8;px float8;pz float8;py float8;
begin
 if uid is null then raise exception '로그인이 필요합니다.';end if;
 select gp.* into p from public.game_players gp where gp.user_id=uid;
 if not found then raise exception '방에 참가하지 않았습니다.';end if;
 select * into r from public.game_rooms where code=p.room_code for update;
 select * into p from public.game_players where user_id=uid for update;
 old:=case when p.vehicle_round=r.round and p.vehicle_life=p.life_epoch then p.vehicle_state else null end;
 correction:=jsonb_build_object('type','correction','x',p.x,'y',p.y,'z',p.z,'facing',p.facing,'vehicle',coalesce(old,jsonb_build_object('phase','NONE','sequence',0)));
 if r.phase<>'playing' or p.eliminated then return null;end if;
 if jsonb_typeof(pose)='object' and octet_length(pose::text)>4096 then return correction;end if;
 if v is not null and v<>'null'::jsonb then
  if not game.vehicle_valid(v) then return correction;end if;
  if pose->>'state'='DRIVING' and v->>'phase' in ('NONE','PARKED') then return correction;end if;
  -- Drop unrecognized keys instead of storing arbitrary client JSON.
  v:=case when v->>'phase'='NONE' then jsonb_build_object('phase','NONE','sequence',v->'sequence') else
   (select jsonb_object_agg(key,value) from jsonb_each(v) where key=any(array['phase','sequence','model','position','yaw','pitch','roll','speed','steering','spin','elapsed','start','startYaw','exit','wheelDrops'])) end;
  if old is not null and (v->>'sequence')::bigint<=(old->>'sequence')::bigint then return correction;end if;
  if v->>'phase'='NONE' then
   if old->>'phase' in ('ENTERING','DRIVING','EXITING') then return correction;end if;
  else
   vx:=(v->'position'->>'x')::float8;vy:=(v->'position'->>'y')::float8;vz:=(v->'position'->>'z')::float8;yaw:=(v->>'yaw')::float8;
   limit_m:=case when r.city='procedural' then 160 else 2400 end;
   if abs(vx)+2.7>limit_m or abs(vz)+2.7>limit_m or not(vy between -.1 and 1000) then return correction;end if;
   if v->>'phase'<>'PARKED' and sqrt(power(vx-(p_data->>'x')::float8,2)+power(vy-(p_data->>'y')::float8,2)+power(vz-(p_data->>'z')::float8,2))>3.5 then return correction;end if;
   if old is null or old->>'phase'='NONE' then
    if v->>'phase'<>'PARKED' or sqrt(power(vx-(p_data->>'x')::float8,2)+power(vy-(p_data->>'y')::float8,2)+power(vz-(p_data->>'z')::float8,2))>55 then return correction;end if;
   else
    distance:=sqrt(power(vx-(old->'position'->>'x')::float8,2)+power(vy-(old->'position'->>'y')::float8,2)+power(vz-(old->'position'->>'z')::float8,2));
    if old->>'phase' in ('ENTERING','DRIVING','EXITING') then
     elapsed:=least(1,greatest(.04,(now_ms-p.vehicle_at)/1000.0));
     if v->>'model'<>old->>'model' or distance>elapsed*28+.5 then return correction;end if;
    else
     if v->>'phase'<>'PARKED' and (distance>.15 or sqrt(power((old->'position'->>'x')::float8-p.x,2)+power((old->'position'->>'y')::float8-p.y,2)+power((old->'position'->>'z')::float8-p.z,2))>6) then return correction;end if;
     if v->>'phase'='PARKED' and distance>.15 and sqrt(power(vx-(p_data->>'x')::float8,2)+power(vy-(p_data->>'y')::float8,2)+power(vz-(p_data->>'z')::float8,2))>55 then return correction;end if;
    end if;
   end if;
   for other in select vehicle_state from public.game_players where room_code=p.room_code and user_id<>uid and not eliminated and vehicle_round=r.round and vehicle_life=life_epoch and vehicle_state->>'phase'<>'NONE' loop
    if abs(vy-(other.vehicle_state->'position'->>'y')::float8)<1.5 and game.vehicle_rect_overlap(vx,vz,yaw,1.33,2.35,(other.vehicle_state->'position'->>'x')::float8,(other.vehicle_state->'position'->>'z')::float8,(other.vehicle_state->>'yaw')::float8,1.33,2.35) then return correction;end if;
   end loop;
   -- Sweep the full car footprint through authoritative local-city solids.
   if r.city='procedural' then
    if old->>'phase' in ('ENTERING','DRIVING','EXITING') then start_x:=(old->'position'->>'x')::float8;start_y:=(old->'position'->>'y')::float8;start_z:=(old->'position'->>'z')::float8;else start_x:=vx;start_y:=vy;start_z:=vz;end if;
    steps:=greatest(1,ceil(sqrt(power(vx-start_x,2)+power(vz-start_z,2))/.5)::integer);
    for step in 0..steps loop
     t:=step::float8/steps;px:=start_x+(vx-start_x)*t;py:=start_y+(vy-start_y)*t;pz:=start_z+(vz-start_z)*t;
     for solid in select bounds from game.city_solids where bounds[5]>py+.35 and bounds[2]<py+1.5 and bounds[1]<px+3 and bounds[4]>px-3 and bounds[3]<pz+3 and bounds[6]>pz-3 loop
      if game.vehicle_rect_overlap(px,pz,yaw,1.33,2.35,(solid.bounds[1]+solid.bounds[4])/2,(solid.bounds[3]+solid.bounds[6])/2,0,(solid.bounds[4]-solid.bounds[1])/2,(solid.bounds[6]-solid.bounds[3])/2) then return correction;end if;
     end loop;
    end loop;
   end if;
  end if;
 elsif old->>'phase' in ('ENTERING','DRIVING','EXITING') then return correction;
 end if;
 result:=public.game_command('move',p_data);
 if result is null then return null;end if;
 if result->>'type'<>'move' then return result||jsonb_build_object('vehicle',old);end if;
 update public.game_players set vehicle_state=v,vehicle_at=now_ms,vehicle_round=r.round,vehicle_life=life_epoch where user_id=uid;
 if jsonb_typeof(pose)='object' and pose->>'state' in ('IDLE','RUNNING','SPRINTING','JUMPING','FALLING','SWINGING','WEB_ZIP','WALL_RUNNING','MANTLING','LANDING','ROLLING','TURNING','DRIVING') then
  pose:=jsonb_set(pose,'{vehicle}',coalesce(v,'null'::jsonb));
  perform realtime.send(jsonb_build_object('type','pose','id',uid,'pose',pose),'pose','game:'||p.room_code,true);
 end if;
 return result||jsonb_build_object('vehicle',v);
exception when invalid_text_representation or numeric_value_out_of_range then return correction;
end;$$;
revoke all on function public.game_move_pose(jsonb) from public,anon;
grant execute on function public.game_move_pose(jsonb) to authenticated;

-- Reconnects and late join/heartbeat snapshots retain the owned car; previous
-- rounds and previous lives never resurrect a stale driving animation.
create or replace function game.state(p_code text)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('type','room',
 'room',jsonb_build_object('code',r.code,'name',r.name,'mode',r.mode,'city',r.city,'count',(select count(*) from public.game_players where room_code=r.code),'capacity',r.capacity,'phase',r.phase,'enhanced',r.enhanced),
 'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.name,'ready',p.ready,'team',p.team,'health',p.health,'eliminated',p.eliminated,'seen',p.seen,'x',p.x,'y',p.y,'z',p.z,'facing',p.facing,'progress',p.progress,'connected',p.last_seen>clock_timestamp()-interval '30 seconds','vehicle',case when r.phase='playing' and p.vehicle_round=r.round and p.vehicle_life=p.life_epoch then p.vehicle_state else null end) order by p.user_id) from public.game_players p where p.room_code=r.code),'[]'::jsonb),
 'host',r.host,'endsAt',nullif(r.ends_at,0),'vulnerableAt',nullif(r.vulnerable_at,0),'serverNow',game.now_ms(),'winner',r.winner,'arena',r.arena,'round',r.round,'pulseUntil',r.pulse_until)
 from public.game_rooms r where r.code=p_code;
$$;

-- Keep the existing command body/permissions and all prior combat rules;
-- only add a guard against shooting/punching from a driving pose.
do $guard$
declare body text;needle text:=E'if p_action=\'attack\' then';
begin
 body:=pg_get_functiondef('public.game_command(text,jsonb)'::regprocedure);
 if position('vehicle attack guard' in body)=0 then
  if position(needle in body)=0 then raise exception 'Attack guard insertion point missing';end if;
  execute replace(body,needle,needle||E'\n    -- vehicle attack guard\n    if v_player.vehicle_round=v_room.round and v_player.vehicle_life=v_player.life_epoch and v_player.vehicle_state->>\'phase\' in (\'ENTERING\',\'DRIVING\',\'EXITING\') then return null;end if;');
 end if;
end;$guard$;
