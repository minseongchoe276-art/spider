-- Owner overview. Clients cannot read room tables directly. The overview
-- returns counts and roster state, never coordinates or account ids.
create extension if not exists pgcrypto;

create table if not exists public.game_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default clock_timestamp(),
  city text,
  activity text not null default 'lobby' check (activity in ('lobby', 'solo', 'room'))
);
alter table public.game_presence enable row level security;
revoke all on public.game_presence from public, anon, authenticated;

create table if not exists game.admin_credential (
  id boolean primary key default true check (id),
  token_sha256 text not null
);
create table if not exists game.admin_attempts (
  user_id uuid primary key,
  failures integer not null default 0,
  window_start timestamptz not null default clock_timestamp(),
  locked_until timestamptz
);
create table if not exists game.admin_global (
  id boolean primary key default true check (id),
  failures integer not null default 0,
  window_start timestamptz not null default clock_timestamp()
);
insert into game.admin_global(id) values (true) on conflict (id) do nothing;
-- No shared bootstrap credential. An operator must provision their own verifier
-- through a privileged connection before administrator access becomes available.

create or replace function game.sha256_hex(p_text text) returns text
language plpgsql immutable set search_path = ''
as $$
begin
  begin
    return encode(extensions.digest(convert_to(coalesce(p_text, ''), 'UTF8'), 'sha256'), 'hex');
  exception when undefined_function or invalid_schema_name then
    return encode(public.digest(convert_to(coalesce(p_text, ''), 'UTF8'), 'sha256'), 'hex');
  end;
end;
$$;
revoke all on function game.sha256_hex(text) from public, anon, authenticated;

create or replace function public.game_presence_ping(p_city text default null, p_activity text default 'lobby')
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception '로그인이 필요합니다.'; end if;
  insert into public.game_presence(user_id, last_seen, city, activity)
  values (
    v_user,
    clock_timestamp(),
    case when p_city in ('hong-kong', 'procedural') then p_city else null end,
    case when p_activity in ('lobby', 'solo', 'room') then p_activity else 'lobby' end
  )
  on conflict (user_id) do update
    set last_seen = clock_timestamp(), city = excluded.city, activity = excluded.activity;
  delete from public.game_presence where last_seen < clock_timestamp() - interval '3 minutes';
end;
$$;

create or replace function public.game_admin_overview(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_attempt game.admin_attempts%rowtype;
  v_failures integer;
  v_window timestamptz;
  v_hash text;
  v_online jsonb;
  v_rooms jsonb;
  v_matches jsonb;
begin
  if v_user is null then raise exception '로그인이 필요합니다.'; end if;

  select failures, window_start into v_failures, v_window from game.admin_global where id for update;
  if v_window < clock_timestamp() - interval '60 seconds' then
    update game.admin_global set failures = 0, window_start = clock_timestamp() where id;
    v_failures := 0;
  end if;
  if v_failures >= 40 then
    return jsonb_build_object('type', 'admin', 'ok', false, 'message', '잠시 후 다시 시도하세요.');
  end if;

  select * into v_attempt from game.admin_attempts where user_id = v_user for update;
  if not found then
    insert into game.admin_attempts(user_id) values (v_user) on conflict (user_id) do nothing;
    select * into v_attempt from game.admin_attempts where user_id = v_user for update;
  end if;
  if v_attempt.window_start < clock_timestamp() - interval '60 seconds' then
    v_attempt.failures := 0;
    v_attempt.window_start := clock_timestamp();
    v_attempt.locked_until := null;
  end if;
  if v_attempt.locked_until is not null and v_attempt.locked_until > clock_timestamp() then
    return jsonb_build_object('type', 'admin', 'ok', false, 'message', '잠시 후 다시 시도하세요.');
  end if;

  v_hash := game.sha256_hex(left(coalesce(p_token, ''), 128));
  if length(coalesce(p_token, '')) > 128 or v_hash is distinct from (select token_sha256 from game.admin_credential limit 1) then
    v_attempt.failures := v_attempt.failures + 1;
    if v_attempt.failures >= 8 then v_attempt.locked_until := clock_timestamp() + interval '60 seconds'; end if;
    update game.admin_attempts
      set failures = v_attempt.failures, window_start = v_attempt.window_start, locked_until = v_attempt.locked_until
      where user_id = v_user;
    update game.admin_global set failures = failures + 1 where id;
    return jsonb_build_object('type', 'admin', 'ok', false, 'message',
      case when v_attempt.locked_until is not null and v_attempt.locked_until > clock_timestamp()
        then '잠시 후 다시 시도하세요.' else '관리자 키가 올바르지 않습니다.' end);
  end if;
  update game.admin_attempts set failures = 0, locked_until = null, window_start = clock_timestamp() where user_id = v_user;

  perform game.cleanup();
  delete from public.game_presence where last_seen < clock_timestamp() - interval '3 minutes';

  with seated as (
    select p.user_id, p.room_code, r.phase, p.last_seen > clock_timestamp() - interval '30 seconds' as live
    from public.game_players p
    join public.game_rooms r on r.code = p.room_code
  ), presence as (
    select g.user_id, g.activity
    from public.game_presence g
    where g.last_seen > clock_timestamp() - interval '45 seconds'
      and not exists(select 1 from public.game_players p where p.user_id = g.user_id)
  )
  select jsonb_build_object(
    'connected', (select count(*) from presence) + (select count(*) from seated where live),
    'lobby', (select count(*) from presence where activity is distinct from 'solo'),
    'solo', (select count(*) from presence where activity = 'solo'),
    'waiting', (select count(*) from seated where live and phase = 'waiting'),
    'playing', (select count(*) from seated where live and phase = 'playing'),
    'finished', (select count(*) from seated where live and phase = 'finished'),
    'reconnecting', (select count(*) from seated where not live)
  ) into v_online;

  select jsonb_build_object(
    'total', count(*),
    'waiting', count(*) filter (where phase = 'waiting'),
    'playing', count(*) filter (where phase = 'playing'),
    'finished', count(*) filter (where phase = 'finished'),
    'seated', coalesce(sum((select count(*) from public.game_players p where p.room_code = r.code)), 0),
    'seats', coalesce(sum(capacity), 0)
  ) into v_rooms from public.game_rooms r;

  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  into v_matches from (
    select row_number() over (
      order by case r.phase when 'playing' then 0 when 'waiting' then 1 else 2 end, r.created_at desc
    ) as ord, jsonb_build_object(
      'code', r.code,
      'name', r.name,
      'mode', r.mode,
      'format', 'teams',
      'city', r.city,
      'phase', r.phase,
      'enhanced', r.enhanced,
      'count', (select count(*) from public.game_players p where p.room_code = r.code),
      'capacity', r.capacity,
      'round', r.round,
      'winner', r.winner,
      'endsInSeconds', case when r.phase = 'playing' and r.ends_at > 0
        then greatest(0, ceil((r.ends_at - game.now_ms()) / 1000.0))::int else null end,
      'ageSeconds', floor(extract(epoch from clock_timestamp() - r.created_at))::int,
      'hostName', coalesce((select p.name from public.game_players p where p.user_id = r.host and p.room_code = r.code), '방장'),
      'players', coalesce((select jsonb_agg(jsonb_build_object(
        'name', p.name,
        'team', case when p.team in ('police', 'runner', 'red', 'blue', 'free') then p.team when p.team is null then 'free' else 'ffa' end,
        'ready', p.ready,
        'health', p.health,
        'eliminated', p.eliminated,
        'connected', p.last_seen > clock_timestamp() - interval '30 seconds',
        'reconnecting', p.last_seen <= clock_timestamp() - interval '30 seconds',
        'host', p.user_id = r.host,
        'idleSeconds', case when p.last_move_ms > 0 then greatest(0, floor((game.now_ms() - p.last_move_ms) / 1000.0))::int else null end
      ) order by p.name) from public.game_players p where p.room_code = r.code), '[]'::jsonb)
    ) as item
    from public.game_rooms r
    order by case r.phase when 'playing' then 0 when 'waiting' then 1 else 2 end, r.created_at desc
    limit 32
  ) listed;

  return jsonb_build_object(
    'type', 'admin', 'ok', true, 'transport', 'supabase', 'serverNow', game.now_ms(),
    'online', v_online, 'rooms', v_rooms, 'matches', v_matches,
    'truncated', (select count(*) > 32 from public.game_rooms));
end;
$$;

revoke all on function public.game_presence_ping(text, text), public.game_admin_overview(text) from public, anon;
grant execute on function public.game_presence_ping(text, text), public.game_admin_overview(text) to authenticated;
