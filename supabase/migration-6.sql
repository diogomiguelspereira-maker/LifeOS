-- ============================================================
-- LifeOS — migration 6 (additive)
-- Automatic routines (#20): extends the existing `routines` table
-- (added in migration 2, previously unused by the UI) with day +
-- start-time fields, converts legacy JSONB `items` into steps, and
-- adds daily completions. Safe to re-run. No data loss.
-- ============================================================

-- Extend the existing routines table (keep icon/color, add days + start_time)
alter table public.routines add column if not exists days text not null default 'daily';      -- daily | weekdays | weekend
alter table public.routines add column if not exists start_time text not null default '08:00'; -- HH:MM local

-- ---------- routine steps ----------
create table if not exists public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  title text not null,
  time text not null default '08:00',        -- HH:MM local
  duration_minutes integer not null default 15,
  "order" integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists routine_steps_routine_idx on public.routine_steps(routine_id, "order");

-- ---------- daily completions ----------
create table if not exists public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  step_id uuid not null references public.routine_steps(id) on delete cascade,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (step_id, date)
);
create index if not exists routine_completions_date_idx on public.routine_completions(date);

-- Convert legacy items JSONB [{text, minutes}] into steps (one-time, idempotent)
do $$
declare r record; acc integer; idx integer; it jsonb; step_time text;
begin
  for r in select id, user_id, start_time, items from public.routines
            where jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0
  loop
    if not exists (select 1 from public.routine_steps where routine_id = r.id) then
      acc := 0; idx := 0;
      for it in select * from jsonb_array_elements(r.items)
      loop
        step_time := to_char((to_timestamp(r.start_time, 'HH24:MI') + (acc || ' minutes')::interval), 'HH24:MI');
        insert into public.routine_steps (user_id, routine_id, title, time, duration_minutes, "order")
        values (r.user_id, r.id, coalesce(it->>'text', 'Passo'), step_time,
                coalesce((it->>'minutes')::int, 15), idx);
        acc := acc + coalesce((it->>'minutes')::int, 15);
        idx := idx + 1;
      end loop;
    end if;
  end loop;
end $$;

-- ============================================================
-- Row Level Security (owner only) — for the new tables only;
-- `routines` already has RLS from migration 2.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['routine_steps', 'routine_completions']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "own rows" on public.%I;', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;
