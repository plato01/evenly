-- ============================================================================
-- Carry the sender's currency through friend requests + get_profile_lite()
-- ----------------------------------------------------------------------------
-- Friend-request snapshots (from_name/email/avatar) had no currency, so the
-- accepting device stored the sender with a hardcoded USD. Snapshot
-- default_currency too, and expose a profile-lite reader so devices can heal
-- stale local copies (name/avatar/currency/wallet) of friends they don't
-- share a group with (users RLS only exposes group-mates).
--
-- Run once via `supabase db push` (or the SQL Editor).
-- ============================================================================

alter table public.friend_requests
  add column if not exists from_currency text;

-- Re-create send_friend_request with the currency snapshot.
create or replace function public.send_friend_request(p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text;
  v_email    text;
  v_avatar   text;
  v_currency text;
  v_id       uuid;
begin
  if v_uid is null or p_target is null or p_target = v_uid then
    return null;
  end if;
  if not exists (select 1 from public.users where id = p_target) then
    return null;
  end if;

  select name, email, avatar_url, default_currency
    into v_name, v_email, v_avatar, v_currency
  from public.users where id = v_uid;

  insert into public.friend_requests
    (from_user, to_user, from_name, from_email, from_avatar_url, from_currency, status, created_at, responded_at)
  values
    (v_uid, p_target, v_name, v_email, v_avatar, v_currency, 'pending', now(), null)
  on conflict (from_user, to_user) do update
    set status = 'pending',
        from_name = excluded.from_name,
        from_email = excluded.from_email,
        from_avatar_url = excluded.from_avatar_url,
        from_currency = excluded.from_currency,
        created_at = now(),
        responded_at = null
  returning id into v_id;

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

-- Re-create respond_friend_request so the acceptance notice carries currency.
create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_from     uuid;
  v_name     text;
  v_email    text;
  v_avatar   text;
  v_currency text;
begin
  if v_uid is null or p_request is null then
    return;
  end if;

  select from_user into v_from
  from public.friend_requests
  where id = p_request and to_user = v_uid and status = 'pending';

  if v_from is null then
    return;
  end if;

  update public.friend_requests
    set status = case when p_accept then 'accepted' else 'declined' end,
        responded_at = now()
    where id = p_request;

  if p_accept then
    select name, email, avatar_url, default_currency
      into v_name, v_email, v_avatar, v_currency
    from public.users where id = v_uid;

    insert into public.activity_log
      (id, type, entity_id, entity_type, user_id, metadata_json, read, created_at)
    values (
      gen_random_uuid(), 'friend_request_accepted', v_uid::text, 'user', v_from,
      json_build_object(
        'actorId',       v_uid,
        'actorName',     coalesce(nullif(v_name, ''), v_email, 'Someone'),
        'actorEmail',    v_email,
        'actorAvatar',   v_avatar,
        'actorCurrency', v_currency
      )::text,
      false, now()
    );
  end if;
end;
$$;

-- Profile-lite reader: enough to render/heal a friend entry, nothing more.
create or replace function public.get_profile_lite(p_user uuid)
returns table (
  name             text,
  avatar_url       text,
  default_currency text,
  wallet_address   text,
  wallet_chain_id  integer,
  wallet_token     text
)
language sql
security definer
set search_path = public
as $$
  select u.name, u.avatar_url, u.default_currency,
         u.wallet_address, u.wallet_chain_id, u.wallet_token
  from public.users u
  where auth.uid() is not null
    and u.id = p_user;
$$;

revoke all on function public.get_profile_lite(uuid) from public, anon;
grant execute on function public.get_profile_lite(uuid) to authenticated;

notify pgrst, 'reload schema';
