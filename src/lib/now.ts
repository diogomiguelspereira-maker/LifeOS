import type { CalendarEvent, Task } from "./types";

export interface FreeGap {
  start: Date;
  end: Date;
  minutes: number;
}

export interface NowStatus {
  busy: boolean;
  label: string;
  currentEvent: CalendarEvent | null;
  nextEvent: CalendarEvent | null;
  currentEventEndsIn: number | null; // minutes
  nextIn: number | null; // minutes
  nextTravelHint: string | null;
  gaps: FreeGap[];
  gapUntilNext: number | null; // free minutes until next event
}

/** Compute free gaps between events (8h–23h), skipping overlaps. */
export function freeGaps(events: CalendarEvent[], now = new Date()): FreeGap[] {
  const dayStartMs = new Date(now).setHours(0, 0, 0, 0);
  const dayEndMs = new Date(now).setHours(23, 59, 59, 0);
  const busy: [number, number][] = [];
  for (const e of events) {
    const s = new Date(e.start_at).getTime();
    if (e.all_day || s < dayStartMs || s > dayEndMs) continue;
    const en = e.end_at ? new Date(e.end_at).getTime() : s + 3600000;
    busy.push([s, en]);
  }
  busy.sort((a, b) => a[0] - b[0]);

  const dayStart = new Date(now);
  dayStart.setHours(8, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 0, 0, 0);

  const out: FreeGap[] = [];
  let cur = dayStart.getTime();
  for (const [s, e] of busy) {
    if (s > cur && s - cur >= 15 * 60000) out.push({ start: new Date(cur), end: new Date(s), minutes: Math.round((s - cur) / 60000) });
    cur = Math.max(cur, e);
  }
  if (dayEnd.getTime() - cur >= 15 * 60000) out.push({ start: new Date(cur), end: dayEnd, minutes: Math.round((dayEnd.getTime() - cur) / 60000) });
  return out;
}

/** Current NOW status: busy in an event, free, or about to leave. */
export function nowStatus(events: CalendarEvent[], now = new Date()): NowStatus {
  const nowMs = now.getTime();
  const timed = events.filter((e) => !e.all_day).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  const current = timed.find((e) => {
    const s = new Date(e.start_at).getTime();
    const en = e.end_at ? new Date(e.end_at).getTime() : s + 3600000;
    return s <= nowMs && nowMs < en;
  });

  const next = timed.find((e) => new Date(e.start_at).getTime() > nowMs);

  const gaps = freeGaps(events, now);
  const gapUntilNext = next ? Math.round((new Date(next.start_at).getTime() - nowMs) / 60000) : gaps.length ? gaps[0].minutes : null;

  let label = "free";
  if (current) label = "busy";
  else if (next && new Date(next.start_at).getTime() - nowMs < 45 * 60000) label = "leave";

  return {
    busy: Boolean(current),
    label,
    currentEvent: current ?? null,
    nextEvent: next ?? null,
    currentEventEndsIn: current && current.end_at ? Math.max(0, Math.round((new Date(current.end_at).getTime() - nowMs) / 60000)) : null,
    nextIn: next ? Math.max(0, Math.round((new Date(next.start_at).getTime() - nowMs) / 60000)) : null,
    nextTravelHint: next?.location ? `A próxima é em ${next.location}.` : null,
    gaps,
    gapUntilNext,
  };
}

/** The minimum context the NOW engine needs (built by dashboard or full engine). */
export interface NowContext {
  now: {
    busy: boolean;
    label: string;
    currentEvent: CalendarEvent | null;
    nextEvent: CalendarEvent | null;
    currentEventEndsIn: number | null;
    nextIn: number | null;
    nextTravelHint: string | null;
    gaps: { start: Date; end: Date; minutes: number }[];
    gapUntilNext: number | null;
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
  money: { safeToSpend: number; nextPayday: string | null; paydayDays: number | null };
}

export interface Suggestion {
  icon: string;
  title: string;
  duration: number | null; // minutes
  kind: "task" | "habit" | "event" | "chore" | "break" | "learning" | "errand";
  reason: string;
  id?: string; // task id when kind === task
}

/** Pick micro/medium/deep tasks that fit the available time. */
function tasksFor(minutes: number, tasks: Task[], overdue: Task[]): Suggestion[] {
  const open = [...overdue, ...tasks].filter((t) => t.status !== "done");
  const out: Suggestion[] = [];
  for (const t of open) {
    const est = t.estimated_minutes ?? 20;
    if (est <= minutes + 10) {
      out.push({
        icon: t.estimated_minutes && t.estimated_minutes <= 15 ? "⚡" : "🎯",
        title: t.title,
        duration: est,
        kind: "task",
        reason: t.due_date && t.due_date < new Date().toISOString().slice(0, 10) ? "está atrasada" : "encaixa no tempo livre",
        id: t.id,
      });
    }
    if (out.length >= 3) break;
  }
  return out;
}

/** The signature free-time engine: what should I do with N free minutes? */
export function whatShouldIDo(ctx: NowContext, minutes: number | null = null): Suggestion[] {
  const free = minutes ?? (ctx.now.gapUntilNext ?? ctx.now.gaps[0]?.minutes ?? 30);
  const out: Suggestion[] = [];

  // 1. Overdue/today tasks that fit
  out.push(...tasksFor(Math.max(10, free), ctx.todayTasks, ctx.overdueTasks));

  // 2. Habits not done today (quick wins)
  if (ctx.habitsDueToday > 0 && out.length < 3) {
    out.push({
      icon: "🔥",
      title: `${ctx.habitsDueToday} hábito(s) por completar`,
      duration: Math.min(10, free),
      kind: "habit",
      reason: "5 minutos bastam para manter a sequência",
    });
  }

  // 3. Learning if studying recently
  if (ctx.learningHours30d > 0 && out.length < 4 && free >= 20) {
    out.push({
      icon: "📚",
      title: "Sessão de estudo",
      duration: Math.min(30, free),
      kind: "learning",
      reason: `já estudaste ${ctx.learningHours30d}h este mês`,
    });
  }

  // 4. Errand (docs expiring)
  if (ctx.expiringDocs.length > 0 && out.length < 4) {
    out.push({
      icon: "📄",
      title: `Tratar de ${ctx.expiringDocs[0]}`,
      duration: 10,
      kind: "errand",
      reason: "expira em breve",
    });
  }

  // 5. Break
  out.push({
    icon: "☕",
    title: "Fazer uma pausa",
    duration: Math.min(15, free),
    kind: "break",
    reason: "recuperar energia ajuda o resto do dia",
  });

  return out.slice(0, 5);
}

/** NOW banner text + color for the dashboard. */
export function nowBanner(ctx: NowContext): {
  emoji: string;
  headline: string;
  sub: string;
  tone: "green" | "red" | "amber";
} {
  const n = ctx.now;
  const fmt = (min: number) =>
    min >= 60 ? `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ""}`.trim() : `${min}m`;

  if (n.busy && n.currentEvent) {
    return {
      emoji: "🔴",
      headline: `Agora: ${n.currentEvent.title}`,
      sub: n.currentEventEndsIn != null ? `termina em ${fmt(n.currentEventEndsIn)}` : "em curso",
      tone: "red",
    };
  }
  if (n.label === "leave" && n.nextEvent) {
    return {
      emoji: "🚗",
      headline: `Sair em ${fmt(n.nextIn ?? 0)}`,
      sub: n.nextEvent.title + (n.nextEvent.location ? ` · ${n.nextEvent.location}` : ""),
      tone: "amber",
    };
  }
  if (n.nextEvent) {
    return {
      emoji: "🟢",
      headline: `Livre · ${fmt(n.gapUntilNext ?? 0)} até ao próximo evento`,
      sub: `Próximo: ${n.nextEvent.title} às ${new Date(n.nextEvent.start_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`,
      tone: "green",
    };
  }
  const freeNow = n.gaps[0]?.minutes;
  return {
    emoji: "🌿",
    headline: freeNow ? `Tarde livre · ${fmt(freeNow)} disponíveis` : "Dia livre",
    sub: ctx.overdueTasks.length ? `${ctx.overdueTasks.length} tarefa(s) atrasada(s) para recuperar` : "aproveita para avançar objetivos",
    tone: "green",
  };
}

/** One-line morning/night summary for the dashboard greeting area. */
export function daySummary(ctx: NowContext): string {
  const parts: string[] = [];
  if (ctx.todayTasks.length) parts.push(`${ctx.todayTasks.length} tarefa(s)`);
  if (ctx.events.length) parts.push(`${ctx.events.length} evento(s)`);
  if (ctx.money.safeToSpend > 0) parts.push(`${ctx.money.safeToSpend}€ seguros até ao salário`);
  if (ctx.money.nextPayday) {
    const d = ctx.money.paydayDays;
    if (d != null && d <= 3) parts.push(`salário em ${d} dia(s)`);
  }
  if (ctx.billsDueSoon.length) parts.push(`${ctx.billsDueSoon.length} conta(s) a vencer`);
  if (ctx.hasTripSoon) parts.push(`✈️ ${ctx.hasTripSoon}`);
  return parts.length ? parts.join(" · ") : "Tudo em dia ✨";
}
