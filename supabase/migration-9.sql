-- ============================================================
-- LifeOS — migration 9 (additive)
-- Share links: "1 view only" and "unlimited" modes.
-- Safe to re-run.
-- ============================================================

-- unlimited = link can be viewed many times and never expires by time.
-- Existing shares keep the default (single-use).
alter table public.calendar_shares add column if not exists unlimited boolean not null default false;

-- Updated RPC: single-use links are consumed on first read (10-min grace for
-- accidental refreshes); unlimited links stay readable forever.
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
  share_label text,
  is_unlimited boolean
)
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_owner uuid;
  v_label text;
  v_unlimited boolean;
begin
  select cs.id, cs.user_id, cs.label, cs.unlimited into v_id, v_owner, v_label, v_unlimited
  from public.calendar_shares cs
  where cs.token = p_token
    and (cs.unlimited or cs.used_at is null)
    and (cs.expires_at is null or cs.expires_at > now());

  if v_id is null then
    raise exception 'share_not_found' using errcode = 'P0001';
  end if;

  if not v_unlimited then
    update public.calendar_shares
       set used_at = now()
     where calendar_shares.id = v_id
       and (calendar_shares.used_at is null or calendar_shares.used_at < now() - interval '10 minutes');
  end if;

  return query
    select e.id, e.title, e.start_at, e.end_at,
           e.all_day, e.color, e.calendar_name, e.source,
           p.name, p.email, v_label, v_unlimited
    from public.calendar_events e
    left join public.profiles p on p.id = v_owner
    where e.user_id = v_owner
      and e.start_at >= date_trunc('day', now())
      and e.start_at <= now() + interval '365 days'
    order by e.start_at asc;
end $$;

grant execute on function public.get_shared_calendar(text) to anon, authenticated;
