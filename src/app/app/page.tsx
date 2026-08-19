"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { formatDate, formatMoney, formatTime, greeting, monthKey, percent } from "@/lib/format";
import { boredomIdeas, nowBanner, whatShouldIDo, nowStatus, type BoredomMood, type Suggestion } from "@/lib/now";
import { currentRoutine, sortSteps } from "@/lib/routines";
import {
  activityTimeline,
  computeDayStats,
  timeOfDay,
  tomorrowPrep,
  topPriorities,
  type DayStats,
  type Priority,
  type TimelineEntry,
  type TomorrowPrep,
} from "@/lib/daily";
import type { Account, CalendarEvent, Category, FocusSession, Habit, HabitCompletion, Routine, RoutineCompletion, RoutineStep, SavingsGoal, Subscription, Task, Transaction, WidgetDef } from "@/lib/types";
import { cn } from "@/lib/cn";

const DEFAULT_WIDGETS: WidgetDef[] = [
  { id: "briefing", visible: true },
  { id: "top3", visible: true },
  { id: "routine", visible: true },
  { id: "next", visible: true },
  { id: "money", visible: true },
  { id: "tasks", visible: true },
  { id: "events", visible: true },
  { id: "timeline", visible: true },
  { id: "summary", visible: true },
  { id: "tomorrow", visible: true },
  { id: "goals", visible: true },
  { id: "habits", visible: true },
  { id: "bills", visible: true },
  { id: "chart", visible: true },
];

// Modes: which widgets are shown per mode (progressive disclosure)
const MODE_WIDGETS: Record<string, string[]> = {
  all: ["briefing", "top3", "routine", "next", "money", "tasks", "events", "timeline", "summary", "tomorrow", "goals", "habits", "bills", "chart"],
  work: ["briefing", "top3", "routine", "next", "tasks", "events", "timeline"],
  finance: ["briefing", "top3", "next", "money", "bills", "chart", "goals"],
  study: ["briefing", "top3", "next", "tasks", "goals", "timeline"],
  weekend: ["briefing", "top3", "routine", "next", "events", "habits", "timeline", "tomorrow"],
  travel: ["briefing", "top3", "next", "money", "goals", "tomorrow"],
};

type Mode = "all" | "work" | "finance" | "study" | "weekend" | "travel";

/** Local YYYY-MM-DD (avoid toISOString which is UTC and shifts the day). */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { t, currency, profile, updateProfile } = useApp();
  const supabase = useSupabase();
  const router = useRouter();
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
  const [layoutMsg, setLayoutMsg] = useState<string | null>(null);
  const [layout, setLayout] = useState<WidgetDef[]>(DEFAULT_WIDGETS);
  const [mode, setMode] = useState<Mode>("all");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [energy, setEnergy] = useState<"low" | "normal" | "high">("normal");
  const [boredOpen, setBoredOpen] = useState(false);
  const [boredIdeas, setBoredIdeas] = useState<Suggestion[]>([]);
  const [focus, setFocus] = useState<FocusSession[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [rSteps, setRSteps] = useState<RoutineStep[]>([]);
  const [rCompletions, setRCompletions] = useState<RoutineCompletion[]>([]);

  const now = new Date();
  const saveMode = ((profile?.preferences ?? {}) as Record<string, unknown>).save_mode === true;

  const load = useCallback(async () => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const weekEnd = new Date(dayStart.getTime() + 7 * 86400000);
    const [tx_, acc, cats, tasks_, evs, goals_, subs_, habs_, comps_, foc_, rts_, rSteps_, rComps_] = await Promise.all([
      api.allTransactions(supabase, 300),
      api.accounts(supabase),
      api.categories(supabase),
      api.tasks(supabase),
      api.events(supabase, dayStart.toISOString(), weekEnd.toISOString()),
      api.goals(supabase),
      api.subscriptions(supabase),
      api.habits(supabase),
      api.completions(supabase),
      api.focusSessions(supabase),
      api.routines(supabase),
      api.routineSteps(supabase),
      api.routineCompletions(supabase, localDayKey(new Date())),
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
    setFocus(foc_);
    setRoutines(rts_);
    setRSteps(rSteps_);
    setRCompletions(rComps_);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    // saved layout from the DB, falling back to a local cache so the
    // customization is applied instantly on reload (DB still wins when it arrives)
    let saved: WidgetDef[] | null = profile?.widget_layout?.length ? profile.widget_layout : null;
    if (!saved) {
      try {
        const raw = window.localStorage.getItem("lifeos:widget_layout");
        if (raw) {
          const parsed = JSON.parse(raw) as WidgetDef[];
          if (Array.isArray(parsed) && parsed.length) saved = parsed;
        }
      } catch {}
    }
    if (saved?.length) {
      // merge: keep the saved layout but surface newly added widgets
      const ids = new Set(saved.map((w) => w.id));
      setLayout([...saved, ...DEFAULT_WIDGETS.filter((w) => !ids.has(w.id))]);
    } else {
      setLayout(DEFAULT_WIDGETS);
    }
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

  // ---- NOW system ----
  const dayStartD = new Date(now);
  dayStartD.setHours(0, 0, 0, 0);
  const todayEvents = events.filter((e) => new Date(e.start_at) >= dayStartD && new Date(e.start_at) < new Date(dayStartD.getTime() + 86400000));
  const overdueTasks = tasks.filter((x) => x.status !== "done" && x.due_date && x.due_date < todayKey);
  const nowCtx: import("@/lib/now").NowContext = {
    now: nowStatus(todayEvents, now),
    todayTasks,
    overdueTasks,
    events: todayEvents,
    goals: goals.map((g) => ({ name: g.name, current: g.current_amount, target: g.target_amount, pct: g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0 })),
    habitsDueToday: todayHabits.length,
    learningHours30d: 0,
    hasTripSoon: null,
    expiringDocs: [],
    billsDueSoon: subs.filter((s) => s.next_billing_date && new Date(s.next_billing_date) >= dayStartD && new Date(s.next_billing_date) <= new Date(dayStartD.getTime() + 3 * 86400000)).map((s) => s.name),
    money: { safeToSpend: Math.round(totals.available), nextPayday: null, paydayDays: null },
  };
  const banner = nowBanner(nowCtx);
  const tod = timeOfDay(now);
  const contextLine = {
    morning: t.dashboard.contextMorning,
    afternoon: t.dashboard.contextAfternoon,
    evening: t.dashboard.contextEvening,
    night: t.dashboard.contextNight,
  }[tod];
  const priorities = topPriorities(tasks, goals, subs, now);
  const timeline = activityTimeline(events, tx, focus, tasks, categories, now);
  const stats = computeDayStats(tasks, tx, focus, completions, habits, goals, now);
  const tomorrow = tomorrowPrep(events, tasks, subs, now);
  function openSuggestions(energyValue: "low" | "normal" | "high" = energy) {
    setEnergy(energyValue);
    setSuggestions(whatShouldIDo(nowCtx, null, { budgetMode: saveMode, energy: energyValue }));
    setSuggestOpen(true);
  }

  function openBored(mood: BoredomMood) {
    setBoredIdeas(boredomIdeas(mood, nowCtx));
    setBoredOpen(true);
  }

  async function doSuggestion(s: Suggestion) {
    if (s.kind === "task" && s.id) {
      await supabase.from("tasks").update({ status: "in_progress" }).eq("id", s.id);
      await supabase.from("focus_sessions").insert({ task_id: s.id, kind: "focus", minutes: Math.min(60, s.duration ?? 25) });
      load();
    } else if (s.kind === "habit") {
      router.push("/app/habits");
    } else if (s.kind === "learning") {
      router.push("/app/learning");
    } else if (s.kind === "errand") {
      router.push("/app/digital");
    }
    setSuggestOpen(false);
    setBoredOpen(false);
  }

  const briefing = buildBriefing(t, currency, profile?.name ?? "", todayTasks.length, totals, monthTx, categories, goals, todayHabits.length);
  const nextItems = buildNextItems(t, currency, tasks, subs, goals, monthTx, categories, now);
  const routineNow = currentRoutine(routines, rSteps, now);

  const widgets: Record<string, { visible: boolean; render: () => React.ReactNode }> = {
    briefing: { visible: true, render: () => <BriefingWidget t={t} briefing={briefing} /> },
    top3: { visible: true, render: () => <PrioritiesWidget t={t} items={priorities} /> },
    routine: {
      visible: true,
      render: () => (
        <RoutineWidget
          t={t}
          now={routineNow}
          doneIds={new Set(rCompletions.map((c) => c.step_id))}
          onToggle={toggleRoutineStep}
        />
      ),
    },
    next: { visible: true, render: () => <NextWidget t={t} items={nextItems} /> },
    timeline: { visible: true, render: () => <TimelineWidget t={t} currency={currency} items={timeline} /> },
    summary: { visible: true, render: () => <SummaryWidget t={t} currency={currency} stats={stats} tod={tod} /> },
    tomorrow: { visible: true, render: () => <TomorrowWidget t={t} currency={currency} prep={tomorrow} /> },
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

  async function toggleRoutineStep(step: RoutineStep) {
    const existing = rCompletions.find((c) => c.step_id === step.id);
    if (existing) {
      await supabase.from("routine_completions").delete().eq("id", existing.id);
    } else {
      await supabase.from("routine_completions").insert({ step_id: step.id, date: localDayKey(new Date()) });
    }
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

  async function saveLayout() {
    setLayoutMsg(null);
    try {
      window.localStorage.setItem("lifeos:widget_layout", JSON.stringify(layout));
    } catch {}
    const ok = await updateProfile({ widget_layout: layout });
    if (ok) {
      setCustomizeOpen(false);
    } else {
      setLayoutMsg("⚠");
    }
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
          <p className="mt-1 text-sm text-zinc-400">{contextLine}</p>
        </div>
        <div className="flex items-center gap-2">
          {saveMode && <Badge color="green">🐷 {t.settings.saveMode}</Badge>}
          <Button variant="outline" size="sm" onClick={() => setBoredOpen(true)}>
            😅 <span className="hidden sm:inline">{t.now.bored}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => openSuggestions()}>
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">{t.now.whatShouldIDo}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}>
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t.dashboard.customize}</span>
          </Button>
        </div>
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

      <div className="stagger grid gap-4 sm:grid-cols-2">
        {visibleWidgets.map((w, i) => (
          <div key={i} className={cn(i === 0 && "sm:col-span-2")}>
            {w.render()}
          </div>
        ))}
      </div>

      {/* What should I do? modal */}
      <Modal open={suggestOpen} onClose={() => setSuggestOpen(false)} title={t.now.whatShouldIDo}>
        <div className="space-y-2">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.now.energy}</span>
            {([["low", "😩", t.now.energyLow], ["normal", "🙂", t.now.energyNormal], ["high", "⚡", t.now.energyHigh]] as const).map(([val, icon, label]) => (
              <button
                key={val}
                onClick={() => openSuggestions(val)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  energy === val
                    ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-200"
                    : "border-white/10 text-zinc-400 hover:bg-white/5"
                )}
              >
                {icon} {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            {banner.emoji} {banner.headline}
          </p>
          {suggestions.length === 0 && <p className="py-4 text-sm text-zinc-500">{t.next.empty}</p>}
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => doSuggestion(s)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-left transition hover:bg-white/10"
            >
              <span className="text-xl">{s.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-200">{s.title}</p>
                <p className="text-[11px] text-zinc-500">
                  {s.duration ? `${s.duration} min · ` : ""}
                  {s.reason}
                </p>
              </div>
              {s.kind === "task" && s.id && <span className="shrink-0 text-[10px] uppercase tracking-wider text-indigo-400">{t.focus.start}</span>}
            </button>
          ))}
        </div>
      </Modal>

      {/* Boredom modal (#28) */}
      <Modal open={boredOpen} onClose={() => setBoredOpen(false)} title={t.now.boredQuestion}>
        {boredIdeas.length === 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ["fun", "🎮", t.now.moodFun],
                ["productive", "🧠", t.now.moodProductive],
                ["active", "🏃", t.now.moodActive],
                ["cheap", "💰", t.now.moodCheap],
                ["outside", "🌳", t.now.moodOutside],
                ["social", "👥", t.now.moodSocial],
                ["relax", "😴", t.now.moodRelax],
              ] as [BoredomMood, string, string][]
            ).map(([m, icon, label]) => (
              <button
                key={m}
                onClick={() => setBoredIdeas(boredomIdeas(m, nowCtx))}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3 py-4 text-sm text-zinc-200 transition hover:bg-white/10"
              >
                <span className="text-2xl">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {boredIdeas.map((s, i) => (
              <button
                key={i}
                onClick={() => doSuggestion(s)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-left transition hover:bg-white/10"
              >
                <span className="text-xl">{s.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-200">{s.title}</p>
                  <p className="text-[11px] text-zinc-500">
                    {s.duration ? `${s.duration} min · ` : ""}
                    {s.reason}
                  </p>
                </div>
              </button>
            ))}
            <Button variant="secondary" className="w-full" onClick={() => setBoredIdeas([])}>
              ← {t.now.moodBack}
            </Button>
          </div>
        )}
      </Modal>

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
        {layoutMsg && <p className="mt-2 text-center text-xs text-amber-400">{layoutMsg}</p>}
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

function RoutineWidget({
  t,
  now,
  doneIds,
  onToggle,
}: {
  t: (typeof import("@/lib/i18n"))["pt"];
  now: ReturnType<typeof currentRoutine>;
  doneIds: Set<string>;
  onToggle: (step: RoutineStep) => void;
}) {
  if (!now) return null;
  const { routine, steps, currentIndex, nextIndex } = now;
  const done = steps.filter((s) => doneIds.has(s.id)).length;
  return (
    <Card className="border-violet-500/15">
      <CardHeader
        title={`${routine.icon || "⏰"} ${routine.name}`}
        subtitle={routine.start_time}
        action={<Link href="/app/routines" className="flex items-center text-xs font-medium text-indigo-400 hover:text-indigo-300"><ChevronRight className="h-4 w-4" /></Link>}
      />
      {steps.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <Progress value={(done / steps.length) * 100} className="flex-1" color="bg-gradient-to-r from-violet-500 to-fuchsia-500" />
          <span className="text-xs font-semibold text-zinc-300">
            {done}/{steps.length}
          </span>
        </div>
      )}
      <div className="space-y-1">
        {steps.map((s, i) => {
          const isDone = doneIds.has(s.id);
          const isCurrent = i === currentIndex;
          const isNext = i === nextIndex;
          return (
            <button key={s.id} onClick={() => onToggle(s)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                  isDone ? "border-emerald-400 bg-emerald-400/20" : "border-white/20"
                )}
              >
                {isDone && <Check className="h-3 w-3 text-emerald-400" />}
              </span>
              <span className="w-11 shrink-0 text-xs tabular-nums text-zinc-500">{s.time}</span>
              <span className={cn("truncate text-sm", isDone ? "text-zinc-500 line-through" : isCurrent ? "font-medium text-zinc-100" : "text-zinc-300")}>
                {s.title}
              </span>
              {isCurrent && !isDone && <Badge color="green">{t.routines.now}</Badge>}
              {isNext && <Badge color="violet">{t.routines.upNext}</Badge>}
            </button>
          );
        })}
      </div>
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

function PrioritiesWidget({ t, items }: { t: (typeof import("@/lib/i18n"))["pt"]; items: Priority[] }) {
  const toneCls = {
    red: "border-red-500/25 bg-red-500/8",
    amber: "border-amber-500/25 bg-amber-500/8",
    green: "border-emerald-500/25 bg-emerald-500/8",
  };
  return (
    <Card>
      <CardHeader title={t.dashboard.priorities} />
      {items.length === 0 ? (
        <p className="py-2 text-sm text-zinc-500">{t.dashboard.noPriorities}</p>
      ) : (
        <div className="space-y-2">
          {items.map((p, i) => {
            const row = (
              <div className={cn("flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 transition", toneCls[p.tone])}>
                <span className="text-lg">{p.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-200">{p.title}</p>
                  <p className="text-[11px] text-zinc-500">{p.reason}</p>
                </div>
                {p.href && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />}
              </div>
            );
            return p.href ? (
              <Link key={i} href={p.href} className="block">
                {row}
              </Link>
            ) : (
              <div key={i}>{row}</div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TimelineWidget({ t, currency, items }: { t: (typeof import("@/lib/i18n"))["pt"]; currency: string; items: TimelineEntry[] }) {
  return (
    <Card>
      <CardHeader title={t.dashboard.timeline} />
      {items.length === 0 ? (
        <p className="py-2 text-sm text-zinc-500">{t.dashboard.emptyTimeline}</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 8).map((it, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="w-10 shrink-0 font-mono text-[11px] text-zinc-500">{it.time}</span>
              <span className="shrink-0 text-base">{it.icon}</span>
              <span className="truncate text-zinc-300">
                {it.kind === "money" && it.amount != null
                  ? `${it.amount > 0 ? "+" : "−"}${formatMoney(Math.abs(it.amount), currency)} ${it.text}`
                  : it.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SummaryWidget({ t, currency, stats, tod }: { t: (typeof import("@/lib/i18n"))["pt"]; currency: string; stats: DayStats; tod: ReturnType<typeof timeOfDay> }) {
  const isNight = tod === "evening" || tod === "night";
  const verdict = {
    great: t.dashboard.verdictGreat,
    ok: t.dashboard.verdictOk,
    quiet: t.dashboard.verdictQuiet,
    empty: t.dashboard.verdictEmpty,
  }[stats.verdict];
  return (
    <Card className="border-violet-500/20 bg-gradient-to-r from-violet-500/8 to-transparent">
      <CardHeader title={isNight ? t.dashboard.daySummaryTitle : t.dashboard.daySoFar} />
      <div className="grid grid-cols-4 gap-2 text-center">
        <MiniStat label={t.dashboard.tasks} value={`✅ ${stats.tasksDone}`} tone="text-emerald-400" />
        <MiniStat label="€" value={formatMoney(stats.spent, currency)} tone="text-rose-400" />
        <MiniStat label="🎯" value={`${stats.focusMinutes}m`} tone="text-sky-400" />
        <MiniStat label="🔥" value={`${stats.habitsDone}/${stats.habitsTotal}`} tone="text-amber-400" />
      </div>
      <p className="mt-2.5 text-xs text-zinc-400">{verdict}</p>
    </Card>
  );
}

function TomorrowWidget({ t, currency, prep }: { t: (typeof import("@/lib/i18n"))["pt"]; currency: string; prep: TomorrowPrep }) {
  const total = prep.events.length + prep.tasks.length + prep.bills.length;
  return (
    <Card>
      <CardHeader
        title={t.dashboard.tomorrow}
        action={<Link href="/app/calendar" className="flex items-center text-xs font-medium text-indigo-400 hover:text-indigo-300"><ChevronRight className="h-4 w-4" /></Link>}
      />
      {total === 0 ? (
        <p className="py-2 text-sm text-zinc-500">{t.dashboard.nothingPlanned} 🎉</p>
      ) : (
        <div className="space-y-2 text-sm">
          {prep.events.slice(0, 3).map((ev) => (
            <div key={ev.id} className="flex items-center gap-2.5">
              <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: ev.color }} />
              <span className="truncate text-zinc-200">{ev.title}</span>
              {!ev.all_day && <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">{formatTime(ev.start_at)}</span>}
            </div>
          ))}
          {prep.tasks.length > 0 && (
            <p className="text-zinc-400">📌 {prep.tasks.length} tarefa(s) com prazo amanhã</p>
          )}
          {prep.bills.length > 0 && (
            <p className="truncate text-zinc-400">💳 {prep.bills.map((b) => `${b.name} ${formatMoney(b.amount, currency)}`).join(" · ")}</p>
          )}
          {prep.leaveHint && (
            <p className="rounded-xl bg-white/4 px-3 py-2 text-xs text-zinc-400">
              🚗 Sai às <b className="text-zinc-200">{prep.leaveHint.time}</b> para {prep.leaveHint.location} (estimativa ~20 min)
            </p>
          )}
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
    top3: t.widgets.top3,
    next: t.next.title,
    timeline: t.widgets.timeline,
    summary: t.widgets.summary,
    tomorrow: t.widgets.tomorrow,
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
