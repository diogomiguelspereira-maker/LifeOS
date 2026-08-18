import type { Task } from "./types";

/* ------------------------------------------------------------------ */
/* Automatic task breakdown (#17)                                      */
/* ------------------------------------------------------------------ */

export interface BreakdownSuggestion {
  title: string;
  estimated_minutes: number;
}

const BREAKDOWN_TEMPLATES: { match: RegExp; items: BreakdownSuggestion[] }[] = [
  {
    match: /portfolio|portf[óo]lio/i,
    items: [
      { title: "Escolher 2-3 projetos", estimated_minutes: 30 },
      { title: "Escrever as descrições dos projetos", estimated_minutes: 60 },
      { title: "Criar a estrutura do site", estimated_minutes: 90 },
      { title: "Adicionar links (GitHub, redes)", estimated_minutes: 30 },
      { title: "Publicar e testar em mobile", estimated_minutes: 60 },
    ],
  },
  {
    match: /cv|curr[ií]culo|curriculum/i,
    items: [
      { title: "Listar experiências e formações", estimated_minutes: 45 },
      { title: "Escrever o resumo/objetivo", estimated_minutes: 30 },
      { title: "Desenhar o layout do CV", estimated_minutes: 60 },
      { title: "Rever e pedir opinião", estimated_minutes: 30 },
      { title: "Exportar em PDF", estimated_minutes: 15 },
    ],
  },
  {
    match: /viagem|f[ée]rias|trip|travel/i,
    items: [
      { title: "Reservar transporte", estimated_minutes: 60 },
      { title: "Reservar alojamento", estimated_minutes: 45 },
      { title: "Criar o itinerário por dias", estimated_minutes: 60 },
      { title: "Fazer a packing list", estimated_minutes: 20 },
      { title: "Confirmar documentos (passaporte, seguro)", estimated_minutes: 15 },
    ],
  },
  {
    match: /exame|exam|estudar|study|teste|prova/i,
    items: [
      { title: "Fazer o plano de estudo", estimated_minutes: 20 },
      { title: "Rever apontamentos das aulas", estimated_minutes: 120 },
      { title: "Fazer exercícios práticos", estimated_minutes: 120 },
      { title: "Fazer um simulado", estimated_minutes: 90 },
      { title: "Rever erros e pontos fracos", estimated_minutes: 60 },
    ],
  },
  {
    match: /tese|thesis|trabalho final|monografia/i,
    items: [
      { title: "Definir a estrutura/capítulos", estimated_minutes: 45 },
      { title: "Recolher fontes e referências", estimated_minutes: 90 },
      { title: "Escrever a introdução", estimated_minutes: 90 },
      { title: "Desenvolver o corpo do trabalho", estimated_minutes: 240 },
      { title: "Rever, formatar e entregar", estimated_minutes: 120 },
    ],
  },
  {
    match: /app|aplica[çc][ãa]o|website|site/i,
    items: [
      { title: "Definir as funcionalidades principais", estimated_minutes: 45 },
      { title: "Criar o protótipo das ecrãs", estimated_minutes: 120 },
      { title: "Construir o núcleo da app", estimated_minutes: 240 },
      { title: "Testar e corrigir erros", estimated_minutes: 90 },
      { title: "Publicar", estimated_minutes: 60 },
    ],
  },
  {
    match: /limpar|arrumar|casa|apartamento|quarto/i,
    items: [
      { title: "Limpar a cozinha", estimated_minutes: 30 },
      { title: "Limpar a casa de banho", estimated_minutes: 20 },
      { title: "Aspirar/varrer os quartos", estimated_minutes: 30 },
      { title: "Lavar a roupa", estimated_minutes: 15 },
      { title: "Arrumar as superfícies", estimated_minutes: 25 },
    ],
  },
  {
    match: /presente|gift|anivers[aá]rio|birthday/i,
    items: [
      { title: "Fazer uma lista de ideias", estimated_minutes: 15 },
      { title: "Escolher e comprar o presente", estimated_minutes: 45 },
      { title: "Embrulhar", estimated_minutes: 15 },
      { title: "Planejar a celebração", estimated_minutes: 30 },
    ],
  },
];

/** Rule-based subtask suggestions for a task title (null = no template). */
export function breakdownSuggestions(title: string, notes = ""): BreakdownSuggestion[] | null {
  const text = `${title} ${notes}`.toLowerCase();
  for (const tpl of BREAKDOWN_TEMPLATES) {
    if (tpl.match.test(text)) return tpl.items;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Deadline study plan (#18)                                           */
/* ------------------------------------------------------------------ */

export interface StudySessionSlot {
  date: Date;
  minutes: number;
}

export interface DeadlinePlan {
  daysRemaining: number;
  totalMinutes: number;
  sessionMinutes: number;
  sessionsNeeded: number;
  cadenceDays: number[]; // weekdays (0=Sun) for the recommended cadence
  schedule: StudySessionSlot[]; // concrete upcoming evening sessions
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Recommended study plan for a task with a deadline + estimated effort.
 * Session length adapts to the runway; sessions are scheduled on the
 * recommended weekdays at 19:00 until the deadline (max `maxSessions`).
 */
export function deadlinePlan(task: Task, now = new Date(), maxSessions = 8): DeadlinePlan | null {
  if (!task.due_date) return null;
  const today = startOfDay(now);
  const due = startOfDay(new Date(task.due_date));
  const daysRemaining = Math.max(0, Math.round((due.getTime() - today.getTime()) / 86400000));
  if (daysRemaining <= 0) return null;

  const totalMinutes = task.estimated_minutes ?? 60;
  const sessionMinutes = daysRemaining >= 14 ? 45 : daysRemaining >= 5 ? 60 : 90;
  const sessionsNeeded = Math.max(1, Math.ceil(totalMinutes / sessionMinutes));

  // Weekday pattern: short runway → every day; medium → Mon/Wed/Fri; long → Tue/Thu
  const cadenceDays = daysRemaining <= 4 ? [0, 1, 2, 3, 4, 5, 6] : daysRemaining >= 14 ? [2, 4] : [1, 3, 5];

  const schedule: StudySessionSlot[] = [];
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1);
  while (schedule.length < Math.min(sessionsNeeded, maxSessions) && cursor.getTime() <= due.getTime()) {
    if (cadenceDays.includes(cursor.getDay())) {
      const slot = new Date(cursor);
      slot.setHours(19, 0, 0, 0);
      schedule.push({ date: slot, minutes: sessionMinutes });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { daysRemaining, totalMinutes, sessionMinutes, sessionsNeeded, cadenceDays, schedule };
}

/* ------------------------------------------------------------------ */
/* Deadline risk (#19)                                                 */
/* ------------------------------------------------------------------ */

export interface DeadlineRisk {
  severity: "high" | "medium";
  missByDays: number;
  requiredPerDay: number; // minutes/day needed to finish on time
}

/**
 * Estimate whether a task's estimated effort fits the remaining time.
 * `dailyFreeMinutes` is the assumed daily available time (default 2h).
 * Always an estimate — used for warnings, never as a hard verdict.
 */
export function deadlineRisk(task: Task, dailyFreeMinutes = 120, now = new Date()): DeadlineRisk | null {
  if (!task.due_date || task.status === "done") return null;
  const today = startOfDay(now);
  const due = startOfDay(new Date(task.due_date));
  const daysRemaining = Math.max(0, Math.round((due.getTime() - today.getTime()) / 86400000));
  const total = task.estimated_minutes ?? 0;
  if (daysRemaining <= 0 || total <= 0) return null;

  const available = daysRemaining * dailyFreeMinutes;
  if (total <= available) return null;

  const missByDays = Math.ceil((total - available) / dailyFreeMinutes);
  return {
    severity: missByDays >= 3 ? "high" : "medium",
    missByDays,
    requiredPerDay: Math.ceil(total / daysRemaining),
  };
}

/* ------------------------------------------------------------------ */
/* Micro-tasks (#55)                                                   */
/* ------------------------------------------------------------------ */

export type MicroBucket = "all" | "quick" | "medium" | "deep";

/** Does a task fit a time bucket (quick ≤15m, medium ≤40m, deep >40m)? */
export function microMatches(task: Task, bucket: MicroBucket): boolean {
  if (bucket === "all") return true;
  const est = task.estimated_minutes ?? 20;
  if (bucket === "quick") return est <= 15;
  if (bucket === "medium") return est > 15 && est <= 40;
  return est > 40;
}
