import type { SupabaseClient } from "@supabase/supabase-js";
import { api, currentMonthTransactions, moneyTotals } from "./api";
import { avgDailySpend, nextPayday, safeToSpend } from "./finance";
import { nowStatus, type NowStatus } from "./now";
import type { CalendarEvent, Profile, Task } from "./types";

export interface PersonalContext {
  now: NowStatus;
  profile: Profile | null;
  money: {
    available: number;
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    savingsRate: number;
    safeToSpend: number;
    dailySafe: number;
    nextPayday: string | null;
    paydayDays: number | null;
    emergencyFundTarget: number;
  };
  todayTasks: Task[];
  overdueTasks: Task[];
  events: CalendarEvent[];
  goals: { name: string; current: number; target: number; pct: number }[];
  habitsDueToday: number;
  learningHours30d: number;
  hasTripSoon: string | null;
  expiringDocs: string[];
  billsDueSoon: string[];
}

/** Build the full personal context for the current user. */
export async function buildPersonalContext(supabase: SupabaseClient): Promise<PersonalContext> {
  const [profile, tx, accounts, cats, tasks, events, goals, subs, habits, completions, study, trips, docs, income] = await Promise.all([
    api.profile(supabase),
    api.allTransactions(supabase, 300),
    api.accounts(supabase),
    api.categories(supabase),
    api.tasks(supabase),
    (async () => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      const end = new Date(d.getTime() + 31 * 86400000);
      return api.events(supabase, new Date(Date.now() - 3 * 86400000).toISOString(), end.toISOString());
    })(),
    api.goals(supabase),
    api.subscriptions(supabase),
    api.habits(supabase),
    api.completions(supabase, new Date().toISOString().slice(0, 10)),
    api.studySessions(supabase, 30),
    api.trips(supabase),
    api.documents(supabase),
    api.incomeSchedule(supabase),
  ]);

  const monthTx = currentMonthTransactions(tx);
  const totals = moneyTotals(accounts, monthTx, profile);

  const payday = nextPayday(income);
  const avg = avgDailySpend(tx);
  const safe = safeToSpend(totals.totalBalance, income, subs, avg);
  const effTarget = (totals.monthlyExpenses || profile?.typical_expenses || 0) * 3;

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const todayTasks = tasks.filter((x) => x.status !== "done" && x.due_date === todayKey);
  const overdueTasks = tasks.filter((x) => x.status !== "done" && x.due_date && x.due_date < todayKey);
  const habitDone = new Set(completions.map((c) => c.habit_id));
  const habitsDueToday = habits.filter((h) => !habitDone.has(h.id)).length;

  const learningHours30d = Math.round(study.reduce((s, x) => s + x.minutes, 0) / 60);

  const upcomingTrip = trips
    .filter((tr) => tr.start_date && tr.start_date >= todayKey)
    .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1))[0];
  const hasTripSoon = upcomingTrip && upcomingTrip.start_date! <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
    ? `${upcomingTrip.destination} em ${Math.max(1, Math.round((new Date(upcomingTrip.start_date!).getTime() - Date.now()) / 86400000))} dias`
    : null;

  const days = (d: string) => Math.round((new Date(d).getTime() - Date.now()) / 86400000);
  const expiringDocs = docs
    .filter((d) => d.expiry_date && days(d.expiry_date) <= 30 && days(d.expiry_date) >= 0)
    .map((d) => d.name);
  const billsDueSoon = subs
    .filter((s) => s.next_billing_date && days(s.next_billing_date) <= 3 && days(s.next_billing_date) >= 0)
    .map((s) => s.name);

  return {
    now: nowStatus(events, now),
    profile,
    money: {
      available: totals.available,
      totalBalance: totals.totalBalance,
      monthlyIncome: totals.monthlyIncome,
      monthlyExpenses: totals.monthlyExpenses,
      savingsRate: totals.savingsRate,
      safeToSpend: Math.round(safe.amount),
      dailySafe: payday ? Math.round(safe.amount / Math.max(1, payday.days)) : Math.round(safe.amount),
      nextPayday: payday ? payday.date.toISOString().slice(0, 10) : null,
      paydayDays: payday?.days ?? null,
      emergencyFundTarget: effTarget,
    },
    todayTasks,
    overdueTasks,
    events: events.filter((e) => new Date(e.start_at).getTime() >= new Date(now).setHours(0, 0, 0, 0)).slice(0, 10),
    goals: goals.map((g) => ({
      name: g.name,
      current: g.current_amount,
      target: g.target_amount,
      pct: g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0,
    })),
    habitsDueToday,
    learningHours30d,
    hasTripSoon,
    expiringDocs,
    billsDueSoon,
  };
}
