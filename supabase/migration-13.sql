-- LifeOS migration 13: live viewer count for location shares.
-- Each device that opens /share/location/:token sends a heartbeat; the sharer
-- reads how many distinct viewers are watching right now. Anonymous viewers go
-- through a security-definer RPC so they never touch the table directly.

create table if not exists public.location_share_viewers (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.location_shares(id) on delete cascade,
  viewer_id text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (share_id, viewer_id)
);
create index if not exists location_share_viewers_look_idx
  on public.location_share_viewers(share_id, last_seen);
alter table public.location_share_viewers enable row level security;
-- No policies: only the two security-definer RPCs below may read/write it.

create or replace function public.ping_share_viewer(p_token text, p_viewer_id text, p_ttl_seconds integer default 15)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_share uuid;
begin
  if p_viewer_id is null or length(p_viewer_id) not between 8 and 64 then
    raise exception 'invalid_viewer';
  end if;
  select id into v_share
  from public.location_shares
  where token = p_token and stopped_at is null and expires_at > now();
  if v_share is null then return false; end if;
  -- Opportunistic cleanup of heartbeats that have aged out (safe on every ping).
  delete from public.location_share_viewers
  where last_seen < now() - make_interval(secs => p_ttl_seconds * 2);
  insert into public.location_share_viewers (share_id, viewer_id, last_seen)
  values (v_share, p_viewer_id, now())
  on conflict (share_id, viewer_id)
  do update set last_seen = excluded.last_seen;
  return true;
end $$;
grant execute on function public.ping_share_viewer(text, text, integer) to anon, authenticated;

create or replace function public.get_share_viewer_count(p_token text, p_ttl_seconds integer default 15)
returns integer language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  -- Only the share owner (auth.uid()) may see who is watching their share.
  select count(*) into v_count
  from public.location_shares s
  join public.location_share_viewers v on v.share_id = s.id
  where s.token = p_token and s.user_id = auth.uid()
    and v.last_seen >= now() - make_interval(secs => p_ttl_seconds);
  return coalesce(v_count, 0);
end $$;
grant execute on function public.get_share_viewer_count(text, integer) to authenticated;