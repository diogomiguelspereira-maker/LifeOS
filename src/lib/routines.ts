import type { Routine, RoutineStep } from "./types";

/** "HH:MM" -> minutes since midnight. */
export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Does this routine run on the given date? */
export function routineOnDay(r: Routine, date = new Date()): boolean {
  if (!r.active) return false;
  const day = date.getDay(); // 0 = Sunday
  if (r.days === "weekdays") return day >= 1 && day <= 5;
  if (r.days === "weekend") return day === 0 || day === 6;
  return true;
}

export function sortSteps(steps: RoutineStep[]): RoutineStep[] {
  return [...steps].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

export function stepsForRoutine(routineId: string, steps: RoutineStep[]): RoutineStep[] {
  return sortSteps(steps.filter((s) => s.routine_id === routineId));
}

export interface RoutineNow {
  routine: Routine;
  steps: RoutineStep[];
  /** index of the step currently in progress, or -1 */
  currentIndex: number;
  /** index of the next upcoming step, or -1 */
  nextIndex: number;
}

/**
 * Pick the routine to surface right now: the active routine running today
 * that started most recently (or the earliest upcoming one if none started).
 */
export function currentRoutine(
  routines: Routine[],
  steps: RoutineStep[],
  now = new Date()
): RoutineNow | null {
  const today = routines.filter((r) => routineOnDay(r, now));
  if (today.length === 0) return null;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const withStart = today.map((r) => ({ r, start: toMinutes(r.start_time), list: stepsForRoutine(r.id, steps) }));
  const started = withStart.filter((x) => x.start <= nowMin);
  const pick = started.length > 0 ? started.sort((a, b) => b.start - a.start)[0] : withStart.sort((a, b) => a.start - b.start)[0];
  if (!pick) return null;

  let currentIndex = -1;
  let nextIndex = -1;
  pick.list.forEach((s, i) => {
    const sMin = toMinutes(s.time);
    const eMin = sMin + (s.duration_minutes || 15);
    if (sMin <= nowMin && nowMin < eMin) currentIndex = i;
    if (nextIndex === -1 && sMin > nowMin) nextIndex = i;
  });

  return { routine: pick.r, steps: pick.list, currentIndex, nextIndex };
}

export interface RoutinePreset {
  name: string;
  icon: string;
  color: string;
  days: Routine["days"];
  start_time: string;
  steps: { title: string; time: string; duration_minutes: number }[];
}

export const ROUTINE_PRESETS: RoutinePreset[] = [
  {
    name: "Manhã",
    icon: "🌅",
    color: "#f59e0b",
    days: "daily",
    start_time: "07:30",
    steps: [
      { title: "Acordar", time: "07:30", duration_minutes: 5 },
      { title: "Água", time: "07:35", duration_minutes: 5 },
      { title: "Duche", time: "07:40", duration_minutes: 15 },
      { title: "Pequeno-almoço", time: "07:55", duration_minutes: 20 },
      { title: "Ver calendário", time: "08:15", duration_minutes: 5 },
      { title: "Sair", time: "08:30", duration_minutes: 15 },
    ],
  },
  {
    name: "Trabalho",
    icon: "💼",
    color: "#6366f1",
    days: "weekdays",
    start_time: "09:00",
    steps: [
      { title: "Começar a trabalhar", time: "09:00", duration_minutes: 5 },
      { title: "Pausa", time: "11:00", duration_minutes: 10 },
      { title: "Almoço", time: "13:00", duration_minutes: 45 },
      { title: "Revisão do dia", time: "18:00", duration_minutes: 10 },
    ],
  },
  {
    name: "Noite",
    icon: "🌙",
    color: "#8b5cf6",
    days: "daily",
    start_time: "19:30",
    steps: [
      { title: "Ginásio", time: "19:30", duration_minutes: 60 },
      { title: "Jantar", time: "20:45", duration_minutes: 30 },
      { title: "Projeto pessoal", time: "21:30", duration_minutes: 60 },
      { title: "Preparar amanhã", time: "22:45", duration_minutes: 10 },
      { title: "Rotina de sono", time: "23:00", duration_minutes: 20 },
    ],
  },
];
