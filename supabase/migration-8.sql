-- ============================================================
-- LifeOS — migration 8 (additive)
-- Bank sync (GoCardless Bank Account Data) + automation hub (n8n).
-- Safe to re-run. No drops of existing tables, no data loss.
-- ============================================================

-- ---------- Linked bank accounts (GoCardless) ----------
create table if not exists public.bank_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  institution_id text not null,
  institution_name text not null,
  requisition_id text not null unique,
  status text not null default 'pending', -- pending | linked | failed
  accounts jsonb not null default '[]'::jsonb, -- [{id, iban, currency, owner}]
  lifeos_account_id uuid references public.accounts(id) on delete set null,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists bank_links_user_idx on public.bank_links(user_id);

-- ---------- external_id on transactions (dedup bank imports) ----------
alter table public.transactions add column if not exists external_id text;
create unique index if not exists transactions_user_external_idx
  on public.transactions(user_id, external_id) where external_id is not null;

-- ---------- Integration tokens (n8n / webhooks / automation) ----------
create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists integration_tokens_user_idx on public.integration_tokens(user_id);

-- ============================================================
-- Row Level Security (owner only)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['bank_links', 'integration_tokens']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "own rows" on public.%I;', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;
