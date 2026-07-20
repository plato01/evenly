-- ============================================================================
-- notify_friend_removed(p_target) — make "Remove friend" mutual
-- ----------------------------------------------------------------------------
-- Friendship lists are local per device; removal used to be one-sided (the
-- removed person still saw the remover). This drops a 'friend_removed' notice
-- into the target's activity_log so their device hides the remover too, the
-- same consent-notification pattern as notify_friend_added / friend requests
-- (SECURITY DEFINER because RLS blocks writing to another user's log).
--
-- Also clears any friend_requests rows between the pair so a later re-add
-- starts from a clean slate.
--
-- Run once via `supabase db push` (or the SQL Editor).
-- ============================================================================

create or replace function public.notify_friend_removed(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_target is null or p_target = v_uid then
    return;
  end if;
  if not exists (select 1 from public.users where id = p_target) then
    return;  -- ghost / unknown target: nothing to notify
  end if;

  -- One unread notice per remover -> target (re-removing doesn't spam).
  if not exists (
    select 1 from public.activity_log
    where user_id = p_target
      and type = 'friend_removed'
      and entity_id = v_uid::text
      and read = false
  ) then
    insert into public.activity_log
      (id, type, entity_id, entity_type, user_id, metadata_json, read, created_at)
    values (
      gen_random_uuid(), 'friend_removed', v_uid::text, 'user', p_target,
      json_build_object('actorId', v_uid)::text,
      false, now()
    );
  end if;

  -- Forget the request history between the pair so either side can send a
  -- fresh friend request later.
  delete from public.friend_requests
    where (from_user = v_uid and to_user = p_target)
       or (from_user = p_target and to_user = v_uid);
end;
$$;

revoke all on function public.notify_friend_removed(uuid) from public, anon;
grant execute on function public.notify_friend_removed(uuid) to authenticated;

notify pgrst, 'reload schema';
