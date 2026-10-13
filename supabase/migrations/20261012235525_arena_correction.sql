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
  v_arena jsonb;v_points jsonb;v_point jsonb;v_hit game.hit_checks%rowtype;v_ally uuid;v_id uuid;
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
    update public.game_rooms set enhanced=coalesce((p_data->>'enhanced')::boolean,false) where code=v_code;
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

  if p_action='heartbeat' then
    if v_room.enhanced and v_room.phase='playing' and v_now-v_room.last_pulse>20000 then
      update public.game_rooms set last_pulse=v_now,pulse_until=v_now+3500 where code=v_code;perform game.publish(v_code);
    end if;return game.state(v_code); end if;

  if p_action='ready' and v_room.phase='waiting' then
    if v_room.enhanced and coalesce((p_data->>'ready')::boolean,false) then
      if not coalesce((p_data->>'terrainReady')::boolean,false) then raise exception '지형 로딩이 완료된 뒤 준비하세요.';end if;
      if v_room.host=v_user then
        v_x:=(p_data->'spawn'->>'x')::double precision;v_y:=(p_data->'spawn'->>'y')::double precision;v_z:=(p_data->'spawn'->>'z')::double precision;
        if v_x is null or v_y is null or v_z is null or not(v_x between -2400 and 2400 and v_z between -2400 and 2400 and v_y between 0 and 900) then raise exception '안전한 시작점이 필요합니다.';end if;
        select coalesce(jsonb_agg(point),'[]'::jsonb) into v_points from (select point from jsonb_array_elements(coalesce(p_data->'roofs','[]'::jsonb)) point
          where jsonb_typeof(point)='object' and (point->>'x')::double precision between -2400 and 2400 and (point->>'z')::double precision between -2400 and 2400 and (point->>'y')::double precision between 0 and 900
          and sqrt(power((point->>'x')::double precision-v_x,2)+power((point->>'z')::double precision-v_z,2)) between 25 and case when v_room.city='procedural' then 275 else 425 end limit 12) valid;
        if jsonb_array_length(v_points)<2 then raise exception '추격전에 필요한 주변 옥상 지형이 아직 준비되지 않았습니다.';end if;
        update public.game_rooms set arena=jsonb_build_object('x',v_x,'y',v_y,'z',v_z,'radius',case when city='procedural' then 300 else 450 end,'points',v_points) where code=v_code;
      end if;
    end if;
    update public.game_players set ready=coalesce((p_data->>'ready')::boolean,false) where user_id=v_user;
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  if p_action='start' then
    if v_room.host<>v_user or v_room.phase<>'waiting' then raise exception '방장만 시작할 수 있습니다.'; end if;
    if (select count(*) from public.game_players where room_code=v_code)<2 then raise exception '최소 2명이 모여야 시작할 수 있습니다.'; end if;
    if exists(select 1 from public.game_players where room_code=v_code and not ready) then raise exception '모든 플레이어가 준비해야 합니다.'; end if;
    if v_room.enhanced and v_room.arena is null then raise exception '방장의 안전 지형 준비가 필요합니다.';end if;
    update public.game_rooms set phase='playing',winner=null,
      ends_at=case when mode='tag' then v_now+case when not enhanced then 300000 when (select count(*) from public.game_players where room_code=v_code)<=2 then 180000 when (select count(*) from public.game_players where room_code=v_code)<=6 then 240000 else 300000 end else 0 end,
      vulnerable_at=case when mode='tag' then v_now+8000 else 0 end where code=v_code;
    with shuffled as (select user_id,row_number() over(order by case when v_room.enhanced then police_rounds else 0 end,random()) as rank,
      count(*) over() as total from public.game_players where room_code=v_code)
    update public.game_players p set
      team=case when v_room.mode='free' then 'free'
        when s.rank<=case when s.total>=7 then 2 else 1 end then 'police' else 'runner' end,
      police_rounds=police_rounds+case when v_room.mode='tag' and s.rank<=case when s.total>=7 then 2 else 1 end then 1 else 0 end,progress=0,goal_at=0,rescue_target=null,rescue_since=0,
      health=100,eliminated=false,seen=false,x=0,y=0,z=0,facing=0,last_move_ms=0,punch_ms=0,web_ms=0
    from shuffled s where p.user_id=s.user_id;
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  if p_action='rematch' then
    if v_room.host<>v_user or v_room.phase<>'finished' then raise exception '방장만 다시 시작할 수 있습니다.'; end if;
    update public.game_rooms set phase='waiting',round=round+1,winner=null,ends_at=0,vulnerable_at=0 where code=v_code;
    update public.game_players set ready=false,eliminated=false,health=100,team=null where room_code=v_code;
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  if v_room.phase<>'playing' then return null;end if;
  if p_action='hit-confirm' and v_room.enhanced then
    select * into v_hit from game.hit_checks where id=(p_data->>'hitId')::uuid and room_code=v_code and target=v_user for update;
    if not found or v_hit.expires<v_now then return null;end if;
    delete from game.hit_checks where id=v_hit.id;
    if not coalesce((p_data->>'clear')::boolean,false) or v_player.eliminated then return null;end if;
    v_damage:=case when v_hit.kind='web' then 15 else 25 end;
    update public.game_players set health=greatest(0,health-v_damage),eliminated=health<=v_damage where user_id=v_user returning * into v_target;
    v_result:=jsonb_build_object('type','hit','attacker',v_hit.attacker,'target',v_user,'kind',v_hit.kind,'health',v_target.health,'eliminated',v_target.eliminated);
    perform realtime.send(v_result,'hit','game:'||v_code,true);
    if not exists(select 1 from public.game_players where room_code=v_code and team='runner' and not eliminated) then update public.game_rooms set phase='finished',winner='police',ends_at=0 where code=v_code;perform game.publish(v_code);end if;
    return v_result;
  end if;
  if v_player.eliminated then return null; end if;

  if p_action='move' then
    v_x := (p_data->>'x')::double precision; v_y := (p_data->>'y')::double precision;
    v_z := (p_data->>'z')::double precision; v_facing := (p_data->>'facing')::double precision;
    if v_x is null or v_y is null or v_z is null or v_facing is null
      or not (v_x between -2500 and 2500) or not (v_z between -2500 and 2500)
      or not (v_y between -100 and 1000) or not (v_facing between -100000 and 100000)
      then return null; end if;
    if v_room.enhanced and v_room.arena is not null and
      sqrt(power(v_x-(v_room.arena->>'x')::double precision,2)+power(v_z-(v_room.arena->>'z')::double precision,2))>(v_room.arena->>'radius')::double precision+3 then
      return jsonb_build_object('type','correction','x',v_player.x,'y',v_player.y,'z',v_player.z);end if;
    if v_now-v_player.last_move_ms<40 then return null; end if;
    if v_player.last_move_ms>0 and sqrt(power(v_x-v_player.x,2)+power(v_y-v_player.y,2)+power(v_z-v_player.z,2))
      > greatest(20,(v_now-v_player.last_move_ms)*0.15) then return null; end if;
    if v_room.enhanced and v_room.arena is not null then
      if sqrt(power(v_x-(v_room.arena->>'x')::double precision,2)+power(v_z-(v_room.arena->>'z')::double precision,2))>(v_room.arena->>'radius')::double precision+3
        or (v_room.city='procedural' and v_player.seen and game.blocked(v_player.x,v_player.y,v_player.z,v_x,v_y,v_z)) then
        return jsonb_build_object('type','correction','x',v_player.x,'y',v_player.y,'z',v_player.z);end if;
    end if;
    update public.game_players set x=v_x,y=v_y,z=v_z,facing=v_facing,seen=true,last_move_ms=v_now where user_id=v_user;
    if v_room.enhanced and v_room.mode='tag' and v_player.team='runner' then
      v_point:=v_room.arena->'points'->(v_player.progress % jsonb_array_length(v_room.arena->'points'));
      if v_now-v_player.goal_at>=1200 and sqrt(power(v_x-(v_point->>'x')::double precision,2)+power(v_y-(v_point->>'y')::double precision,2)+power(v_z-(v_point->>'z')::double precision,2))<7 then
        update public.game_players set progress=progress+1,goal_at=v_now where user_id=v_user;
        if v_player.progress+1>=3 then update public.game_rooms set phase='finished',winner='runner',ends_at=0 where code=v_code;end if;perform game.publish(v_code);
      end if;
      select user_id into v_ally from public.game_players where room_code=v_code and team='runner' and eliminated
        and sqrt(power(x-v_x,2)+power(y-v_y,2)+power(z-v_z,2))<3.5 order by user_id limit 1;
      if v_ally is not null then
        if v_player.rescue_target is distinct from v_ally then update public.game_players set rescue_target=v_ally,rescue_since=v_now where user_id=v_user;
        elsif v_now-v_player.rescue_since>=3000 then update public.game_players set health=50,eliminated=false where user_id=v_ally;update public.game_players set rescue_target=null,rescue_since=0 where user_id=v_user;perform game.publish(v_code);end if;
      else update public.game_players set rescue_target=null,rescue_since=0 where user_id=v_user;end if;
    end if;
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
    if v_room.enhanced then
      if v_now-v_player.last_move_ms>1500 or v_now-v_target.last_move_ms>1500 then return null;end if;
      if v_room.city='procedural' then if game.blocked(v_player.x,v_player.y,v_player.z,v_target.x,v_target.y,v_target.z) then return null;end if;
      else
        delete from game.hit_checks where room_code=v_code and expires<v_now;
        insert into game.hit_checks(room_code,attacker,target,kind,expires) values(v_code,v_user,v_target.user_id,v_kind,v_now+1200) returning id into v_id;
        perform realtime.send(jsonb_build_object('type','hit-check','target',v_target.user_id,'hitId',v_id,'from',jsonb_build_object('x',v_player.x,'y',v_player.y,'z',v_player.z),'to',jsonb_build_object('x',v_target.x,'y',v_target.y,'z',v_target.z)),'hit-check','game:'||v_code,true);return null;
      end if;
    end if;
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

