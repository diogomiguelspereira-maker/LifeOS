"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api, currentMonthTransactions, moneyTotals, spendingByCategory } from "@/lib/api";
import { Card, CardHeader, EmptyState, Progress, Segmented, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney, monthKey, percent } from "@/lib/format";
import type { Category, FocusSession, HabitCompletion, SavingsGoal, Subscription, Task, Transaction, Trip } from "@/lib/types";

type View = "month" | "year";

export default function ReviewPage() {
  const { t, currency, profile } = useApp();
  const supabase = useSupabase();
  const [view, setView] = useState<View>("month");
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState<Transaction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [focus, setFocus] = useState<FocusSession[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [cats, setCats] = useState<Category[]>([]);

  const load = useCallback(async () => {
    const [tx_, tasks_, goals_, subs_, foc_, comps_, trips_, cats_] = await Promise.all([
      api.allTransactions(supabase, 300),
      api.tasks(supabase),
      api.goals(supabase),
      api.subscriptions(supabase),
      api.focusSessions(supabase),
      api.completions(supabase),
      api.trips(supabase),
      api.categories(supabase),
    ]);
    setTx(tx_);
    setTasks(tasks_);
    setGoals(goals_);
    setSubs(subs_);
    setFocus(foc_);
    setCompletions(comps_);
    setTrips(trips_);
    setCats(cats_);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date();
  const month = monthKey(now);
  const monthTx = useMemo(() => currentMonthTransactions(tx), [tx]);
  const totals = moneyTotals([], monthTx, profile);

  const tasksDoneMonth = tasks.filter((x) => x.completed_at && x.completed_at.slice(0, 7) === month.slice(0, 7)).length;
  const focusMinutes = focus
    .filter((f) => new Date(f.started_at).getFullYear() === now.getFullYear() && new Date(f.started_at).getMonth() === now.getMonth())
    .reduce((s, f) => s + f.minutes, 0);
  const habitsDone = completions.filter((c) => c.date.startsWith(month.slice(0, 7))).length;
  const activeGoals = goals.filter((g) => g.current_amount < g.target_amount);
  const goalPct = goals.length ? percent(goals.reduce((s, g) => s + g.current_amount, 0), goals.reduce((s, g) => s + g.target_amount, 0)) : 0;

  const nextBills = subs
    .filter((s) => s.next_billing_date && s.next_billing_date >= now.toISOString().slice(0, 10))
    .sort((a, b) => a.next_billing_date!.localeCompare(b.next_billing_date!))
    .slice(0, 6);

  // monthly reset checklist (#49)
  const resetChecklist = [
    { ok: totals.monthlyIncome > 0, label: "Rendimento do mês registado" },
    { ok: tasksDoneMonth > 0, label: "Pelo menos 1 tarefa concluída" },
    { ok: habitsDone > 0, label: "Hábitos a andar" },
    { ok: activeGoals.length > 0, label: "Objetivo(s) ativo(s)" },
    { ok: nextBills.length > 0, label: "Contas do mês identificadas" },
  ];

  // year timeline (#50)
  const year = new Date().getFullYear();
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const yearEvents = useMemo(() => {
    const yr = new Date().getFullYear();
    const evs: { month: number; icon: string; text: string }[] = [];
    for (const g of goals.filter((x) => x.deadline && new Date(x.deadline).getFullYear() === yr)) {
      evs.push({ month: new Date(g.deadline!).getMonth(), icon: "🎯", text: `${g.name} (meta ${formatMoney(g.target_amount, currency)})` });
    }
    for (const tr of trips.filter((x) => x.start_date && new Date(x.start_date).getFullYear() === yr)) {
      evs.push({ month: new Date(tr.start_date!).getMonth(), icon: "✈️", text: tr.destination });
    }
    return evs.slice().sort((a, b) => a.month - b.month);
  }, [goals, trips, currency]);

  const byCat = useMemo(() => spendingByCategory(monthTx, cats).slice(0, 4), [monthTx, cats]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t.reviews.title} />
      <Segmented<View>
        value={view}
        onChange={setView}
        options={[
          { value: "month", label: `📅 ${t.reviews.month}` },
          { value: "year", label: `🗓️ ${t.reviews.year}` },
        ]}
      />

      {view === "month" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Rendimento", value: formatMoney(totals.monthlyIncome, currency), tone: "text-emerald-400" },
              { label: "Gasto", value: formatMoney(totals.monthlyExpenses, currency), tone: "text-rose-400" },
              { label: "Tarefas feitas", value: `${tasksDoneMonth}`, tone: "text-indigo-400" },
              { label: "Foco", value: `${focusMinutes}m`, tone: "text-sky-400" },
              { label: "Hábitos", value: `${habitsDone}`, tone: "text-amber-400" },
              { label: "Objetivos", value: `${goalPct}%`, tone: "text-violet-400" },
            ].map((s) => (
              <Card key={s.label} className="px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{s.label}</p>
                <p className={`mt-1 text-lg font-bold ${s.tone}`}>{s.value}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Contas dos próximos 30 dias" />
              {nextBills.length === 0 ? (
                <p className="py-2 text-sm text-zinc-500">Sem contas a vencer 🎉</p>
              ) : (
                <div className="space-y-1.5">
                  {nextBills.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-700 dark:text-zinc-200">{s.name}</span>
                      <span className="text-xs text-zinc-500">
                        {formatMoney(s.amount, currency)} · {s.next_billing_date}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {byCat.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Top categorias de gasto</p>
                  <div className="space-y-1">
                    {byCat.map((c) => (
                      <div key={c.category} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                        <span className="text-zinc-500 dark:text-zinc-400">{c.category}</span>
                        <span className="ml-auto font-medium text-zinc-700 dark:text-zinc-200">{formatMoney(c.value, currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Arranque do mês" subtitle="lista de verificação" />
              <div className="space-y-2">
                {resetChecklist.map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${c.ok ? "bg-emerald-500/20 text-emerald-400" : "border border-white/20 text-zinc-600"}`}>
                      {c.ok ? "✓" : "·"}
                    </span>
                    <span className={c.ok ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-500"}>{c.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Progresso geral dos objetivos</span>
                  <span className="text-zinc-500">{goalPct}%</span>
                </div>
                <Progress value={goalPct} />
              </div>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardHeader title={t.reviews.yearTitle} subtitle={`${year}`} />
          {yearEvents.length === 0 ? (
            <EmptyState icon="🗓️" title={t.reviews.yearEmpty} />
          ) : (
            <div className="relative space-y-3 pl-4">
              <div className="absolute bottom-1 left-[5px] top-1 w-px bg-white/10" />
              {monthNames.map((mn, mi) => {
                const evs = yearEvents.filter((e) => e.month === mi);
                if (!evs.length) return null;
                return (
                  <div key={mi} className="relative">
                    <span className="absolute -left-4 top-1 h-2.5 w-2.5 rounded-full bg-indigo-400 ring-4 ring-indigo-500/20" />
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{mn}</p>
                    <div className="mt-1 space-y-1">
                      {evs.map((e, i) => (
                        <p key={i} className="text-sm text-zinc-700 dark:text-zinc-200">
                          {e.icon} {e.text}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {activeGoals.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Objetivos ativos</p>
              <div className="space-y-2">
                {activeGoals.map((g) => (
                  <div key={g.id}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-zinc-600 dark:text-zinc-300">{g.icon} {g.name}</span>
                      <span className="text-zinc-500">{percent(g.current_amount, g.target_amount)}%</span>
                    </div>
                    <Progress value={percent(g.current_amount, g.target_amount)} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
