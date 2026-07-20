-- ============================================================================
-- notify_friend_added(p_target)
-- ----------------------------------------------------------------------------
-- Lets an existing user tell another registered user "X added you as a friend"
-- as an in-app notification.
--
-- Friend-adding is otherwise a purely local action, so the added person's
-- device has no way to learn about it. RLS on activity_log only lets you write
-- rows for YOURSELF (user_id = auth.uid()), so we can't insert a notification
-- addressed to someone else directly. This SECURITY DEFINER function does it
-- server-side with validation — same privacy-safe pattern as search_users /
-- claim_invites. The recipient reads it back through the existing
-- activity_access SELECT policy (user_id = auth.uid()).
--
-- Run once via `supabase db push` (or the SQL Editor).
-- ============================================================================

create or replace function public.notify_friend_added(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       uuid := auth.uid();
  v_actor_name  text;
  v_actor_email text;
begin
  -- Must be signed in, target must be real, and you can't notify yourself.
  if v_actor is null or p_target is null or p_target = v_actor then
    return;
  end if;
  if not exists (select 1 from public.users where id = p_target) then
    return;
  end if;

  select name, email into v_actor_name, v_actor_email
  from public.users where id = v_actor;

  -- One unread "friend_added" per (actor → target); don't spam on re-add.
  if exists (
    select 1 from public.activity_log
    where user_id = p_target
      and type = 'friend_added'
      and entity_id = v_actor::text
      and read = false
  ) then
    return;
  end if;

  insert into public.activity_log
    (id, type, entity_id, entity_type, user_id, metadata_json, read, created_at)
  values (
    gen_random_uuid(),
    'friend_added',
    v_actor::text,             -- who added them
    'user',
    p_target,                  -- the recipient (owner of this notification)
    json_build_object(
      'actorId',   v_actor,
      'actorName', coalesce(nullif(v_actor_name, ''), v_actor_email, 'Someone')
    )::text,
    false,
    now()
  );
end;
$$;

revoke all on function public.notify_friend_added(uuid) from public, anon;
grant execute on function public.notify_friend_added(uuid) to authenticated;

notify pgrst, 'reload schema';
