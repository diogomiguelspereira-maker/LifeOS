-- ============================================================
-- LifeOS — migration 3 (additive)
-- Google Calendar integration + AI action log (undo support).
-- Safe to re-run. No drops of existing tables, no data loss.
-- ============================================================

-- ---------- Google OAuth tokens (encrypted at rest by the app) ----------
create table if not exists public.google_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  access_token text not null,          -- AES-256-GCM encrypted
  refresh_token text not null,         -- AES-256-GCM encrypted
  expires_at timestamptz not null,
  google_email text,
  calendar_id text not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
create index if not exists google_tokens_user_idx on public.google_tokens(user_id);
drop trigger if exists google_tokens_set_updated_at on public.google_tokens;
create trigger google_tokens_set_updated_at before update on public.google_tokens
  for each row execute function public.set_updated_at();

-- ---------- AI action log (undo / review) ----------
create table if not exists public.ai_action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action text not null,                -- e.g. create_event, create_task, plan
  summary text not null,               -- human readable: "Created 4 events: ..."
  undo_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_action_log_user_idx on public.ai_action_log(user_id, created_at);

-- ============================================================
-- Row Level Security (owner only)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['google_tokens', 'ai_action_log']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "own rows" on public.%I;', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;
