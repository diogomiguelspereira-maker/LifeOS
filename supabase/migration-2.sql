-- ============================================================
-- LifeOS — migration 2 (additive)
-- Safe to run on an existing LifeOS database: adds new tables
-- only. No drops, no data loss. Run in the Supabase SQL Editor.
-- ============================================================

-- ---------- helper (updated_at trigger) ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- net worth snapshots ----------
create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  net_worth numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists net_worth_user_idx on public.net_worth_snapshots(user_id, date);

-- ---------- recurring income (salary, freelance, bonuses) ----------
create table if not exists public.income_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null default 0,
  day_of_month integer not null default 1, -- 1-28 (use 28 for end-of-month)
  type text not null default 'salary', -- salary | freelance | bonus | other
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists income_schedule_user_idx on public.income_schedule(user_id);

-- ---------- financial challenges ----------
create table if not exists public.financial_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'custom', -- no_purchases | save_amount | cook_home | no_delivery | custom
  target numeric(12,2) not null default 0,
  unit text not null default 'days',
  start_date date not null default current_date,
  end_date date not null default current_date + 7,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists challenges_user_idx on public.financial_challenges(user_id);

-- ---------- shopping ----------
create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'groceries', -- groceries | electronics | clothes | home | travel
  created_at timestamptz not null default now()
);
create index if not exists shopping_lists_user_idx on public.shopping_lists(user_id);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_id uuid references public.shopping_lists(id) on delete cascade,
  name text not null,
  quantity numeric(8,2) not null default 1,
  checked boolean not null default false,
  price numeric(12,2),
  priority text not null default 'medium', -- critical | high | medium | low
  created_at timestamptz not null default now()
);
create index if not exists shopping_items_list_idx on public.shopping_items(list_id);

-- ---------- wishlist ----------
create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  price numeric(12,2),
  url text,
  priority text not null default 'medium',
  category text,
  desired_date date,
  notes text,
  purchased boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists wishlist_user_idx on public.wishlist_items(user_id);

-- ---------- focus / pomodoro sessions ----------
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  kind text not null default 'pomodoro', -- pomodoro | focus | deep_work
  started_at timestamptz not null default now(),
  minutes integer not null default 25,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists focus_sessions_user_idx on public.focus_sessions(user_id, started_at);

-- ---------- routines (morning / night / workday) ----------
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  time_of_day text not null default 'morning', -- morning | night | any
  icon text not null default '⏰',
  color text not null default '#6366f1',
  items jsonb not null default '[]'::jsonb, -- [{text, minutes}]
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists routines_user_idx on public.routines(user_id);
create trigger if not exists routines_set_updated_at before update on public.routines
  for each row execute function public.set_updated_at();

-- ---------- wellness ----------
create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  hours numeric(4,2) not null default 0,
  quality integer, -- 1-5
  bedtime time,
  wake_time time,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists sleep_user_idx on public.sleep_logs(user_id, date);

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  glasses integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists water_user_idx on public.water_logs(user_id, date);

create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  type text not null default 'gym', -- gym | running | cycling | walking | sports | other
  duration_minutes integer not null default 30,
  calories integer,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists exercise_user_idx on public.exercise_logs(user_id, date);

create table if not exists public.wellness_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  mood integer, -- 1-5
  energy integer, -- 1-5
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists wellness_user_idx on public.wellness_logs(user_id, date);

-- ---------- career ----------
create table if not exists public.career_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text,
  timeline text,
  status text not null default 'active', -- active | achieved | archived
  created_at timestamptz not null default now()
);
create index if not exists career_goals_user_idx on public.career_goals(user_id);

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  level integer not null default 1, -- 1-5
  target_level integer not null default 3,
  category text,
  created_at timestamptz not null default now()
);
create index if not exists skills_user_idx on public.skills(user_id);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company text not null,
  position text not null,
  applied_date date not null default current_date,
  status text not null default 'applied', -- applied | interview | offer | rejected | withdrawn
  interview_date date,
  salary numeric(12,2),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists applications_user_idx on public.job_applications(user_id);

-- ---------- learning ----------
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  author text,
  status text not null default 'want', -- want | reading | finished
  rating integer, -- 1-5
  started_at date,
  finished_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists books_user_idx on public.books(user_id);
create trigger if not exists books_set_updated_at before update on public.books
  for each row execute function public.set_updated_at();

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  platform text,
  progress integer not null default 0, -- 0-100
  hours integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists courses_user_idx on public.courses(user_id);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  minutes integer not null default 30,
  subject text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists study_user_idx on public.study_sessions(user_id, date);

-- ---------- travel ----------
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  destination text not null,
  start_date date,
  end_date date,
  budget numeric(12,2),
  status text not null default 'planned', -- planned | booked | completed
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trips_user_idx on public.trips(user_id);
create trigger if not exists trips_set_updated_at before update on public.trips
  for each row execute function public.set_updated_at();

create table if not exists public.trip_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  type text not null default 'activity', -- flight | hotel | activity | restaurant | packing | other
  title text not null,
  cost numeric(12,2),
  datetime timestamptz,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists trip_items_trip_idx on public.trip_items(trip_id);

-- ---------- social / shared expenses ----------
create table if not exists public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null default 0,
  paid_by text not null default 'eu',
  participants text[] not null default '{}',
  date date not null default current_date,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shared_expenses_user_idx on public.shared_expenses(user_id);

-- ---------- digital life & documents ----------
create table if not exists public.digital_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null default 'device', -- device | license | domain | service | cloud
  name text not null,
  details text,
  purchase_date date,
  expiry_date date,
  cost numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists digital_assets_user_idx on public.digital_assets(user_id);
create trigger if not exists digital_assets_set_updated_at before update on public.digital_assets
  for each row execute function public.set_updated_at();

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'outros', -- passport | id | license | insurance | contract | other
  number text,
  expiry_date date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists documents_user_idx on public.documents(user_id);

-- ---------- AI memory ----------
create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null default 'preferences', -- preferences | goals | routines | important_dates | projects
  key text not null,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_memory_user_idx on public.ai_memory(user_id);
create trigger if not exists ai_memory_set_updated_at before update on public.ai_memory
  for each row execute function public.set_updated_at();

-- ---------- subscriptions: cancelation tracker ----------
alter table public.subscriptions add column if not exists to_cancel boolean not null default false;

-- ============================================================
-- Row Level Security (all new tables private to owner)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'net_worth_snapshots','income_schedule','financial_challenges','shopping_lists',
    'shopping_items','wishlist_items','focus_sessions','routines','sleep_logs',
    'water_logs','exercise_logs','wellness_logs','career_goals','skills',
    'job_applications','books','courses','study_sessions','trips','trip_items',
    'shared_expenses','digital_assets','documents','ai_memory'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;
