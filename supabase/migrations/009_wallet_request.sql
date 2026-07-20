-- ============================================================================
-- 009: "Request crypto address" notification
--
-- notify_wallet_requested(p_target) — drops a 'wallet_requested' notice into
-- the target's activity_log so their dashboard bell shows "X requested your
-- crypto address". Same SECURITY DEFINER + de-dupe pattern as
-- notify_friend_added (RLS only lets users write their own activity rows).
--
-- Run once via `supabase db push` (or the SQL Editor).
-- ============================================================================

create or replace function public.notify_wallet_requested(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_email text;
begin
  if v_uid is null or p_target is null or p_target = v_uid then
    return;
  end if;
  if not exists (select 1 from public.users where id = p_target) then
    return;
  end if;

  select name, email into v_name, v_email from public.users where id = v_uid;

  -- One unread notice per requester -> target; don't spam on re-taps.
  if exists (
    select 1 from public.activity_log
    where user_id = p_target
      and type = 'wallet_requested'
      and entity_id = v_uid::text
      and read = false
  ) then
    return;
  end if;

  insert into public.activity_log
    (id, type, entity_id, entity_type, user_id, metadata_json, read, created_at)
  values (
    gen_random_uuid(), 'wallet_requested', v_uid::text, 'user', p_target,
    json_build_object(
      'actorId',   v_uid,
      'actorName', coalesce(nullif(v_name, ''), v_email, 'Someone')
    )::text,
    false, now()
  );
end;
$$;

revoke all on function public.notify_wallet_requested(uuid) from public;
grant execute on function public.notify_wallet_requested(uuid) to authenticated;

notify pgrst, 'reload schema';
