-- ============================================================================
-- get_wallet(p_user) — read a user's crypto receiving details
-- ----------------------------------------------------------------------------
-- RLS on `users` only exposes rows of group-mates, but friends without a
-- shared group also need each other's receiving address (friend profile and
-- settle screen). SECURITY DEFINER, returning ONLY the wallet columns — no
-- email/phone/profile leak. A receiving address exists to be handed out, and
-- user ids are unguessable UUIDs obtained through consented flows.
--
-- Run once via `supabase db push` (or the SQL Editor).
-- ============================================================================

create or replace function public.get_wallet(p_user uuid)
returns table (wallet_address text, wallet_chain_id integer, wallet_token text)
language sql
security definer
set search_path = public
as $$
  select u.wallet_address, u.wallet_chain_id, u.wallet_token
  from public.users u
  where auth.uid() is not null
    and u.id = p_user;
$$;

revoke all on function public.get_wallet(uuid) from public, anon;
grant execute on function public.get_wallet(uuid) to authenticated;

notify pgrst, 'reload schema';
