-- ============================================================================
-- group_invites  +  claim_invites()
-- ----------------------------------------------------------------------------
-- Invitations for people who are NOT on Evenly yet.
--
-- When you add a manually-created ("ghost") friend to a group, we can't store
-- them as a real member — `users.id` references `auth.users(id)`, and a ghost
-- has no auth account. Instead we record an invite keyed by EMAIL. When that
-- person later registers with the same email, `claim_invites()` turns every
-- pending invite into a real membership under their own account.
--
-- Run once in the Supabase SQL Editor (or `supabase db push`).
-- ============================================================================

create table if not exists public.group_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  email       text not null,
  phone       text,
  ghost_name  text,
  invited_by  uuid not null references public.users(id),
  status      text not null default 'pending',   -- pending | accepted
  accepted_by uuid references public.users(id),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (group_id, email)
);

create index if not exists group_invites_email_idx on public.group_invites (lower(email));

alter table public.group_invites enable row level security;

drop policy if exists group_invites_read   on public.group_invites;
drop policy if exists group_invites_insert  on public.group_invites;
drop policy if exists group_invites_update  on public.group_invites;
drop policy if exists group_invites_delete  on public.group_invites;

-- Read: the inviter, anyone already in the group, or the invitee (email match).
create policy group_invites_read on public.group_invites
  for select using (
    invited_by = auth.uid()
    or group_id in (select get_my_group_ids())
    or lower(email) = lower((select u.email from auth.users u where u.id = auth.uid()))
  );

-- Insert: only members of the group may invite, and only as themselves.
create policy group_invites_insert on public.group_invites
  for insert with check (
    invited_by = auth.uid()
    and (
      group_id in (select get_my_group_ids())
      or group_id in (select id from public.groups where created_by = auth.uid())
    )
  );

-- Update / delete: the inviter or the group creator (e.g. to revoke).
create policy group_invites_update on public.group_invites
  for update using (
    invited_by = auth.uid()
    or group_id in (select id from public.groups where created_by = auth.uid())
  );
create policy group_invites_delete on public.group_invites
  for delete using (
    invited_by = auth.uid()
    or group_id in (select id from public.groups where created_by = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────
-- claim_invites()
-- Called by a freshly-registered user. Joins them to every group
-- they were invited to (by email), under their real account.
-- Returns the number of groups joined. Idempotent.
-- ─────────────────────────────────────────────────────────────
create or replace function public.claim_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_count int := 0;
  r       record;
begin
  if v_uid is null then
    return 0;
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    return 0;
  end if;

  for r in
    select distinct group_id
    from public.group_invites
    where lower(email) = lower(v_email)
      and status = 'pending'
  loop
    insert into public.group_members (group_id, user_id)
    values (r.group_id, v_uid)
    on conflict (group_id, user_id) do nothing;
    v_count := v_count + 1;
  end loop;

  update public.group_invites
    set status = 'accepted', accepted_by = v_uid, accepted_at = now()
    where lower(email) = lower(v_email)
      and status = 'pending';

  return v_count;
end;
$$;

revoke all on function public.claim_invites() from public, anon;
grant execute on function public.claim_invites() to authenticated;

notify pgrst, 'reload schema';
