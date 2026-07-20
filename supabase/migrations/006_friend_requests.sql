-- ============================================================================
-- friend_requests  +  send_friend_request()  +  respond_friend_request()
-- ----------------------------------------------------------------------------
-- Consent-based friending between REGISTERED users.
--
-- Adding a friend is otherwise a purely local, one-directional action (a row in
-- the local `users` table). This adds a real, bidirectional request flow:
--
--   1. A sends B a request  -> send_friend_request(B) writes a pending row and a
--      'friend_request' notification into B's activity_log.
--   2. B accepts or declines -> respond_friend_request(id, accept). On accept we
--      notify A ('friend_request_accepted') so A's device can add B back.
--
-- RLS on `users` blocks reading a stranger's row, so the request row carries a
-- denormalised snapshot of the sender's profile (from_name/email/avatar). That
-- lets the recipient display the request AND add the sender locally on accept
-- without having to read the sender's `users` row. Same privacy-safe,
-- SECURITY DEFINER pattern as search_users / claim_invites / notify_friend_added.
--
-- Run once via `supabase db push` (or the SQL Editor).
-- ============================================================================

create table if not exists public.friend_requests (
  id             uuid primary key default gen_random_uuid(),
  from_user      uuid not null references public.users(id) on delete cascade,
  to_user        uuid not null references public.users(id) on delete cascade,
  from_name      text,
  from_email     text,
  from_avatar_url text,
  status         text not null default 'pending',  -- pending | accepted | declined
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  unique (from_user, to_user),
  check (from_user <> to_user)
);

create index if not exists friend_requests_to_idx
  on public.friend_requests (to_user, status);

alter table public.friend_requests enable row level security;

drop policy if exists friend_requests_read on public.friend_requests;

-- Read: either party can see requests they sent or received. All writes go
-- through the SECURITY DEFINER functions below (no direct insert/update policy).
create policy friend_requests_read on public.friend_requests
  for select using (
    from_user = auth.uid() or to_user = auth.uid()
  );


-- ─────────────────────────────────────────────────────────────
-- send_friend_request(p_target)
-- Record (or re-open) a pending request from the caller to p_target and drop a
-- 'friend_request' notification in the target's activity_log. Returns the
-- request id. Idempotent on (from_user, to_user).
-- ─────────────────────────────────────────────────────────────
create or replace function public.send_friend_request(p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text;
  v_email  text;
  v_avatar text;
  v_id     uuid;
begin
  if v_uid is null or p_target is null or p_target = v_uid then
    return null;
  end if;
  if not exists (select 1 from public.users where id = p_target) then
    return null;
  end if;

  select name, email, avatar_url into v_name, v_email, v_avatar
  from public.users where id = v_uid;

  insert into public.friend_requests
    (from_user, to_user, from_name, from_email, from_avatar_url, status, created_at, responded_at)
  values
    (v_uid, p_target, v_name, v_email, v_avatar, 'pending', now(), null)
  on conflict (from_user, to_user) do update
    set status = 'pending',
        from_name = excluded.from_name,
        from_email = excluded.from_email,
        from_avatar_url = excluded.from_avatar_url,
        created_at = now(),
        responded_at = null
  returning id into v_id;

  -- Notify the target (one unread per actor -> target; don't spam on re-send).
  if not exists (
    select 1 from public.activity_log
    where user_id = p_target
      and type = 'friend_request'
      and entity_id = v_uid::text
      and read = false
  ) then
    insert into public.activity_log
      (id, type, entity_id, entity_type, user_id, metadata_json, read, created_at)
    values (
      gen_random_uuid(), 'friend_request', v_uid::text, 'user', p_target,
      json_build_object(
        'actorId',   v_uid,
        'actorName', coalesce(nullif(v_name, ''), v_email, 'Someone')
      )::text,
      false, now()
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- respond_friend_request(p_request, p_accept)
-- The recipient accepts or declines a pending request. On accept, notify the
-- original sender ('friend_request_accepted') with the accepter's profile so
-- the sender's device can add them back as a friend. Only the recipient of a
-- still-pending request may respond.
-- ─────────────────────────────────────────────────────────────
create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_from   uuid;
  v_name   text;
  v_email  text;
  v_avatar text;
begin
  if v_uid is null or p_request is null then
    return;
  end if;

  select from_user into v_from
  from public.friend_requests
  where id = p_request and to_user = v_uid and status = 'pending';

  if v_from is null then
    return;  -- not found, not yours, or already responded
  end if;

  update public.friend_requests
    set status = case when p_accept then 'accepted' else 'declined' end,
        responded_at = now()
    where id = p_request;

  if p_accept then
    select name, email, avatar_url into v_name, v_email, v_avatar
    from public.users where id = v_uid;

    insert into public.activity_log
      (id, type, entity_id, entity_type, user_id, metadata_json, read, created_at)
    values (
      gen_random_uuid(), 'friend_request_accepted', v_uid::text, 'user', v_from,
      json_build_object(
        'actorId',     v_uid,
        'actorName',   coalesce(nullif(v_name, ''), v_email, 'Someone'),
        'actorEmail',  v_email,
        'actorAvatar', v_avatar
      )::text,
      false, now()
    );
  end if;
end;
$$;

revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
