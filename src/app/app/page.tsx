"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Check, ChevronRight, Eye, EyeOff, Settings2, Sparkles } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useApp, useSupabase } from "@/lib/app-context";
import { api, currentMonthTransactions, moneyTotals, spendingByCategory } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Modal,
  Progress,
  Skeleton,
  Switch,
} from "@/components/ui";
import { formatDate, formatMoney, greeting, monthKey, percent } from "@/lib/format";
import type { Account, CalendarEvent, Category, Habit, HabitCompletion, SavingsGoal, Subscription, Task, Transaction, WidgetDef } from "@/lib/types";
import { cn } from "@/lib/cn";

const DEFAULT_WIDGETS: WidgetDef[] = [
  { id: "briefing", visible: true },
  { id: "next", visible: true },
  { id: "money", visible: true },
  { id: "tasks", visible: true },
  { id: "events", visible: true },
  { id: "goals", visible: true },
  { id: "habits", visible: true },
  { id: "bills", visible: true },
  { id: "chart", visible: true },
];

// Modes: which widgets are shown per mode (progressive disclosure)
const MODE_WIDGETS: Record<string, string[]> = {
  all: ["briefing", "next", "money", "tasks", "events", "goals", "habits", "bills", "chart"],
  work: ["briefing", "next", "tasks", "events"],
  finance: ["briefing", "next", "money", "bills", "chart", "goals"],
  study: ["briefing", "next", "tasks", "goals"],
  weekend: ["briefing", "next", "events", "habits"],
  travel: ["briefing", "next", "money", "goals"],
};

type Mode = "all" | "work" | "finance" | "study" | "weekend" | "travel";

export default function DashboardPage() {
  const { t, currency, profile } = useApp();
  const supabase = useSupabase();
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [layout, setLayout] = useState<WidgetDef[]>(DEFAULT_WIDGETS);
  const [mode, setMode] = useState<Mode>("all");

  const now = new Date();

  const load = useCallback(async () => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const weekEnd = new Date(dayStart.getTime() + 7 * 86400000);
    const [tx_, acc, cats, tasks_, evs, goals_, subs_, habs_, comps_] = await Promise.all([
      api.allTransactions(supabase, 300),
      api.accounts(supabase),
      api.categories(supabase),
      api.tasks(supabase),
      api.events(supabase, dayStart.toISOString(), weekEnd.toISOString()),
      api.goals(supabase),
      api.subscriptions(supabase),
      api.habits(supabase),
      api.completions(supabase),
    ]);
    setTx(tx_);
    setAccounts(acc);
    setCategories(cats);
    setTasks(tasks_);
    setEvents(evs);
    setGoals(goals_);
    setSubs(subs_);
    setHabits(habs_);
    setCompletions(comps_);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    if (profile?.widget_layout?.length) setLayout(profile.widget_layout);
  }, [load, profile?.widget_layout]);

  // generate smart notifications (deduped per day)
  useEffect(() => {
    if (loading || !profile) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const candidates: { title: string; body: string | null; type: string }[] = [];

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    tasks
      .filter((task) => task.status !== "done" && task.due_date && new Date(task.due_date) >= dayStart && new Date(task.due_date) < dayEnd)
      .forEach((task) => candidates.push({ title: `Tarefa hoje: ${task.title}`, body: null, type: "task" }));

    subs
      .filter((s) => s.next_billing_date && new Date(s.next_billing_date) >= dayStart && new Date(s.next_billing_date) <= new Date(dayStart.getTime() + 3 * 86400000))
      .forEach((s) => candidates.push({ title: `Pagamento: ${s.name}`, body: `${formatMoney(s.amount, currency)} — ${s.next_billing_date}`, type: "money" }));

    goals
      .filter((g) => g.deadline && new Date(g.deadline) >= dayStart && new Date(g.deadline) <= new Date(dayStart.getTime() + 30 * 86400000))
      .forEach((g) => candidates.push({ title: `Objetivo: ${g.name}`, body: `Prazo em ${new Date(g.deadline!).toLocaleDateString("pt-PT")}`, type: "warning" }));

    (async () => {
      for (const c of candidates) {
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("title", c.title)
          .gte("created_at", `${todayKey}T00:00:00`);
        if (!existing?.length) {
          await supabase.from("notifications").insert(c);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const monthTx = useMemo(() => currentMonthTransactions(tx), [tx]);
  const totals = useMemo(() => moneyTotals(accounts, monthTx, profile), [accounts, monthTx, profile]);
  const byCat = useMemo(() => spendingByCategory(monthTx, categories), [monthTx, categories]);

  const todayTasks = useMemo(() => {
    const s = new Date();
    s.setHours(0, 0, 0, 0);
    const e = new Date(s.getTime() + 86400000);
    return tasks.filter(
      (task) => task.status !== "done" && task.due_date && new Date(task.due_date) >= s && new Date(task.due_date) < e
    );
  }, [tasks]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayHabits = habits.filter((h) => !completions.some((c) => c.habit_id === h.id && c.date === todayKey));

  const briefing = useMemo(() => buildBriefing(t, currency, profile?.name ?? "", todayTasks.length, totals, monthTx, categories, goals, todayHabits.length), [t, currency, profile?.name, todayTasks.length, totals, monthTx, categories, goals, todayHabits.length]);

  const nextItems = useMemo(
    () => buildNextItems(t, currency, tasks, subs, goals, monthTx, categories, now),
    [t, currency, tasks, subs, goals, monthTx, categories, now]
  );

  const widgets: Record<string, { visible: boolean; render: () => React.ReactNode }> = {
    briefing: { visible: true, render: () => <BriefingWidget t={t} briefing={briefing} /> },
    next: { visible: true, render: () => <NextWidget t={t} items={nextItems} /> },
    money: { visible: true, render: () => <MoneyWidget t={t} currency={currency} totals={totals} /> },
    tasks: { visible: true, render: () => <TasksWidget t={t} tasks={todayTasks} onToggle={toggleTask} /> },
    events: { visible: true, render: () => <EventsWidget t={t} events={events} /> },
    goals: { visible: true, render: () => <GoalsWidget t={t} currency={currency} goals={goals} /> },
    habits: { visible: true, render: () => <HabitsWidget t={t} habits={todayHabits} done={habits.length - todayHabits.length} total={habits.length} onToggle={toggleHabit} /> },
    bills: { visible: true, render: () => <BillsWidget t={t} currency={currency} subs={subs} /> },
    chart: { visible: true, render: () => <ChartWidget t={t} currency={currency} byCat={byCat} /> },
  };

  async function toggleTask(task: Task) {
    const done = task.status === "done";
    await supabase.from("tasks").update({ status: done ? "todo" : "done", completed_at: done ? null : new Date().toISOString() }).eq("id", task.id);
    load();
  }

  async function toggleHabit(habit: Habit) {
    const existing = completions.find((c) => c.habit_id === habit.id && c.date === todayKey);
    if (existing) {
      await supabase.from("habit_completions").delete().eq("id", existing.id);
    } else {
      await supabase.from("habit_completions").insert({ habit_id: habit.id, date: todayKey });
    }
    load();
  }

  function move(id: string, dir: -1 | 1) {
    setLayout((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  function saveLayout() {
    if (profile) {
      supabase.from("profiles").update({ widget_layout: layout }).eq("id", profile.id);
    }
    setCustomizeOpen(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const visibleWidgets = layout
    .filter((w) => w.visible && widgets[w.id] && (mode === "all" || MODE_WIDGETS[mode].includes(w.id)))
    .map((w) => widgets[w.id]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-400">
            {now.toLocaleDateString(profile?.language === "en" ? "en-GB" : profile?.language === "es" ? "es-ES" : profile?.language === "fr" ? "fr-FR" : "pt-PT", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
            {greeting(now, profile?.language)} {profile?.name?.split(" ")[0]} 👋
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}>
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">{t.dashboard.customize}</span>
        </Button>
      </div>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "work", "finance", "study", "weekend", "travel"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              mode === m
                ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-300"
                : "border-white/10 text-zinc-400 hover:bg-white/5"
            )}
          >
            {t.modes[m]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {visibleWidgets.map((w, i) => (
          <div key={i} className={cn("animate-slide-up", i === 0 && "sm:col-span-2")}>
            {w.render()}
          </div>
        ))}
      </div>

      {/* Customize modal */}
      <Modal open={customizeOpen} onClose={() => setCustomizeOpen(false)} title={t.widgets.title}>
        <div className="space-y-2">
          {layout.map((w, i) => (
            <div key={w.id} className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2.5">
              <span className="text-sm text-zinc-200">{widgetLabel(t, w.id)}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => move(w.id, -1)}
                  disabled={i === 0}
                  className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/8 disabled:opacity-30"
                >
                  <ArrowUpDown className="h-4 w-4 rotate-90" />
                </button>
                <button
                  onClick={() => move(w.id, 1)}
                  disabled={i === layout.length - 1}
                  className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/8 disabled:opacity-30"
                >
                  <ArrowUpDown className="h-4 w-4 -rotate-90" />
                </button>
                <div className="ml-1 flex items-center gap-2">
                  {w.visible ? <Eye className="h-4 w-4 text-indigo-400" /> : <EyeOff className="h-4 w-4 text-zinc-600" />}
                  <Switch
                    checked={w.visible}
                    onChange={(v) => setLayout((prev) => prev.map((x) => (x.id === w.id ? { ...x, visible: v } : x)))}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => { setLayout(profile?.widget_layout?.length ? profile.widget_layout : DEFAULT_WIDGETS); setCustomizeOpen(false); }}>
            {t.common.cancel}
          </Button>
          <Button className="flex-1" onClick={saveLayout}>
            {t.common.save}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- widgets ---------- */

function BriefingWidget({ t, briefing }: { t: (typeof import("@/lib/i18n"))["pt"]; briefing: string[] }) {
  return (
    <Card className="border-indigo-500/20 bg-gradient-to-r from-indigo-500/10 via-violet-500/8 to-transparent">
      <CardHeader title={t.dashboard.briefing} />
      <div className="space-y-1.5">
        {briefing.map((line, i) => (
          <p key={i} className="text-sm leading-relaxed text-zinc-300">
            {line}
          </p>
        ))}
      </div>
    </Card>
  );
}

function MoneyWidget({ t, currency, totals }: { t: (typeof import("@/lib/i18n"))["pt"]; currency: string; totals: ReturnType<typeof moneyTotals> }) {
  return (
    <Card>
      <CardHeader title={t.dashboard.moneyOverview} />
      <div className="mb-3 flex items-end justify-between">
        <p className="text-3xl font-bold tracking-tight text-zinc-100">{formatMoney(totals.totalBalance, currency)}</p>
        <Badge color="green">{t.dashboard.available}: {formatMoney(totals.available, currency)}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat label={t.money.monthlyIncome} value={formatMoney(totals.monthlyIncome, currency)} tone="text-emerald-400" />
        <MiniStat label={t.money.monthlyExpenses} value={formatMoney(totals.monthlyExpenses, currency)} tone="text-rose-400" />
        <MiniStat label={t.money.savingsRate} value={`${totals.savingsRate}%`} tone="text-sky-400" />
      </div>
    </Card>
  );
}

function TasksWidget({ t, tasks, onToggle }: { t: (typeof import("@/lib/i18n"))["pt"]; tasks: Task[]; onToggle: (task: Task) => void }) {
  return (
    <Card>
      <CardHeader
        title={t.dashboard.todaysTasks}
        action={<Link href="/app/tasks" className="flex items-center text-xs font-medium text-indigo-400 hover:text-indigo-300"><ChevronRight className="h-4 w-4" /></Link>}
      />
      {tasks.length === 0 ? (
        <p className="py-2 text-sm text-zinc-500">🎉 {t.tasks.noTasks}</p>
      ) : (
        <div className="space-y-1">
          {tasks.slice(0, 5).map((task) => (
            <button key={task.id} onClick={() => onToggle(task)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-white/5">
              <span className="h-5 w-5 shrink-0 rounded-full border border-white/20" />
              <span className="truncate text-sm text-zinc-200">{task.title}</span>
              {task.priority === "high" && <Badge color="red">!</Badge>}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function EventsWidget({ t, events }: { t: (typeof import("@/lib/i18n"))["pt"]; events: CalendarEvent[] }) {
  return (
    <Card>
      <CardHeader
        title={t.dashboard.upcomingEvents}
        action={<Link href="/app/calendar" className="flex items-center text-xs font-medium text-indigo-400 hover:text-indigo-300"><ChevronRight className="h-4 w-4" /></Link>}
      />
      {events.length === 0 ? (
        <p className="py-2 text-sm text-zinc-500">{t.calendar.noEvents}</p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 4).map((ev) => (
            <div key={ev.id} className="flex items-center gap-2.5">
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: ev.color }} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-200">{ev.title}</p>
                <p className="text-[11px] text-zinc-500">
                  {formatDate(ev.start_at)}
                  {!ev.all_day && ` · ${new Date(ev.start_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GoalsWidget({ t, currency, goals }: { t: (typeof import("@/lib/i18n"))["pt"]; currency: string; goals: SavingsGoal[] }) {
  const active = goals.filter((g) => g.current_amount < g.target_amount).slice(0, 2);
  return (
    <Card>
      <CardHeader
        title={t.dashboard.activeGoals}
        action={<Link href="/app/goals" className="flex items-center text-xs font-medium text-indigo-400 hover:text-indigo-300"><ChevronRight className="h-4 w-4" /></Link>}
      />
      {active.length === 0 ? (
        <p className="py-2 text-sm text-zinc-500">{t.goals.addGoal} 🎯</p>
      ) : (
        <div className="space-y-3">
          {active.map((g) => {
            const pct = percent(g.current_amount, g.target_amount);
            return (
              <div key={g.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-zinc-200">
                    <span>{g.icon}</span>
                    {g.name}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {formatMoney(g.current_amount, currency)} / {formatMoney(g.target_amount, currency)}
                  </span>
                </div>
                <Progress value={pct} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function HabitsWidget({ t, habits, done, total, onToggle }: { t: (typeof import("@/lib/i18n"))["pt"]; habits: Habit[]; done: number; total: number; onToggle: (h: Habit) => void }) {
  if (total === 0) {
    return (
      <Card>
        <CardHeader title={t.dashboard.habitProgress} />
        <p className="py-2 text-sm text-zinc-500">{t.habits.noHabits}</p>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        title={t.dashboard.habitProgress}
        action={<Link href="/app/habits" className="flex items-center text-xs font-medium text-indigo-400 hover:text-indigo-300"><ChevronRight className="h-4 w-4" /></Link>}
      />
      <div className="mb-3 flex items-center gap-3">
        <Progress value={(done / total) * 100} className="flex-1" />
        <span className="text-xs font-semibold text-zinc-300">
          {done}/{total}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {habits.slice(0, 8).map((h) => (
          <button
            key={h.id}
            onClick={() => onToggle(h)}
            title={h.name}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-base transition hover:scale-110"
            style={{ background: `${h.color}1f` }}
          >
            {h.icon}
          </button>
        ))}
      </div>
    </Card>
  );
}

function BillsWidget({ t, currency, subs }: { t: (typeof import("@/lib/i18n"))["pt"]; currency: string; subs: Subscription[] }) {
  const sorted = [...subs]
    .filter((s) => s.next_billing_date)
    .sort((a, b) => new Date(a.next_billing_date!).getTime() - new Date(b.next_billing_date!).getTime())
    .slice(0, 4);
  const monthly = subs.reduce((s, x) => s + (x.billing_cycle === "monthly" ? x.amount : x.billing_cycle === "yearly" ? x.amount / 12 : x.amount * 4.33), 0);
  return (
    <Card>
      <CardHeader
        title={t.dashboard.upcomingBills}
        action={<Link href="/app/money" className="flex items-center text-xs font-medium text-indigo-400 hover:text-indigo-300"><ChevronRight className="h-4 w-4" /></Link>}
      />
      {sorted.length === 0 ? (
        <p className="py-2 text-sm text-zinc-500">{t.dashboard.upcomingBills} — 0</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span className="text-zinc-200">{s.name}</span>
              <span className="text-xs text-zinc-500">
                {formatMoney(s.amount, currency)} · {s.next_billing_date ? formatDate(s.next_billing_date) : ""}
              </span>
            </div>
          ))}
        </div>
      )}
      {monthly > 0 && (
        <p className="mt-3 rounded-xl bg-white/4 px-3 py-2 text-xs text-zinc-400">
          {t.common.monthly}: <b className="text-zinc-200">{formatMoney(monthly, currency)}</b>
        </p>
      )}
    </Card>
  );
}

function ChartWidget({ t, currency, byCat }: { t: (typeof import("@/lib/i18n"))["pt"]; currency: string; byCat: { category: string; value: number; color: string }[] }) {
  return (
    <Card>
      <CardHeader title={t.dashboard.spendingByCategory} subtitle={t.dashboard.thisMonth} />
      {byCat.length === 0 ? (
        <EmptyState icon="📊" title={t.money.noTransactions} />
      ) : (
        <div className="flex items-center gap-4">
          <div className="h-36 w-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCat} dataKey="value" nameKey="category" innerRadius={40} outerRadius={62} paddingAngle={2} strokeWidth={0}>
                  {byCat.map((c, i) => (
                    <Cell key={i} fill={c.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {byCat.slice(0, 5).map((c) => (
              <div key={c.category} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="truncate text-zinc-400">{c.category}</span>
                <span className="ml-auto font-medium text-zinc-200">{formatMoney(c.value, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function NextWidget({ t, items }: { t: (typeof import("@/lib/i18n"))["pt"]; items: { text: string; href?: string }[] }) {
  return (
    <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-teal-500/8 to-transparent">
      <CardHeader
        title={t.next.title}
        action={
          <Link href="/app/nova" className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            {t.cmd.askNova}
          </Link>
        }
      />
      {items.length === 0 ? (
        <p className="py-2 text-sm text-zinc-500">{t.next.empty}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 4).map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <p className="text-sm leading-relaxed text-zinc-300">{item.text}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- rule-based "what should I do next?" ---------- */
function buildNextItems(
  t: (typeof import("@/lib/i18n"))["pt"],
  currency: string,
  tasks: Task[],
  subs: Subscription[],
  goals: SavingsGoal[],
  monthTx: Transaction[],
  categories: Category[],
  now: Date
): { text: string; href?: string }[] {
  const items: { text: string; href?: string }[] = [];
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  // due tasks today/overdue
  const dueSoon = tasks
    .filter((x) => x.status !== "done" && x.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 1);
  if (dueSoon.length) {
    const d = new Date(dueSoon[0].due_date!);
    items.push({
      text:
        d < dayStart
          ? `⏰ Tens uma tarefa atrasada: "${dueSoon[0].title}".`
          : `📌 Tarefa para hoje: "${dueSoon[0].title}".`,
      href: "/app/tasks",
    });
  }

  // bills due in the next 3 days
  const nextBill = subs
    .filter((s) => s.next_billing_date && new Date(s.next_billing_date) >= dayStart && new Date(s.next_billing_date) <= new Date(dayStart.getTime() + 3 * 86400000))
    .sort((a, b) => new Date(a.next_billing_date!).getTime() - new Date(b.next_billing_date!).getTime())[0];
  if (nextBill?.next_billing_date) {
    items.push({
      text: `💳 ${nextBill.name} (${formatMoney(nextBill.amount, currency)}) vence ${formatDate(nextBill.next_billing_date)}.`,
      href: "/app/subscriptions",
    });
  }

  // savings goal gap
  const closest = goals
    .filter((g) => g.current_amount < g.target_amount)
    .sort((a, b) => b.current_amount / b.target_amount - a.current_amount / a.target_amount)[0];
  if (closest && closest.monthly_contribution > 0) {
    const remaining = closest.target_amount - closest.current_amount;
    if (remaining <= closest.monthly_contribution * 1.5) {
      items.push({
        text: `🎯 Faltam ${formatMoney(remaining, currency)} para "${closest.name}" — dá para fechar com a contribuição mensal.`,
        href: "/app/goals",
      });
    }
  }

  // spending signal
  const wantsCats = categories.filter((c) => c.budget_type !== "needs" && c.type === "expense");
  const monthIncome = monthTx.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
  const wantsSpent = Math.abs(
    monthTx.filter((x) => x.amount < 0 && wantsCats.some((c) => c.id === x.category_id)).reduce((s, x) => s + x.amount, 0)
  );
  if (monthIncome > 0 && wantsSpent > monthIncome * 0.3) {
    items.push({ text: `🧠 Estás a gastar ${Math.round((wantsSpent / monthIncome) * 100)}% do rendimento em desejos este mês.`, href: "/app/budgets" });
  }

  return items;
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl bg-white/4 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={cn("mt-0.5 text-sm font-bold", tone)}>{value}</p>
    </div>
  );
}

function widgetLabel(t: (typeof import("@/lib/i18n"))["pt"], id: string): string {
  const map: Record<string, string> = {
    briefing: t.widgets.briefing,
    next: t.next.title,
    money: t.widgets.money,
    tasks: t.widgets.tasks,
    events: t.widgets.events,
    goals: t.widgets.goals,
    habits: t.widgets.habits,
    bills: t.widgets.bills,
    chart: t.widgets.chart,
  };
  return map[id] ?? id;
}

/* ---------- rule-based briefing ---------- */
function buildBriefing(
  t: (typeof import("@/lib/i18n"))["pt"],
  currency: string,
  name: string,
  taskCount: number,
  totals: ReturnType<typeof moneyTotals>,
  monthTx: Transaction[],
  categories: Category[],
  goals: SavingsGoal[],
  openHabits: number
): string[] {
  const lines: string[] = [];
  const first = name?.split(" ")[0] ?? "";
  lines.push(
    taskCount > 0
      ? `${greeting()}, ${first}. Tens ${taskCount} ${taskCount === 1 ? "coisa" : "coisas"} agendadas para hoje.`
      : `${greeting()}, ${first}. Hoje está livre — bom dia para focar em projetos.`
  );

  const spent = totals.monthlyExpenses;
  const foodCat = categories.find((c) => c.name === "Food");
  const foodTx = monthTx.filter((x) => x.amount < 0 && x.category_id === foodCat?.id);
  const foodSpent = Math.abs(foodTx.reduce((s, x) => s + x.amount, 0));

  const wantsCats = categories.filter((c) => c.budget_type !== "needs" && c.type === "expense");
  const wantsSpent = Math.abs(
    monthTx.filter((x) => x.amount < 0 && wantsCats.some((c) => c.id === x.category_id)).reduce((s, x) => s + x.amount, 0)
  );
  const wantsPct = totals.monthlyIncome > 0 ? Math.round((wantsSpent / totals.monthlyIncome) * 100) : 0;

  if (foodCat?.monthly_budget && foodSpent > foodCat.monthly_budget) {
    lines.push(`💰 Gastaste ${formatMoney(foodSpent - foodCat.monthly_budget, currency)} a mais em comida este mês. Ainda tens ${formatMoney(totals.available, currency)} de margem.`);
  } else if (wantsPct > 30) {
    lines.push(`💰 Estás a gastar ${wantsPct}% do rendimento em desejos. Reduzir ~${formatMoney(Math.round(wantsSpent - totals.monthlyIncome * 0.3), currency)}/mês aproxima-te das metas.`);
  } else {
    lines.push(`💰 ${formatMoney(totals.available, currency)} disponíveis para gastar este mês.`);
  }

  const activeGoals = goals.filter((g) => g.current_amount < g.target_amount);
  if (activeGoals.length > 0) {
    const g = activeGoals[0];
    const pct = percent(g.current_amount, g.target_amount);
    lines.push(`🎯 Objetivo "${g.name}" está a ${pct}%. ${pct >= 50 ? "Vais a tempo!" : "Continua a contribuir."}`);
  }

  if (openHabits > 0) {
    lines.push(`💡 Tens ${openHabits} hábitos por completar hoje. 5 minutos bastam.`);
  }

  return lines;
}
