"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckSquare,
  Flame,
  FolderOpen,
  HeartPulse,
  Plane,
  Sparkles,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api, currentMonthTransactions, moneyTotals } from "@/lib/api";
import { Badge, Card, CardHeader, Progress, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type {
  Account,
  Book,
  CalendarEvent,
  CareerGoal,
  Category,
  Contact,
  Course,
  DigitalAsset,
  Document,
  ExerciseLog,
  FocusSession,
  Habit,
  HabitCompletion,
  JobApplication,
  SavingsGoal,
  SharedExpense,
  Skill,
  SleepLog,
  StudySession,
  Subscription,
  Task,
  Transaction,
  Trip,
  WaterLog,
  WellnessLog,
} from "@/lib/types";

type Status = "good" | "warn" | "bad" | "info";

/* ---------- helpers ---------- */

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay() === 0 ? 7 : d.getDay(); // Monday first
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function statusColor(s: Status): string {
  return s === "good" ? "text-emerald-400" : s === "warn" ? "text-amber-400" : s === "bad" ? "text-rose-400" : "text-zinc-500";
}

function statusDot(s: Status): string {
  return s === "good" ? "bg-emerald-400" : s === "warn" ? "bg-amber-400" : s === "bad" ? "bg-rose-400" : "bg-zinc-500";
}

function statusTone(s: Status): string {
  return s === "good"
    ? "border-emerald-500/20 bg-emerald-500/5"
    : s === "warn"
      ? "border-amber-500/20 bg-amber-500/5"
      : s === "bad"
        ? "border-rose-500/20 bg-rose-500/5"
        : "border-zinc-200 dark:border-white/8 bg-white/[0.035]";
}

/* ---------- page ---------- */

export default function MonitorPage() {
  const { t, currency, profile } = useApp();
  const supabase = useSupabase();
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  // money
  const [tx, setTx] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  // productivity
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [focus, setFocus] = useState<FocusSession[]>([]);
  // learning
  const [books, setBooks] = useState<Book[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [study, setStudy] = useState<StudySession[]>([]);
  // wellness
  const [sleep, setSleep] = useState<SleepLog[]>([]);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [exercise, setExercise] = useState<ExerciseLog[]>([]);
  const [wellness, setWellness] = useState<WellnessLog[]>([]);
  // career
  const [careerGoals, setCareerGoals] = useState<CareerGoal[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  // travel / social / digital
  const [trips, setTrips] = useState<Trip[]>([]);
  const [shared, setShared] = useState<SharedExpense[]>([]);
  const [assets, setAssets] = useState<DigitalAsset[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const load = useCallback(async () => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const [
      tx_, acc, cats_, goals_, subs_, tasks_, habs_, comps_, evs_, foc_,
      books_, courses_, study_, sleep_, water_, exercise_, wellness_,
      career_, skills_, jobs_, trips_, shared_, assets_, docs_, contacts_,
    ] = await Promise.all([
      api.allTransactions(supabase, 500),
      api.accounts(supabase),
      api.categories(supabase),
      api.goals(supabase),
      api.subscriptions(supabase),
      api.tasks(supabase),
      api.habits(supabase),
      api.completions(supabase),
      api.events(supabase, weekStart.toISOString(), weekEnd.toISOString()),
      api.focusSessions(supabase),
      api.books(supabase),
      api.courses(supabase),
      api.studySessions(supabase, 120),
      api.sleepLogs(supabase, 14),
      api.waterLogs(supabase, 14),
      api.exerciseLogs(supabase, 60),
      api.wellnessLogs(supabase, 14),
      api.careerGoals(supabase),
      api.skills(supabase),
      api.jobApplications(supabase),
      api.trips(supabase),
      api.sharedExpenses(supabase),
      api.digitalAssets(supabase),
      api.documents(supabase),
      api.contacts(supabase),
    ]);

    setTx(tx_);
    setAccounts(acc);
    setCats(cats_);
    setGoals(goals_);
    setSubs(subs_);
    setTasks(tasks_);
    setHabits(habs_);
    setCompletions(comps_);
    setEvents(evs_);
    setFocus(foc_);
    setBooks(books_);
    setCourses(courses_);
    setStudy(study_);
    setSleep(sleep_);
    setWater(water_);
    setExercise(exercise_);
    setWellness(wellness_);
    setCareerGoals(career_);
    setSkills(skills_);
    setJobs(jobs_);
    setTrips(trips_);
    setShared(shared_);
    setAssets(assets_);
    setDocs(docs_);
    setContacts(contacts_);
    setLoadedAt(new Date());
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const now = useMemo(() => new Date(), []);
  const todayKey = localDateKey(now);
  const weekStart = useMemo(() => startOfWeek(now), [now]);
  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * 86400000), [weekStart]);
  const monthTx = useMemo(() => currentMonthTransactions(tx), [tx]);
  const totals = useMemo(() => moneyTotals(accounts, monthTx, profile), [accounts, monthTx, profile]);

  /* ---------- area metrics ---------- */

  const metrics = useMemo(() => {
    const mk = Math.round(totals.monthlyIncome) > 0 ? totals.savingsRate : 0;
    const subsMonthly = subs.reduce((s, x) => s + (x.billing_cycle === "monthly" ? x.amount : x.billing_cycle === "yearly" ? x.amount / 12 : x.amount * 4.33), 0);
    const activeGoals = goals.filter((g) => g.current_amount < g.target_amount);
    const goalPct = goals.length ? Math.round((goals.reduce((s, g) => s + g.current_amount, 0) / goals.reduce((s, g) => s + g.target_amount, 0)) * 100) : 0;

    const openTasks = tasks.filter((x) => x.status !== "done");
    const doneTasks = tasks.filter((x) => x.status === "done");
    const overdue = openTasks.filter((x) => x.due_date && x.due_date.slice(0, 10) < todayKey);
    const completionRate = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;

    // habit consistency: this week's completions vs sum of weekly targets
    const weekComps = completions.filter((c) => c.date >= localDateKey(weekStart) && c.date < localDateKey(weekEnd)).length;
    const habitTarget = habits.reduce((s, h) => s + h.target_per_week, 0);
    const consistency = habitTarget ? Math.min(100, Math.round((weekComps / habitTarget) * 100)) : 0;
    // best current streak across habits (consecutive days ending today or yesterday)
    const byHabit = new Map<string, Set<string>>();
    completions.forEach((c) => {
      if (!byHabit.has(c.habit_id)) byHabit.set(c.habit_id, new Set());
      byHabit.get(c.habit_id)!.add(c.date);
    });
    let bestStreak = 0;
    byHabit.forEach((dates) => {
      let streak = 0;
      const cursor = new Date(now);
      // allow today or yesterday as the streak anchor
      if (!dates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
      while (dates.has(localDateKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
      bestStreak = Math.max(bestStreak, streak);
    });

    const eventCount = events.length;
    const weekFocus = focus
      .filter((f) => new Date(f.started_at) >= weekStart && new Date(f.started_at) < weekEnd)
      .reduce((s, f) => s + f.minutes, 0);
    const monthStudy = study
      .filter((s) => s.date >= `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`)
      .reduce((s, x) => s + x.minutes, 0) / 60;
    const reading = books.filter((b) => b.status === "reading").length;
    const coursesActive = courses.filter((c) => c.status !== "completed" && c.progress < 100).length;

    const last7 = sleep.filter((s) => s.date >= new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10));
    const avgSleep = last7.length ? last7.reduce((s, x) => s + x.hours, 0) / last7.length : 0;
    const avgWater = (() => {
      const w = water.filter((x) => x.date >= new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10));
      return w.length ? w.reduce((s, x) => s + x.glasses, 0) / w.length : 0;
    })();
    const daysExercised = new Set(exercise.filter((e) => e.date >= new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10)).map((e) => e.date)).size;
    const moodVals = (wellness ?? []).filter((w) => w.mood != null).map((w) => w.mood as number);
    const avgMood = moodVals.length ? moodVals.reduce((s, m) => s + m, 0) / moodVals.length : 0;

    const activeCareer = careerGoals.filter((g) => g.status !== "done" && g.status !== "completed").length;
    const skillProgress = skills.length ? Math.round(skills.reduce((s, sk) => s + Math.min(100, (sk.level / Math.max(1, sk.target_level)) * 100), 0) / skills.length) : 0;
    const openApps = jobs.filter((j) => ["applied", "interview"].includes(j.status)).length;

    const upcomingTrip = trips
      .filter((tr) => tr.status !== "completed" && tr.start_date && tr.start_date >= todayKey)
      .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1))[0];
    const plannedTrips = trips.filter((tr) => tr.status !== "completed").length;

    const openShared = shared.filter((x) => !x.settled).length;
    const expiringDocs = docs.filter((d) => d.expiry_date && d.expiry_date >= todayKey && d.expiry_date <= new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10));
    const expiringAssets = assets.filter((a) => a.expiry_date && a.expiry_date >= todayKey && a.expiry_date <= new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10));

    return {
      mk,
      subsMonthly,
      activeGoals,
      goalPct,
      openTasks: openTasks.length,
      doneTasks: doneTasks.length,
      overdue: overdue.length,
      completionRate,
      weekComps,
      consistency,
      bestStreak,
      eventCount,
      weekFocus,
      monthStudy,
      reading,
      coursesActive,
      avgSleep,
      avgWater,
      daysExercised,
      avgMood,
      activeCareer,
      skillProgress,
      openApps,
      upcomingTrip,
      plannedTrips,
      openShared,
      expiringDocs,
      expiringAssets,
    };
  }, [totals, subs, goals, tasks, habits, completions, events, focus, study, books, courses, sleep, water, exercise, wellness, careerGoals, skills, jobs, trips, shared, docs, assets, todayKey, weekStart, weekEnd, now]);

  /* ---------- life score ---------- */

  const lifeScore = useMemo(() => {
    const m = metrics;
    const parts: { label: string; score: number; weight: number }[] = [];

    const moneyScore = totals.monthlyIncome > 0 ? Math.max(0, Math.min(100, Math.round((m.mk + 100) / 2))) : 0;
    parts.push({ label: t.monitor.money, score: moneyScore, weight: 3 });

    const taskScore = tasks.length ? Math.max(0, Math.min(100, m.completionRate * 0.7 + (m.overdue === 0 ? 30 : Math.max(0, 30 - m.overdue * 8)))) : 0;
    parts.push({ label: t.monitor.tasks, score: taskScore, weight: 2 });

    const habitScore = habits.length ? Math.round(m.consistency * 0.7 + Math.min(30, m.bestStreak * 4)) : 0;
    parts.push({ label: t.monitor.habits, score: habitScore, weight: 2 });

    const focusScore = Math.min(100, Math.round((m.weekFocus / 300) * 100));
    parts.push({ label: t.monitor.focus, score: focusScore, weight: 1 });

    const studyScore = Math.min(100, Math.round((m.monthStudy / 12) * 100));
    parts.push({ label: t.monitor.learning, score: studyScore, weight: 1 });

    const wellnessScore = Math.round(
      (Math.min(100, (m.avgSleep / 8) * 100) +
        Math.min(100, (m.avgWater / 8) * 100) +
        Math.min(100, (m.daysExercised / 8) * 100) * 1.5 +
        (m.avgMood ? Math.min(100, (m.avgMood / 5) * 100) : 0)) /
        (m.avgMood ? 4.5 : 3.5)
    );
    parts.push({ label: t.monitor.wellness, score: wellnessScore, weight: 2 });

    const careerScore = skills.length || careerGoals.length ? Math.round(m.skillProgress * 0.6 + (m.activeCareer ? 40 : 20)) : 0;
    parts.push({ label: t.monitor.career, score: careerScore, weight: 1 });

    const used = parts.filter((p) => p.score > 0);
    if (!used.length) return { score: 0, parts: [] };
    const totalWeight = used.reduce((s, p) => s + p.weight, 0);
    const score = Math.round(used.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight);
    return { score, parts: used.map((p) => ({ ...p, pct: p.score })) };
  }, [metrics, tasks.length, habits.length, skills, careerGoals.length, totals.monthlyIncome, t]);

  /* ---------- alerts ---------- */

  const alerts = useMemo(() => {
    const list: { icon: string; text: string; status: Status; href: string }[] = [];
    const m = metrics;
    if (m.overdue > 0) list.push({ icon: "⏰", text: `${m.overdue} ${t.monitor.tasksOverdue}`, status: "bad", href: "/app/tasks" });
    const billsSoon = subs.filter((s) => s.next_billing_date && s.next_billing_date >= todayKey && s.next_billing_date <= new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10));
    if (billsSoon.length) list.push({ icon: "💳", text: `${billsSoon.length} ${t.monitor.billsDue}`, status: "warn", href: "/app/subscriptions" });
    if (m.expiringDocs.length) list.push({ icon: "📄", text: `${m.expiringDocs.length} ${t.monitor.expiringDocs}`, status: "warn", href: "/app/digital" });
    if (m.expiringAssets.length) list.push({ icon: "🔐", text: `${m.expiringAssets.length} ${t.monitor.assets} ${t.monitor.expiringSoon}`, status: "warn", href: "/app/digital" });
    const toCancel = subs.filter((s) => s.to_cancel);
    if (toCancel.length) list.push({ icon: "✂️", text: `${toCancel.length} ${t.monitor.subsToCancel}`, status: "warn", href: "/app/subscriptions" });
    const stuck = goals.filter((g) => g.current_amount <= 0 && g.target_amount > 0);
    if (stuck.length) list.push({ icon: "🎯", text: `${stuck.length} ${t.monitor.stuckGoals}`, status: "warn", href: "/app/goals" });
    const birthdays = contacts.filter((c) => c.birthday).filter((c) => {
      const b = new Date(c.birthday!);
      const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if (next < now) next.setFullYear(now.getFullYear() + 1);
      return next.getTime() - now.getTime() <= 14 * 86400000;
    });
    if (birthdays.length) list.push({ icon: "🎂", text: `${birthdays.length} ${t.monitor.birthdays}`, status: "info", href: "/app/people" });
    return list;
  }, [metrics, subs, goals, contacts, now, todayKey, t]);

  /* ---------- trend chart ---------- */

  const trendData = useMemo(() => {
    const rows: { name: string; income: number; expenses: number; focus: number; study: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
      const inMonth = tx.filter((x) => x.date >= key && x.date < nextKey);
      const income = inMonth.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
      const expenses = -inMonth.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0);
      const foc = focus.filter((f) => {
        const fd = new Date(f.started_at);
        return fd >= d && fd < next;
      }).reduce((s, f) => s + f.minutes, 0);
      const studyHours = study.filter((s) => s.date >= key.slice(0, 10) && s.date < nextKey.slice(0, 10)).reduce((s, x) => s + x.minutes, 0) / 60;
      rows.push({
        name: d.toLocaleDateString(profile?.language === "en" ? "en-GB" : profile?.language === "es" ? "es-ES" : profile?.language === "fr" ? "fr-FR" : "pt-PT", { month: "short" }),
        income: Math.round(income),
        expenses: Math.round(expenses),
        focus: foc,
        study: Math.round(studyHours * 10) / 10,
      });
    }
    return rows;
  }, [tx, focus, study, now, profile?.language]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const scoreLabel = lifeScore.score >= 80 ? t.monitor.excellent : lifeScore.score >= 60 ? t.monitor.good : lifeScore.score >= 40 ? t.monitor.fair : t.monitor.low;
  const scoreTone = lifeScore.score >= 80 ? "from-emerald-500/20 to-teal-500/10" : lifeScore.score >= 60 ? "from-indigo-500/20 to-violet-500/10" : lifeScore.score >= 40 ? "from-amber-500/20 to-orange-500/10" : "from-rose-500/20 to-red-500/10";

  const areas: {
    key: string;
    icon: typeof Wallet;
    title: string;
    href: string;
    status: Status;
    main: string;
    sub: { label: string; value: string; tone?: string }[];
  }[] = [
    {
      key: "money",
      icon: Wallet,
      title: t.monitor.money,
      href: "/app/money",
      status: totals.monthlyIncome > 0 ? (metrics.mk >= 10 ? "good" : metrics.mk >= 0 ? "warn" : "bad") : "info",
      main: formatMoney(totals.totalBalance, currency),
      sub: [
        { label: t.monitor.income, value: formatMoney(totals.monthlyIncome, currency), tone: "text-emerald-400" },
        { label: t.monitor.expenses, value: formatMoney(totals.monthlyExpenses, currency), tone: "text-rose-400" },
        { label: t.monitor.savingsRate, value: `${totals.savingsRate}%`, tone: "text-sky-400" },
        { label: t.monitor.subsMonthly, value: formatMoney(metrics.subsMonthly, currency) },
      ],
    },
    {
      key: "goals",
      icon: Sparkles,
      title: t.monitor.goalsProgress,
      href: "/app/goals",
      status: metrics.activeGoals.length ? "good" : "info",
      main: `${metrics.goalPct}%`,
      sub: [
        { label: t.monitor.goalsProgress, value: `${metrics.goalPct}%` },
        { label: t.monitor.careerGoals, value: String(metrics.activeGoals.length) },
      ],
    },
    {
      key: "tasks",
      icon: CheckSquare,
      title: t.monitor.tasks,
      href: "/app/tasks",
      status: metrics.overdue > 0 ? "bad" : metrics.openTasks > 0 ? "warn" : "good",
      main: `${metrics.openTasks} ${t.monitor.open}`,
      sub: [
        { label: t.monitor.done, value: String(metrics.doneTasks), tone: "text-emerald-400" },
        { label: t.monitor.overdue, value: String(metrics.overdue), tone: metrics.overdue > 0 ? "text-rose-400" : undefined },
        { label: t.monitor.completionRate, value: `${metrics.completionRate}%`, tone: "text-sky-400" },
      ],
    },
    {
      key: "habits",
      icon: Flame,
      title: t.monitor.habits,
      href: "/app/habits",
      status: !habits.length ? "info" : metrics.consistency >= 70 ? "good" : metrics.consistency >= 40 ? "warn" : "bad",
      main: `${metrics.bestStreak} ${t.monitor.streak}`,
      sub: [
        { label: t.monitor.consistency, value: `${metrics.consistency}%`, tone: "text-amber-400" },
        { label: t.monitor.habitsWeek, value: String(metrics.weekComps) },
      ],
    },
    {
      key: "calendar",
      icon: CalendarDays,
      title: t.monitor.calendar,
      href: "/app/calendar",
      status: metrics.eventCount ? "info" : "info",
      main: `${metrics.eventCount} ${t.monitor.eventsWeek}`,
      sub: [
        { label: t.monitor.calendar, value: `${metrics.eventCount} ${t.monitor.eventsWeek}` },
      ],
    },
    {
      key: "focus",
      icon: Timer,
      title: t.monitor.focus,
      href: "/app/focus",
      status: metrics.weekFocus >= 300 ? "good" : metrics.weekFocus >= 150 ? "warn" : metrics.weekFocus ? "bad" : "info",
      main: `${metrics.weekFocus} ${t.monitor.focusMinutes}`,
      sub: [
        { label: t.monitor.focusMinutes, value: `${metrics.weekFocus}m`, tone: "text-indigo-400" },
      ],
    },
    {
      key: "learning",
      icon: BookOpen,
      title: t.monitor.learning,
      href: "/app/learning",
      status: metrics.monthStudy >= 10 ? "good" : metrics.monthStudy >= 4 ? "warn" : "info",
      main: `${Math.round(metrics.monthStudy * 10) / 10}h ${t.monitor.studyHours}`,
      sub: [
        { label: t.monitor.studyHours, value: `${Math.round(metrics.monthStudy * 10) / 10}h`, tone: "text-violet-400" },
        { label: t.monitor.booksReading, value: String(metrics.reading) },
        { label: t.monitor.courses, value: String(metrics.coursesActive) },
      ],
    },
    {
      key: "wellness",
      icon: HeartPulse,
      title: t.monitor.wellness,
      href: "/app/wellness",
      status: !sleep.length && !water.length && !exercise.length ? "info" : metrics.avgSleep >= 7 && metrics.daysExercised >= 4 ? "good" : metrics.avgSleep >= 6 ? "warn" : "bad",
      main: metrics.avgSleep ? `${Math.round(metrics.avgSleep * 10) / 10}h ${t.monitor.avgSleep}` : t.monitor.noData,
      sub: [
        { label: t.monitor.avgSleep, value: metrics.avgSleep ? `${Math.round(metrics.avgSleep * 10) / 10}h` : "—" },
        { label: t.monitor.water, value: metrics.avgWater ? `${Math.round(metrics.avgWater * 10) / 10} 🥛` : "—" },
        { label: t.monitor.exerciseDays, value: String(metrics.daysExercised) },
        { label: t.monitor.moodAvg, value: metrics.avgMood ? `${Math.round(metrics.avgMood * 10) / 10}/5` : "—" },
      ],
    },
    {
      key: "career",
      icon: Briefcase,
      title: t.monitor.career,
      href: "/app/career",
      status: !skills.length && !careerGoals.length ? "info" : metrics.skillProgress >= 60 ? "good" : "warn",
      main: `${metrics.activeCareer} ${t.monitor.careerGoals}`,
      sub: [
        { label: t.monitor.skills, value: `${metrics.skillProgress}%`, tone: "text-indigo-400" },
        { label: t.monitor.applications, value: String(metrics.openApps) },
      ],
    },
    {
      key: "travel",
      icon: Plane,
      title: t.monitor.travel,
      href: "/app/travel",
      status: metrics.upcomingTrip ? "good" : "info",
      main: metrics.upcomingTrip?.destination ?? t.monitor.noData,
      sub: [
        { label: t.monitor.nextTrip, value: metrics.upcomingTrip ? `${metrics.upcomingTrip.destination} · ${metrics.upcomingTrip.start_date ?? "—"}` : "—" },
        { label: t.monitor.tripsPlanned, value: String(metrics.plannedTrips) },
      ],
    },
    {
      key: "social",
      icon: Users,
      title: t.monitor.social,
      href: "/app/social",
      status: metrics.openShared ? "warn" : "info",
      main: `${metrics.openShared} ${t.monitor.sharedExpenses}`,
      sub: [
        { label: t.monitor.sharedExpenses, value: String(metrics.openShared) },
      ],
    },
    {
      key: "digital",
      icon: FolderOpen,
      title: t.monitor.digital,
      href: "/app/digital",
      status: metrics.expiringDocs.length || metrics.expiringAssets.length ? "warn" : "info",
      main: `${metrics.expiringDocs.length + metrics.expiringAssets.length} ${t.monitor.expiringSoon}`,
      sub: [
        { label: t.monitor.assets, value: String(assets.length) },
        { label: t.monitor.expiringDocs, value: String(metrics.expiringDocs.length), tone: metrics.expiringDocs.length ? "text-amber-400" : undefined },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.monitor.title}
        subtitle={loadedAt ? `${t.monitor.updated} ${loadedAt.toLocaleTimeString(profile?.language === "en" ? "en-GB" : profile?.language === "es" ? "es-ES" : profile?.language === "fr" ? "fr-FR" : "pt-PT", { hour: "2-digit", minute: "2-digit" })}` : t.monitor.subtitle}
      />

      {/* Life score */}
      <Card className={`bg-gradient-to-r ${scoreTone} border-transparent`}>
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative h-28 w-28 shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="9" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={lifeScore.score >= 80 ? "#34d399" : lifeScore.score >= 60 ? "#818cf8" : lifeScore.score >= 40 ? "#fbbf24" : "#fb7185"}
                strokeWidth="9" strokeLinecap="round"
                strokeDasharray={`${(lifeScore.score / 100) * 264} 264`}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100">{lifeScore.score}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">{t.monitor.lifeScore}</p>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">{scoreLabel}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {lifeScore.parts.map((p) => (
                <div key={p.label}>
                  <div className="mb-0.5 flex items-center justify-between text-[11px]">
                    <span className="truncate text-zinc-500 dark:text-zinc-400">{p.label}</span>
                    <span className="ml-2 shrink-0 text-zinc-500">{p.pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {lifeScore.score === 0 && (
              <p className="mt-3 text-xs text-zinc-500">{t.monitor.emptyScore}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Alerts */}
      <Card>
        <CardHeader
          title={t.monitor.alerts}
          action={alerts.length ? <Badge color="red">{alerts.length}</Badge> : undefined}
        />
        {alerts.length === 0 ? (
          <p className="py-1 text-sm text-zinc-500 dark:text-zinc-400">{t.monitor.noAlerts}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {alerts.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition hover:bg-zinc-100 dark:bg-white/8 ${statusTone(a.status)}`}
              >
                <span className="text-base">{a.icon}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">{a.text}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Areas grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => (
          <Link key={a.key} href={a.href}>
            <Card className={`h-full transition hover:bg-zinc-100 dark:bg-white/8 ${statusTone(a.status)}`}>
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/15">
                  <a.icon className="h-4 w-4 text-indigo-400" />
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200">{a.title}</p>
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(a.status)}`} />
              </div>
              <p className="truncate text-lg font-bold tracking-tight text-zinc-800 dark:text-zinc-100">{a.main}</p>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {a.sub.map((s, si) => (
                  <p key={si} className="truncate text-[11px] text-zinc-500">
                    <span className="text-zinc-500 dark:text-zinc-400">{s.label}: </span>
                    <span className={s.tone ?? "text-zinc-600 dark:text-zinc-300"}>{s.value}</span>
                  </p>
                ))}
              </div>
              <p className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-indigo-400">
                {t.monitor.viewAll} <ArrowRight className="h-3 w-3" />
              </p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Trend */}
      <Card>
        <CardHeader
          title={t.monitor.trend}
          subtitle={t.monitor.last6Months}
          action={<BarChart3 className="h-4 w-4 text-zinc-500" />}
        />
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                formatter={(v, name) => [
                  name === "income" || name === "expenses"
                    ? formatMoney(Number(v), currency)
                    : name === "focus"
                      ? `${v} min`
                      : `${v}h`,
                  name === "income" ? t.monitor.income : name === "expenses" ? t.monitor.expenses : name === "focus" ? t.monitor.focus : t.monitor.studyHours,
                ]}
              />
              <Bar dataKey="income" fill="#10b981" radius={[5, 5, 0, 0]} />
              <Bar dataKey="expenses" fill="#f43f5e" radius={[5, 5, 0, 0]} />
              <Bar dataKey="focus" fill="#818cf8" radius={[5, 5, 0, 0]} />
              <Bar dataKey="study" fill="#a78bfa" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> {t.monitor.income}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /> {t.monitor.expenses}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-400" /> {t.monitor.focus}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" /> {t.monitor.studyHours}</span>
        </div>
      </Card>
    </div>
  );
}