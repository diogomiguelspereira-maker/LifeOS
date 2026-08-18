-- ============================================================
-- LifeOS — migration 5 (additive)
-- Connected projects (#40-42): budgets + linked expenses/goals.
-- Safe to re-run. Only adds columns + indexes.
-- ============================================================

alter table public.projects add column if not exists budget numeric(12,2);
alter table public.transactions add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.savings_goals add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists transactions_project_idx on public.transactions(project_id);
create index if not exists savings_goals_project_idx on public.savings_goals(project_id);
