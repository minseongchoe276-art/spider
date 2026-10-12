create or replace function game.cleanup() returns void
language plpgsql security definer set search_path = ''
as $$
declare v_room record; v_host uuid; v_now bigint := game.now_ms();
begin
  delete from public.game_players where last_seen < clock_timestamp() - interval '120 seconds';
  delete from public.game_rooms as room where not exists
    (select 1 from public.game_players p where p.room_code=room.code);
  for v_room in select * from public.game_rooms loop
    if not exists(select 1 from public.game_players p
      where p.user_id=v_room.host and p.room_code=v_room.code) then
      select p.user_id into v_host from public.game_players p
        where p.room_code=v_room.code order by p.user_id limit 1;
      update public.game_rooms set host=v_host where code=v_room.code;
      perform game.publish(v_room.code);
    end if;
    if v_room.phase='playing' and v_room.mode='tag' and v_now>=v_room.ends_at then
      update public.game_rooms set phase='finished',winner='runner',ends_at=0 where code=v_room.code;
      update public.game_players set ready=false where room_code=v_room.code;
      perform game.publish(v_room.code);
    end if;
  end loop;
end;
$$;
