-- ============================================================================
-- search_users(q)
-- ----------------------------------------------------------------------------
-- Privacy-safe user lookup for the "Find on Evenly" friend search.
--
-- RLS on `users` only lets you read your own row + group-mates, so the client
-- cannot find a stranger by email/phone. This SECURITY DEFINER function runs
-- with elevated rights but ONLY returns rows that EXACTLY match the given
-- email or phone — so callers can look someone up if they already know the
-- full address, but CANNOT browse or enumerate the user base.
--
-- Run this once in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================================

create or replace function public.search_users(q text)
returns table (
  id               uuid,
  name             text,
  email            text,
  phone            text,
  avatar_url       text,
  default_currency text
)
language sql
security definer
set search_path = public
as $$
  select u.id, u.name, u.email, u.phone, u.avatar_url, u.default_currency
  from public.users u
  where auth.uid() is not null          -- must be signed in
    and u.id <> auth.uid()              -- don't return yourself
    and char_length(trim(q)) >= 5       -- ignore too-short probes
    and (
      -- exact email (case-insensitive)
      lower(u.email) = lower(trim(q))
      -- exact phone, ignoring formatting (spaces, dashes, "+")
      or (
        u.phone is not null
        and char_length(regexp_replace(q, '\D', '', 'g')) >= 6
        and regexp_replace(u.phone, '\D', '', 'g') = regexp_replace(q, '\D', '', 'g')
      )
    )
  limit 10;
$$;

-- Allow signed-in users to call it; block anonymous access.
revoke all on function public.search_users(text) from public, anon;
grant execute on function public.search_users(text) to authenticated;
