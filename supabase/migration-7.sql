-- ============================================================
-- LifeOS — migration 7 (additive)
-- One-time calendar sharing: send your agenda to anyone with no account.
-- Safe to re-run. No drops of existing tables, no data loss.
-- ============================================================

-- ---------- One-time calendar shares ----------
create table if not exists public.calendar_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique,          -- unguessable secret embedded in the link
  label text,                          -- optional note, e.g. "Rita — jantar sexta"
  expires_at timestamptz,              -- null = never expires
  used_at timestamptz,                 -- set on first read → single-use link
  created_at timestamptz not null default now()
);
create index if not exists calendar_shares_user_idx on public.calendar_shares(user_id);

alter table public.calendar_shares enable row level security;
drop policy if exists "own rows" on public.calendar_shares;
create policy "own rows" on public.calendar_shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Public read (no account needed) ----------
-- SECURITY DEFINER so an unauthenticated visitor holding a valid token can
-- read the owner's agenda without touching RLS. The token is 192-bit random.
-- A successful read marks the share as used → the link works exactly once.
-- Only the upcoming agenda is exposed (30 days back → 365 days ahead).
-- Privacy: only title, times, day and colour are shared — no description/location.
create or replace function public.get_shared_calendar(p_token text)
returns table (
  id uuid,
  title text,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean,
  color text,
  calendar_name text,
  source text,
  owner_name text,
  owner_email text,
  share_label text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_owner uuid;
  v_label text;
begin
  select cs.id, cs.user_id, cs.label into v_id, v_owner, v_label
  from public.calendar_shares cs
  where cs.token = p_token
    and cs.used_at is null
    and (cs.expires_at is null or cs.expires_at > now());

  if v_id is null then
    raise exception 'share_not_found' using errcode = 'P0001';
  end if;

  -- consume the link: after this the token no longer returns data.
  -- A 10-minute grace window keeps accidental refreshes working.
  update public.calendar_shares
     set used_at = now()
   where calendar_shares.id = v_id
     and (calendar_shares.used_at is null or calendar_shares.used_at < now() - interval '10 minutes');

  return query
    select e.id, e.title, e.start_at, e.end_at,
           e.all_day, e.color, e.calendar_name, e.source,
           p.name, p.email, v_label
    from public.calendar_events e
    left join public.profiles p on p.id = v_owner
    where e.user_id = v_owner
      and e.start_at >= date_trunc('day', now())
      and e.start_at <= now() + interval '365 days'
    order by e.start_at asc;
end $$;

grant execute on function public.get_shared_calendar(text) to anon, authenticated;
