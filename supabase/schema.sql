-- ============================================================
-- LifeOS — database schema (idempotent)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Safe to run multiple times: drops the LifeOS tables and recreates
-- them from scratch. All LifeOS tables are empty until users sign up.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- drop previous LifeOS tables (legacy or stale) ----------
drop table if exists public.habit_completions cascade;
drop table if exists public.habits cascade;
drop table if exists public.ai_messages cascade;
drop table if exists public.ai_conversations cascade;
drop table if exists public.notifications cascade;
drop table if exists public.contacts cascade;
drop table if exists public.calendar_events cascade;
drop table if exists public.journal_entries cascade;
drop table if exists public.notes cascade;
drop table if exists public.tasks cascade;
drop table if exists public.projects cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.savings_goals cascade;
drop table if exists public.budgets cascade;
drop table if exists public.transactions cascade;
drop table if exists public.categories cascade;
drop table if exists public.accounts cascade;
drop table if exists public.profiles cascade;

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  age_range text,
  country text,
  currency text not null default 'EUR',
  monthly_income numeric(12,2) not null default 0,
  typical_expenses numeric(12,2) not null default 0,
  savings numeric(12,2) not null default 0,
  work_schedule text,
  theme text not null default 'dark',
  language text not null default 'pt',
  week_start text not null default 'monday',
  onboarding_completed boolean not null default false,
  widget_layout jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- accounts ----------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'bank', -- cash | bank | savings | investment | credit | crypto | loan
  balance numeric(12,2) not null default 0,
  color text not null default '#6366f1',
  icon text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_user_id_idx on public.accounts(user_id);
create trigger accounts_set_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------- categories ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'expense', -- expense | income
  icon text,
  color text not null default '#a5b4fc',
  monthly_budget numeric(12,2),
  budget_type text, -- needs | wants (NULL para categorias de rendimento)
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);
create index categories_user_id_idx on public.categories(user_id);

-- ---------- transactions ----------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(12,2) not null, -- positive = income, negative = expense
  description text not null default '',
  merchant text,
  date date not null default current_date,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now()
);
create index transactions_user_date_idx on public.transactions(user_id, date desc);
create index transactions_category_idx on public.transactions(category_id);

-- ---------- monthly budget plan (50/30/20 style) ----------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null, -- first day of the month
  needs_limit numeric(12,2) not null default 0,
  wants_limit numeric(12,2) not null default 0,
  savings_target numeric(12,2) not null default 0,
  investments_target numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);
create trigger budgets_set_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();

-- ---------- savings goals ----------
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null,
  current_amount numeric(12,2) not null default 0,
  deadline date,
  monthly_contribution numeric(12,2) not null default 0,
  icon text not null default '🎯',
  color text not null default '#6366f1',
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index savings_goals_user_idx on public.savings_goals(user_id);

-- ---------- subscriptions ----------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null default 0,
  billing_cycle text not null default 'monthly', -- monthly | yearly | weekly
  next_billing_date date,
  category text,
  is_active boolean not null default true,
  is_unused boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions(user_id);

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#6366f1',
  status text not null default 'active', -- active | completed | archived
  created_at timestamptz not null default now()
);
create index projects_user_idx on public.projects(user_id);

-- ---------- tasks ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  due_date timestamptz,
  priority text not null default 'medium', -- low | medium | high
  status text not null default 'todo', -- todo | in_progress | done
  tags text[] not null default '{}',
  project_id uuid references public.projects(id) on delete set null,
  estimated_minutes integer,
  recurrence text, -- none | daily | weekly | monthly | yearly
  reminder_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_status_idx on public.tasks(user_id, status);
create index tasks_user_due_idx on public.tasks(user_id, due_date);
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------- habits ----------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '🔥',
  color text not null default '#6366f1',
  target_per_week integer not null default 3,
  created_at timestamptz not null default now()
);
create index habits_user_idx on public.habits(user_id);

create table public.habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  date date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);
create index habit_completions_user_idx on public.habit_completions(user_id, date);

-- ---------- notes & journal ----------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Sem título',
  content text not null default '',
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_idx on public.notes(user_id);
create trigger notes_set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  content text not null,
  mood text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index journal_user_date_idx on public.journal_entries(user_id, entry_date desc);

-- ---------- calendar ----------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  color text not null default '#6366f1',
  calendar_name text not null default 'LifeOS',
  source text not null default 'lifeos', -- lifeos | google
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calendar_user_start_idx on public.calendar_events(user_id, start_at);
create trigger calendar_events_set_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- ---------- contacts (People) ----------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  relationship text,
  phone text,
  email text,
  birthday date,
  last_contacted date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_user_idx on public.contacts(user_id);

-- ---------- notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'info', -- info | money | task | calendar | success | warning
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_read_idx on public.notifications(user_id, read);

-- ---------- AI conversations ----------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Nova',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations(user_id);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null, -- user | assistant
  content text not null,
  created_at timestamptz not null default now()
);
create index ai_messages_conv_idx on public.ai_messages(conversation_id);

-- ============================================================
-- Row Level Security — every table is private to its owner
-- ============================================================
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.subscriptions enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.habits enable row level security;
alter table public.habit_completions enable row level security;
alter table public.notes enable row level security;
alter table public.journal_entries enable row level security;
alter table public.calendar_events enable row level security;
alter table public.contacts enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array[
    'accounts','categories','transactions','budgets','savings_goals','subscriptions',
    'projects','tasks','habits','habit_completions','notes','journal_entries',
    'calendar_events','contacts','notifications','ai_conversations','ai_messages'
  ]
  loop
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;

-- ============================================================
-- Provisioning: seeds profile + accounts + categories
-- (used by the signup trigger AND to self-heal older accounts)
-- ============================================================
create or replace function public.seed_new_user(uid uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  select uid, au.email, coalesce(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1))
  from auth.users au
  where au.id = uid
  on conflict (id) do nothing;

  insert into public.accounts (user_id, name, type, color, icon) values
    (uid, 'Cash', 'cash', '#34d399', '💵'),
    (uid, 'Bank account', 'bank', '#6366f1', '🏦'),
    (uid, 'Savings', 'savings', '#f59e0b', '🐷');

  insert into public.categories (user_id, name, type, icon, color, budget_type) values
    (uid, 'Food', 'expense', '🛒', '#f97316', 'needs'),
    (uid, 'Restaurants', 'expense', '🍽️', '#ef4444', 'wants'),
    (uid, 'Transport', 'expense', '🚌', '#3b82f6', 'needs'),
    (uid, 'Shopping', 'expense', '🛍️', '#ec4899', 'wants'),
    (uid, 'Entertainment', 'expense', '🎬', '#8b5cf6', 'wants'),
    (uid, 'Gaming', 'expense', '🎮', '#a855f7', 'wants'),
    (uid, 'Subscriptions', 'expense', '🔁', '#06b6d4', 'wants'),
    (uid, 'Rent', 'expense', '🏠', '#14b8a6', 'needs'),
    (uid, 'Bills', 'expense', '🧾', '#f59e0b', 'needs'),
    (uid, 'Travel', 'expense', '✈️', '#0ea5e9', 'wants'),
    (uid, 'Education', 'expense', '📚', '#6366f1', 'needs'),
    (uid, 'Technology', 'expense', '💻', '#22d3ee', 'wants'),
    (uid, 'Health', 'expense', '💊', '#10b981', 'needs'),
    (uid, 'Other', 'expense', '📦', '#94a3b8', 'wants'),
    (uid, 'Salary', 'income', '💼', '#22c55e', NULL),
    (uid, 'Freelance', 'income', '🧑‍💻', '#84cc16', NULL),
    (uid, 'Bonus', 'income', '🎁', '#facc15', NULL),
    (uid, 'Other income', 'income', '💰', '#a3e635', NULL);
end $$;

grant execute on function public.seed_new_user(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.seed_new_user(new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
