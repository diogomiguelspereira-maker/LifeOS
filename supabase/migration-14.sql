-- LifeOS migration 14: location-share history / trail
-- Every update to a live share now also logs a point here (throttled to ~30s),
-- so the sharer can look back at where they were during past shares.
create table if not exists public.location_share_points (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.location_shares(id) on delete cascade,
  lat double precision not null,
  lon double precision not null,
  accuracy double precision,
  created_at timestamptz not null default now()
);
create index if not exists location_share_points_share_idx
  on public.location_share_points(share_id, created_at desc);
alter table public.location_share_points enable row level security;
drop policy if exists "own share points" on public.location_share_points;
create policy "own share points" on public.location_share_points
  for select
  using (
    exists (select 1 from public.location_shares s where s.id = share_id and s.user_id = auth.uid())
  );

-- Log a trail point whenever the share's location updates, but at most one every
-- 30s per share so history stays useful without flooding the table. The function
-- is security definer, so it writes to points without relying on RLS.
create or replace function public.update_location_share(p_token text, p_lat double precision, p_lon double precision, p_accuracy double precision)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  update public.location_shares set lat = p_lat, lon = p_lon, accuracy = p_accuracy, updated_at = now()
  where token = p_token and stopped_at is null and expires_at > now();
  if not found then return false; end if;
  insert into public.location_share_points (share_id, lat, lon, accuracy)
  select s.id, p_lat, p_lon, p_accuracy
  from public.location_shares s
  where s.token = p_token
    and not exists (
      select 1 from public.location_share_points sp
      where sp.share_id = s.id and sp.created_at > now() - interval '30 seconds'
    );
  return true;
end $$;
grant execute on function public.update_location_share(text, double precision, double precision, double precision) to authenticated;