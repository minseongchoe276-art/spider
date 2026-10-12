-- A reload keeps the anonymous Auth session. Resume its existing room rather
-- than treating the still-present player row as a duplicate join.
create or replace function public.game_resume() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_code text;
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다.'; end if;
  perform game.cleanup();
  select room_code into v_code from public.game_players where user_id=(select auth.uid());
  if v_code is null then return null; end if;
  update public.game_players set last_seen=clock_timestamp() where user_id=(select auth.uid());
  return game.state(v_code);
end;
$$;

revoke all on function public.game_resume() from public, anon;
grant execute on function public.game_resume() to authenticated;
