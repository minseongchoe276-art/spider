-- Preserve the existing authenticated movement/hit rules. Pose travels with
-- an accepted movement update, using the authenticated user's ID. Clients
-- retain read-only Realtime access and cannot forge another player's pose.
create or replace function public.game_move_pose(p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb;
  v_code text;
  v_pose jsonb;
begin
  v_result := public.game_command('move', p_data);
  if v_result is null then return null; end if;
  v_pose := p_data->'pose';
  if jsonb_typeof(v_pose)='object' and octet_length(v_pose::text)<=4096
    and v_pose->>'state' in ('IDLE','RUNNING','SPRINTING','JUMPING','FALLING','SWINGING',
      'WEB_ZIP','WALL_RUNNING','MANTLING','LANDING','ROLLING','TURNING') then
    select room_code into v_code from public.game_players where user_id=(select auth.uid());
    perform realtime.send(jsonb_build_object('type','pose','id',(select auth.uid()),'pose',v_pose),
      'pose','game:' || v_code,true);
  end if;
  return v_result;
end;
$$;
revoke all on function public.game_move_pose(jsonb) from public, anon;
grant execute on function public.game_move_pose(jsonb) to authenticated;
