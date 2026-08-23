-- ============================================================
-- LifeOS — migration 11
-- Wishlist: product images + sharing (like calendar shares)
-- Safe to re-run. No drops, no data loss.
-- ============================================================

-- Add image column for product thumbnails scraped from URLs
alter table public.wishlist_items add column if not exists image text;

-- ---------- Wishlist shares ----------
create table if not exists public.wishlist_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique,
  label text,
  expires_at timestamptz,
  used_at timestamptz,
  unlimited boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists wishlist_shares_user_idx on public.wishlist_shares(user_id);

alter table public.wishlist_shares enable row level security;
drop policy if exists "own rows" on public.wishlist_shares;
create policy "own rows" on public.wishlist_shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Public read (no account needed) ----------
-- SECURITY DEFINER so anyone with a valid token can view a shared wishlist.
-- Only non-purchased items are shown. Privacy: name, price, image, url, category.
create or replace function public.get_shared_wishlist(p_token text)
returns table (
  id uuid,
  name text,
  price numeric,
  image text,
  url text,
  category text,
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
  select ws.id, ws.user_id, ws.label, ws.unlimited into v_id, v_owner, v_label, v_unlimited
  from public.wishlist_shares ws
  where ws.token = p_token
    and (ws.unlimited or ws.used_at is null)
    and (ws.expires_at is null or ws.expires_at > now());

  if v_id is null then
    raise exception 'share_not_found' using errcode = 'P0001';
  end if;

  if not v_unlimited then
    update public.wishlist_shares
       set used_at = now()
     where wishlist_shares.id = v_id
       and (wishlist_shares.used_at is null or wishlist_shares.used_at < now() - interval '10 minutes');
  end if;

  return query
    select wi.id, wi.name, wi.price, wi.image, wi.url, wi.category,
           p.name, p.email, v_label, v_unlimited
    from public.wishlist_items wi
    left join public.profiles p on p.id = v_owner
    where wi.user_id = v_owner
      and wi.purchased = false
    order by wi.created_at desc;
end $$;

grant execute on function public.get_shared_wishlist(text) to anon, authenticated;