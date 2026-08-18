import type {
  CalendarEvent,
  Category,
  FocusSession,
  Habit,
  HabitCompletion,
  SavingsGoal,
  Subscription,
  Task,
  Transaction,
} from "./types";

/* ------------------------------------------------------------------ */
/* Time of day                                                         */
/* ------------------------------------------------------------------ */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function timeOfDay(now = new Date()): TimeOfDay {
  const h = now.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

function startOfDay(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Whole days between a date-only string and today (negative = past). */
function daysAhead(dateStr: string, today: Date): number {
  const a = new Date(dateStr + "T00:00:00");
  const b = startOfDay(today);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/* ------------------------------------------------------------------ */
/* TOP 3 priorities (#53: importance + urgency + consequences)         */
/* ------------------------------------------------------------------ */

export interface Priority {
  icon: string;
  title: string;
  reason: string;
  href?: string;
  tone: "red" | "amber" | "green";
}

function prioBonus(p: Task["priority"]): number {
  return p === "high" ? 12 : p === "medium" ? 6 : 0;
}

/** Rule-based daily priority engine. Returns the 3 most important items. */
export function topPriorities(
  tasks: Task[],
  goals: SavingsGoal[],
  subs: Subscription[],
  now = new Date()
): Priority[] {
  const today = startOfDay(now);
  const key = dayKey(now);
  const open = tasks.filter((x) => x.status !== "done");
  const cands: (Priority & { score: number })[] = [];

  // Overdue tasks — most urgent, real consequences.
  for (const t of open.filter((x) => x.due_date && x.due_date < key)) {
    const days = Math.abs(daysAhead(t.due_date!, today));
    cands.push({
      score: 100 + prioBonus(t.priority) + days,
      icon: "⏰",
      title: t.title,
      reason: days === 0 ? "atrasada" : `atrasada há ${days} dia(s)`,
      href: "/app/tasks",
      tone: "red",
    });
  }

  // Due today.
  for (const t of open.filter((x) => x.due_date === key)) {
    cands.push({
      score: 88 + prioBonus(t.priority),
      icon: "📌",
      title: t.title,
      reason: "vence hoje",
      href: "/app/tasks",
      tone: t.priority === "high" ? "red" : "amber",
    });
  }

  // Due within 3 days.
  for (const t of open.filter((x) => x.due_date && x.due_date > key && daysAhead(x.due_date, today) <= 3)) {
    const d = daysAhead(t.due_date!, today);
    cands.push({
      score: 72 + prioBonus(t.priority) - d * 6,
      icon: "🗓️",
      title: t.title,
      reason: `vence em ${d} dia(s)`,
      href: "/app/tasks",
      tone: d <= 1 ? "amber" : "green",
    });
  }

  // Goals with a deadline within 7 days.
  for (const g of goals.filter((x) => x.deadline && daysAhead(x.deadline, today) >= 0 && daysAhead(x.deadline, today) <= 7 && x.current_amount < x.target_amount)) {
    const d = daysAhead(g.deadline!, today);
    cands.push({
      score: 80 - d * 4,
      icon: "🎯",
      title: g.name,
      reason: `prazo em ${d} dia(s) · ${Math.round((g.current_amount / Math.max(1, g.target_amount)) * 100)}% cumprido`,
      href: "/app/goals",
      tone: d <= 2 ? "red" : "amber",
    });
  }

  // Bills due within 3 days.
  for (const s of subs.filter((x) => x.next_billing_date && daysAhead(x.next_billing_date, today) >= 0 && daysAhead(x.next_billing_date, today) <= 3)) {
    const d = daysAhead(s.next_billing_date!, today);
    cands.push({
      score: 68 - d * 8,
      icon: "💳",
      title: s.name,
      reason: `pagamento de ${s.amount.toFixed(2)}€ em ${d} dia(s)`,
      href: "/app/subscriptions",
      tone: d === 0 ? "red" : "amber",
    });
  }

  // Goal close to completion (needs a push to close).
  for (const g of goals.filter((x) => x.current_amount < x.target_amount && x.monthly_contribution > 0)) {
    const remaining = g.target_amount - g.current_amount;
    if (remaining <= g.monthly_contribution * 1.5) {
      cands.push({
        score: 55,
        icon: "🚀",
        title: `Fechar "${g.name}"`,
        reason: `faltam ${remaining.toFixed(0)}€ — dá para fechar com a contribuição mensal`,
        href: "/app/goals",
        tone: "green",
      });
    }
  }

  // High-priority open tasks with no date.
  for (const t of open.filter((x) => !x.due_date && x.priority === "high")) {
    cands.push({
      score: 50,
      icon: "🔥",
      title: t.title,
      reason: "prioridade alta sem data marcada",
      href: "/app/tasks",
      tone: "amber",
    });
  }

  const seen = new Set<string>();
  const out: Priority[] = [];
  for (const c of cands.sort((a, b) => b.score - a.score)) {
    const key_ = `${c.icon}|${c.title}`;
    if (seen.has(key_)) continue;
    seen.add(key_);
    out.push({ icon: c.icon, title: c.title, reason: c.reason, href: c.href, tone: c.tone });
    if (out.length >= 3) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Activity timeline (#46)                                             */
/* ------------------------------------------------------------------ */

export interface TimelineEntry {
  ts: number;
  time: string;
  icon: string;
  text: string;
  kind: "event" | "focus" | "task" | "money";
  amount?: number; // raw signed amount for money entries (component formats with currency)
}

function fmtHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Chronological feed of today: events, focus sessions, completed tasks, expenses. */
export function activityTimeline(
  events: CalendarEvent[],
  tx: Transaction[],
  focus: FocusSession[],
  tasks: Task[],
  categories: Category[],
  now = new Date()
): TimelineEntry[] {
  const s = startOfDay(now);
  const e = new Date(s.getTime() + 86400000);
  const out: TimelineEntry[] = [];

  const catName = new Map(categories.map((c) => [c.id, c.name]));

  for (const ev of events) {
    if (ev.all_day) continue;
    const d = new Date(ev.start_at);
    if (d >= s && d < e) {
      out.push({
        ts: d.getTime(),
        time: fmtHM(d),
        icon: "📅",
        text: ev.title,
        kind: "event",
      });
    }
  }

  for (const f of focus) {
    const d = new Date(f.started_at);
    if (d >= s && d < e) {
      out.push({
        ts: d.getTime(),
        time: fmtHM(d),
        icon: "🎯",
        text: `${f.minutes} min de foco`,
        kind: "focus",
      });
    }
  }

  for (const t of tasks) {
    if (!t.completed_at) continue;
    const d = new Date(t.completed_at);
    if (d >= s && d < e) {
      out.push({
        ts: d.getTime(),
        time: fmtHM(d),
        icon: "✅",
        text: `Concluíste "${t.title}"`,
        kind: "task",
      });
    }
  }

  for (const x of tx) {
    const d = new Date(x.created_at ?? x.date);
    if (d >= s && d < e) {
      const cat = x.category_id ? catName.get(x.category_id) : null;
      out.push({
        ts: d.getTime(),
        time: fmtHM(d),
        icon: x.amount > 0 ? "💰" : "💳",
        text: (cat ?? x.description) || "Movimento",
        amount: x.amount,
        kind: "money",
      });
    }
  }

  return out.sort((a, b) => a.ts - b.ts);
}

/* ------------------------------------------------------------------ */
/* Day stats + summary (#47)                                           */
/* ------------------------------------------------------------------ */

export interface DayStats {
  tasksDone: number;
  spent: number;
  earned: number;
  focusMinutes: number;
  habitsDone: number;
  habitsTotal: number;
  goalsPct: number;
  eventsToday: number;
  verdict: "great" | "ok" | "quiet" | "empty";
}

export function computeDayStats(
  tasks: Task[],
  tx: Transaction[],
  focus: FocusSession[],
  completions: HabitCompletion[],
  habits: Habit[],
  goals: SavingsGoal[],
  now = new Date()
): DayStats {
  const s = startOfDay(now);
  const e = new Date(s.getTime() + 86400000);
  const key = dayKey(now);

  const tasksDone = tasks.filter((t) => t.completed_at && new Date(t.completed_at) >= s && new Date(t.completed_at) < e).length;
  const dayTx = tx.filter((x) => {
    const d = new Date(x.created_at ?? x.date);
    return d >= s && d < e;
  });
  const spent = Math.abs(dayTx.filter((x) => x.amount < 0).reduce((sum, x) => sum + x.amount, 0));
  const earned = dayTx.filter((x) => x.amount > 0).reduce((sum, x) => sum + x.amount, 0);
  const focusMinutes = focus.filter((f) => new Date(f.started_at) >= s && new Date(f.started_at) < e).reduce((sum, f) => sum + f.minutes, 0);
  const habitsDone = completions.filter((c) => c.date === key).length;
  const totalGoal = goals.reduce((sum, g) => sum + g.target_amount, 0);
  const currentGoal = goals.reduce((sum, g) => sum + g.current_amount, 0);
  const eventsToday = 0; // filled by caller if needed

  let verdict: DayStats["verdict"];
  const hour = now.getHours();
  if (tasksDone >= 2 || focusMinutes >= 60 || (tasksDone >= 1 && habitsDone >= 1)) verdict = "great";
  else if (tasksDone >= 1 || habitsDone >= 1 || spent > 0) verdict = "ok";
  else if (hour >= 18) verdict = "quiet";
  else verdict = "empty";

  return {
    tasksDone,
    spent,
    earned,
    focusMinutes,
    habitsDone,
    habitsTotal: habits.length,
    goalsPct: totalGoal > 0 ? Math.round((currentGoal / totalGoal) * 100) : 0,
    eventsToday,
    verdict,
  };
}

/* ------------------------------------------------------------------ */
/* Tomorrow prep (#21)                                                 */
/* ------------------------------------------------------------------ */

export interface TomorrowPrep {
  events: CalendarEvent[];
  tasks: Task[];
  bills: { name: string; amount: number }[];
  leaveHint: { time: string; location: string } | null;
}

/** What's coming tomorrow: events, tasks, bills + a leave-at hint. */
export function tomorrowPrep(
  events: CalendarEvent[],
  tasks: Task[],
  subs: Subscription[],
  now = new Date()
): TomorrowPrep {
  const s = startOfDay(now);
  const e = new Date(s.getTime() + 86400000);
  const t1 = new Date(e.getTime() + 86400000);
  const key = dayKey(new Date(e));

  const tomorrowEvents = events
    .filter((ev) => {
      const d = new Date(ev.start_at);
      return d >= e && d < t1;
    })
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  const tomorrowTasks = tasks.filter((t) => t.status !== "done" && t.due_date === key);
  const tomorrowBills = subs
    .filter((s2) => s2.next_billing_date && dayKey(new Date(s2.next_billing_date + "T00:00:00")) === key)
    .map((s2) => ({ name: s2.name, amount: s2.amount }));

  // Approximate commute: fixed 20-min buffer before the first timed event with a location.
  const firstLocated = tomorrowEvents.find((ev) => !ev.all_day && ev.location);
  let leaveHint: TomorrowPrep["leaveHint"] = null;
  if (firstLocated) {
    const d = new Date(firstLocated.start_at);
    d.setMinutes(d.getMinutes() - 20);
    leaveHint = { time: fmtHM(d), location: firstLocated.location! };
  }

  return { events: tomorrowEvents, tasks: tomorrowTasks, bills: tomorrowBills, leaveHint };
}
