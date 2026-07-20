-- ============================================================================
-- search_users(q) — v2: country-code-tolerant phone matching
-- ----------------------------------------------------------------------------
-- Replaces the exact-digit phone match with a SUFFIX match so a differing
-- country-code prefix doesn't break lookups: "+1 555-123-4567" and
-- "555-123-4567" now match because one digit string ends with the other.
--
-- Still privacy-safe: SECURITY DEFINER + exact-email / suffix-phone only, and
-- the phone branch requires >= 7 query digits so nobody can enumerate users by
-- probing short suffixes. Email match is unchanged (full, case-insensitive).
--
-- Run once via `supabase db push` (or the SQL Editor).
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
      -- phone: match when either digit string is a suffix of the other, so a
      -- country-code prefix on one side doesn't matter. Require >= 7 query
      -- digits so short suffixes can't be used to enumerate users.
      or (
        u.phone is not null
        and char_length(regexp_replace(q, '\D', '', 'g')) >= 7
        and (
          regexp_replace(u.phone, '\D', '', 'g') like '%' || regexp_replace(q, '\D', '', 'g')
          or regexp_replace(q, '\D', '', 'g') like '%' || regexp_replace(u.phone, '\D', '', 'g')
        )
      )
    )
  limit 10;
$$;

-- Allow signed-in users to call it; block anonymous access.
revoke all on function public.search_users(text) from public, anon;
grant execute on function public.search_users(text) to authenticated;

notify pgrst, 'reload schema';
