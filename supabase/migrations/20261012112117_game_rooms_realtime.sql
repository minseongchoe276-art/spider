-- Multiplayer state is owned by Postgres. Clients can only use the commands
-- below; direct table access is blocked by RLS.
create table public.game_rooms (
  code text primary key check (code ~ '^[0-9A-F]{6}$'),
  name text not null,
  mode text not null check (mode in ('tag', 'free')),
  city text not null check (city in ('procedural', 'hong-kong')),
  capacity integer not null check (capacity between 2 and 8),
  phase text not null default 'waiting' check (phase in ('waiting', 'playing', 'finished')),
  host uuid not null,
  ends_at bigint not null default 0,
  vulnerable_at bigint not null default 0,
  winner text,
  created_at timestamptz not null default now()
);

create table public.game_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  room_code text not null references public.game_rooms(code) on delete cascade,
  name text not null,
  ready boolean not null default false,
  team text,
  health integer not null default 100,
  eliminated boolean not null default false,
  seen boolean not null default false,
  x double precision not null default 0,
  y double precision not null default 0,
  z double precision not null default 0,
  facing double precision not null default 0,
  last_move_ms bigint not null default 0,
  punch_ms bigint not null default 0,
  web_ms bigint not null default 0,
  last_seen timestamptz not null default now()
);

create index game_players_room_code_idx on public.game_players(room_code);
create index game_players_last_seen_idx on public.game_players(last_seen);
alter table public.game_rooms enable row level security;
alter table public.game_players enable row level security;
revoke all on public.game_rooms, public.game_players from anon, authenticated;

create schema if not exists game;
revoke all on schema game from public, anon, authenticated;

create or replace function game.now_ms() returns bigint
language sql volatile set search_path = ''
as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function game.state(p_code text) returns jsonb
language sql volatile security definer set search_path = ''
as $$
  select jsonb_build_object(
    'type','room',
    'room',jsonb_build_object('code',r.code,'name',r.name,'mode',r.mode,'city',r.city,
      'count',(select count(*) from public.game_players where room_code=r.code),
      'capacity',r.capacity,'phase',r.phase),
    'players',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.user_id,'name',p.name,'ready',p.ready,'team',p.team,'health',p.health,
      'eliminated',p.eliminated,'seen',p.seen,'x',p.x,'y',p.y,'z',p.z,'facing',p.facing)
      order by p.user_id) from public.game_players p where p.room_code=r.code),'[]'::jsonb),
    'host',r.host,'endsAt',nullif(r.ends_at,0),'vulnerableAt',nullif(r.vulnerable_at,0),
    'serverNow',game.now_ms(),'winner',r.winner)
  from public.game_rooms r where r.code=p_code;
$$;

create or replace function game.publish(p_code text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_state jsonb;
begin
  v_state := game.state(p_code);
  if v_state is not null then
    perform realtime.send(v_state, 'state', 'game:' || p_code, true);
  end if;
end;
$$;

-- Lazy expiry handles closed tabs and expired matches without an always-on server.
create or replace function game.cleanup() returns void
language plpgsql security definer set search_path = ''
as $$
declare r record; v_host uuid; v_now bigint := game.now_ms();
begin
  delete from public.game_players where last_seen < clock_timestamp() - interval '120 seconds';
  delete from public.game_rooms r where not exists
    (select 1 from public.game_players p where p.room_code=r.code);
  for r in select * from public.game_rooms loop
    if not exists(select 1 from public.game_players p where p.user_id=r.host and p.room_code=r.code) then
      select p.user_id into v_host from public.game_players p where p.room_code=r.code order by p.user_id limit 1;
      update public.game_rooms set host=v_host where code=r.code;
      perform game.publish(r.code);
    end if;
    if r.phase='playing' and r.mode='tag' and v_now >= r.ends_at then
      update public.game_rooms set phase='finished', winner='runner', ends_at=0 where code=r.code;
      update public.game_players set ready=false where room_code=r.code;
      perform game.publish(r.code);
    end if;
  end loop;
end;
$$;

create or replace function public.game_list() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다.'; end if;
  perform game.cleanup();
  select coalesce(jsonb_agg(jsonb_build_object('code',r.code,'name',r.name,'mode',r.mode,
    'city',r.city,'count',(select count(*) from public.game_players p where p.room_code=r.code),
    'capacity',r.capacity,'phase',r.phase) order by r.created_at desc),'[]'::jsonb)
  into v_result from public.game_rooms r where r.phase='waiting';
  return v_result;
end;
$$;

create or replace function public.game_state(p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists(select 1 from public.game_players where user_id=(select auth.uid()) and room_code=p_code)
    then raise exception '이 방에 참가하지 않았습니다.'; end if;
  perform game.cleanup();
  return game.state(p_code);
end;
$$;

create or replace function public.game_command(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text := upper(trim(coalesce(p_data->>'code','')));
  v_room public.game_rooms%rowtype;
  v_player public.game_players%rowtype;
  v_target public.game_players%rowtype;
  v_count integer;
  v_now bigint := game.now_ms();
  v_x double precision; v_y double precision; v_z double precision; v_facing double precision;
  v_kind text; v_reach double precision; v_vertical double precision; v_cone double precision;
  v_cooldown integer; v_damage integer;
  v_result jsonb;
begin
  if v_user is null then raise exception '로그인이 필요합니다.'; end if;
  perform game.cleanup();

  if p_action='create' then
    v_count := coalesce((p_data->>'capacity')::integer,0);
    if v_count not between 2 and 8 then raise exception '정원은 2~8명입니다.'; end if;
    if exists(select 1 from public.game_players where user_id=v_user) then
      raise exception '먼저 현재 방에서 나가세요.';
    end if;
    loop
      v_code := upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 6));
      exit when not exists(select 1 from public.game_rooms where code=v_code);
    end loop;
    insert into public.game_rooms(code,name,mode,city,capacity,host)
      values(v_code, left(coalesce(nullif(trim(p_data->>'name'),''),'새 방'),24),
        case when p_data->>'mode'='tag' then 'tag' else 'free' end,
        case when p_data->>'city'='hong-kong' then 'hong-kong' else 'procedural' end,
        v_count,v_user);
    insert into public.game_players(user_id,room_code,name)
      values(v_user,v_code,left(coalesce(nullif(trim(p_data->>'playerName'),''),'플레이어'),16));
    return game.state(v_code);
  end if;

  if p_action='join' then
    select * into v_room from public.game_rooms where code=v_code for update;
    if not found or v_room.phase<>'waiting' then raise exception '참가 가능한 방이 없습니다.'; end if;
    if v_room.city<>p_data->>'city' then
      return jsonb_build_object('type','switch-city','city',v_room.city,'code',v_code);
    end if;
    select count(*) into v_count from public.game_players where room_code=v_code;
    if v_count>=v_room.capacity then raise exception '방이 가득 찼습니다.'; end if;
    if exists(select 1 from public.game_players where user_id=v_user) then
      raise exception '먼저 현재 방에서 나가세요.';
    end if;
    insert into public.game_players(user_id,room_code,name)
      values(v_user,v_code,left(coalesce(nullif(trim(p_data->>'playerName'),''),'플레이어'),16));
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  select * into v_player from public.game_players where user_id=v_user for update;
  if not found then raise exception '방에 참가하지 않았습니다.'; end if;
  v_code := v_player.room_code;
  select * into v_room from public.game_rooms where code=v_code for update;
  update public.game_players set last_seen=clock_timestamp() where user_id=v_user;

  if p_action='leave' then
    delete from public.game_players where user_id=v_user;
    select count(*) into v_count from public.game_players where room_code=v_code;
    if v_count=0 then delete from public.game_rooms where code=v_code;
    else
      if v_room.host=v_user then
        update public.game_rooms set host=(select user_id from public.game_players where room_code=v_code order by user_id limit 1) where code=v_code;
      end if;
      if v_room.phase='playing' and v_room.mode='tag' then
        if not exists(select 1 from public.game_players where room_code=v_code and team='runner' and not eliminated) then
          update public.game_rooms set phase='finished',winner='police',ends_at=0 where code=v_code;
        elsif not exists(select 1 from public.game_players where room_code=v_code and team='police' and not eliminated) then
          update public.game_rooms set phase='finished',winner='runner',ends_at=0 where code=v_code;
        end if;
      end if;
      perform game.publish(v_code);
    end if;
    return jsonb_build_object('type','left');
  end if;

  if p_action='heartbeat' then return game.state(v_code); end if;

  if p_action='ready' and v_room.phase='waiting' then
    update public.game_players set ready=coalesce((p_data->>'ready')::boolean,false) where user_id=v_user;
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  if p_action='start' then
    if v_room.host<>v_user or v_room.phase<>'waiting' then raise exception '방장만 시작할 수 있습니다.'; end if;
    if (select count(*) from public.game_players where room_code=v_code)<2 then raise exception '최소 2명이 모여야 시작할 수 있습니다.'; end if;
    if exists(select 1 from public.game_players where room_code=v_code and not ready) then raise exception '모든 플레이어가 준비해야 합니다.'; end if;
    update public.game_rooms set phase='playing',winner=null,
      ends_at=case when mode='tag' then v_now+300000 else 0 end,
      vulnerable_at=case when mode='tag' then v_now+8000 else 0 end where code=v_code;
    with shuffled as (select user_id,row_number() over(order by random()) as rank,
      count(*) over() as total from public.game_players where room_code=v_code)
    update public.game_players p set
      team=case when v_room.mode='free' then 'free'
        when s.rank<=case when s.total>=7 then 2 else 1 end then 'police' else 'runner' end,
      health=100,eliminated=false,seen=false,x=0,y=0,z=0,facing=0,last_move_ms=0,punch_ms=0,web_ms=0
    from shuffled s where p.user_id=s.user_id;
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  if p_action='rematch' then
    if v_room.host<>v_user or v_room.phase<>'finished' then raise exception '방장만 다시 시작할 수 있습니다.'; end if;
    update public.game_rooms set phase='waiting',winner=null,ends_at=0,vulnerable_at=0 where code=v_code;
    update public.game_players set ready=false,eliminated=false,health=100,team=null where room_code=v_code;
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  if v_room.phase<>'playing' or v_player.eliminated then return null; end if;

  if p_action='move' then
    v_x := (p_data->>'x')::double precision; v_y := (p_data->>'y')::double precision;
    v_z := (p_data->>'z')::double precision; v_facing := (p_data->>'facing')::double precision;
    if v_x is null or v_y is null or v_z is null or v_facing is null
      or not (v_x between -2500 and 2500) or not (v_z between -2500 and 2500)
      or not (v_y between -100 and 1000) or not (v_facing between -100000 and 100000)
      then return null; end if;
    if v_now-v_player.last_move_ms<40 then return null; end if;
    if v_player.last_move_ms>0 and sqrt(power(v_x-v_player.x,2)+power(v_y-v_player.y,2)+power(v_z-v_player.z,2))
      > greatest(20,(v_now-v_player.last_move_ms)*0.15) then return null; end if;
    update public.game_players set x=v_x,y=v_y,z=v_z,facing=v_facing,seen=true,last_move_ms=v_now where user_id=v_user;
    v_result := jsonb_build_object('type','move','id',v_user,'x',v_x,'y',v_y,'z',v_z,'facing',v_facing);
    perform realtime.send(v_result,'move','game:' || v_code,true);
    return v_result;
  end if;

  if p_action='attack' then
    if v_room.mode<>'tag' or v_player.team<>'police' or not v_player.seen or v_now<v_room.vulnerable_at then return null; end if;
    v_kind := case when p_data->>'kind'='web' then 'web' else 'punch' end;
    if v_kind='web' then v_reach:=22;v_vertical:=8;v_cone:=0.84;v_cooldown:=1600;v_damage:=15;
    else v_reach:=2.6;v_vertical:=2.2;v_cone:=0.65;v_cooldown:=560;v_damage:=25; end if;
    if v_now - (case when v_kind='web' then v_player.web_ms else v_player.punch_ms end) < v_cooldown then return null; end if;
    v_facing := coalesce((p_data->>'facing')::double precision,v_player.facing);
    if not (v_facing between -100000 and 100000) then return null; end if;
    update public.game_players set facing=v_facing,
      punch_ms=case when v_kind='punch' then v_now else punch_ms end,
      web_ms=case when v_kind='web' then v_now else web_ms end where user_id=v_user;
    select p.* into v_target from public.game_players p where p.room_code=v_code and p.team='runner'
      and not p.eliminated and p.seen and abs(p.y-v_player.y)<v_vertical
      and sqrt(power(p.x-v_player.x,2)+power(p.z-v_player.z,2))<=v_reach
      and (sqrt(power(p.x-v_player.x,2)+power(p.z-v_player.z,2))<=0.35
        or cos(atan2(p.x-v_player.x,p.z-v_player.z)-v_facing)>=v_cone)
    order by sqrt(power(p.x-v_player.x,2)+power(p.z-v_player.z,2)) limit 1 for update;
    if not found then return null; end if;
    update public.game_players set health=greatest(0,health-v_damage),eliminated=health<=v_damage
      where user_id=v_target.user_id returning * into v_target;
    v_result:=jsonb_build_object('type','hit','attacker',v_user,'target',v_target.user_id,
      'kind',v_kind,'health',v_target.health,'eliminated',v_target.eliminated);
    perform realtime.send(v_result,'hit','game:' || v_code,true);
    if not exists(select 1 from public.game_players where room_code=v_code and team='runner' and not eliminated) then
      update public.game_rooms set phase='finished',winner='police',ends_at=0 where code=v_code;
      perform game.publish(v_code);
    end if;
    return v_result;
  end if;

  raise exception '알 수 없는 요청입니다.';
end;
$$;

create or replace function public.game_can_receive(p_topic text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.game_players p
    where p.user_id=(select auth.uid()) and p.room_code=substring(p_topic from 6)
      and p_topic='game:' || p.room_code);
$$;

create policy game_room_broadcast_read on realtime.messages
for select to authenticated using (
  extension='broadcast' and public.game_can_receive((select realtime.topic()))
);

revoke all on function public.game_list(), public.game_state(text), public.game_command(text,jsonb),
  public.game_can_receive(text) from public, anon;
grant execute on function public.game_list(), public.game_state(text), public.game_command(text,jsonb),
  public.game_can_receive(text) to authenticated;
