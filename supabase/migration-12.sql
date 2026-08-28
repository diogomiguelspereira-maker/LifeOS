-- LifeOS migration 12: expiring live-location sharing
create table if not exists public.location_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  lat double precision,
  lon double precision,
  accuracy double precision,
  updated_at timestamptz,
  expires_at timestamptz not null,
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists location_shares_token_idx on public.location_shares(token);
create index if not exists location_shares_user_idx on public.location_shares(user_id);
alter table public.location_shares enable row level security;
drop policy if exists "own location shares" on public.location_shares;
create policy "own location shares" on public.location_shares for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.create_location_share(p_minutes integer)
returns text language plpgsql security definer set search_path = public
as $$
declare v_token text;
begin
  if auth.uid() is null or p_minutes not between 5 and 240 then raise exception 'invalid_request'; end if;
  update public.location_shares set stopped_at = now() where user_id = auth.uid() and stopped_at is null;
  v_token := encode(gen_random_bytes(24), 'base64');
  v_token := replace(replace(replace(v_token, '/', '_'), '+', '-'), '=', '');
  insert into public.location_shares(user_id, token, expires_at) values (auth.uid(), v_token, now() + make_interval(mins => p_minutes));
  return v_token;
end $$;
grant execute on function public.create_location_share(integer) to authenticated;

create or replace function public.update_location_share(p_token text, p_lat double precision, p_lon double precision, p_accuracy double precision)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  update public.location_shares set lat = p_lat, lon = p_lon, accuracy = p_accuracy, updated_at = now()
  where token = p_token and stopped_at is null and expires_at > now();
  return found;
end $$;
grant execute on function public.update_location_share(text, double precision, double precision, double precision) to authenticated;

create or replace function public.stop_location_share(p_token text)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  update public.location_shares set stopped_at = now() where token = p_token and user_id = auth.uid() and stopped_at is null;
  return found;
end $$;
grant execute on function public.stop_location_share(text) to authenticated;

create or replace function public.get_shared_location(p_token text)
returns table (lat double precision, lon double precision, accuracy double precision, updated_at timestamptz, expires_at timestamptz, owner_name text)
language plpgsql security definer set search_path = public
as $$
begin
  return query select s.lat, s.lon, s.accuracy, s.updated_at, s.expires_at, p.name
  from public.location_shares s left join public.profiles p on p.id = s.user_id
  where s.token = p_token and s.stopped_at is null and s.expires_at > now();
end $$;
grant execute on function public.get_shared_location(text) to anon, authenticated;
