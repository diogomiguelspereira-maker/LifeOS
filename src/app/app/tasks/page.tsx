"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, Check, ChevronDown, Flag, Loader2, Play, Plus, Trash2, Zap } from "lucide-react";
import {
  breakdownSuggestions,
  deadlinePlan,
  deadlineRisk,
  microMatches,
  type BreakdownSuggestion,
  type MicroBucket,
} from "@/lib/deadlines";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { daysUntil, formatDate, formatTime } from "@/lib/format";
import type { Project, Task } from "@/lib/types";
import { cn } from "@/lib/cn";

type View = "today" | "upcoming" | "inbox" | "completed";

const PRIORITIES = [
  { value: "low", label: "🟢 Baixa" },
  { value: "medium", label: "🟡 Média" },
  { value: "high", label: "🔴 Alta" },
];

function TasksPageInner() {
  const { t, profile } = useApp();
  const supabase = useSupabase();
  const params = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("today");
  const [addOpen, setAddOpen] = useState(false);
  const [quick, setQuick] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [micro, setMicro] = useState<MicroBucket>("all");
  const [subMap, setSubMap] = useState<Record<string, Task[]>>({});
  const [breakdown, setBreakdown] = useState<{ taskId: string; taskTitle: string; items: BreakdownSuggestion[] } | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creatingBlocks, setCreatingBlocks] = useState<string | null>(null);
  const [blocksMsg, setBlocksMsg] = useState<{ taskId: string; created: number } | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const [ts, ps] = await Promise.all([api.tasks(supabase), supabase.from("projects").select("*").eq("status", "active")]);
    setTasks(ts);
    const map: Record<string, Task[]> = {};
    for (const x of ts) if (x.parent_task_id) (map[x.parent_task_id] ??= []).push(x);
    setSubMap(map);
    setProjects((ps.data as Project[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    if (params.get("new") === "1") setAddOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now.getTime() + 86400000);
    // hide subtasks from the main list (they live under their parent) + apply micro filter
    const list = tasks.filter(
      (task) =>
        !task.parent_task_id &&
        (projectFilter === "all" ? true : task.project_id === projectFilter) &&
        microMatches(task, micro)
    );
    switch (view) {
      case "today":
        return list.filter(
          (task) => task.status !== "done" && task.due_date && new Date(task.due_date) >= now && new Date(task.due_date) < todayEnd
        );
      case "upcoming":
        return list.filter((task) => task.status !== "done" && (!task.due_date || new Date(task.due_date) >= todayEnd));
      case "inbox":
        return list.filter((task) => task.status !== "done" && !task.due_date);
      case "completed":
        return list.filter((task) => task.status === "done");
    }
  }, [tasks, view, projectFilter, micro]);

  async function toggleDone(task: Task) {
    const done = task.status === "done";
    await supabase
      .from("tasks")
      .update({ status: done ? "todo" : "done", completed_at: done ? null : new Date().toISOString() })
      .eq("id", task.id);
    load();
  }

  async function deleteTask(id: string) {
    await supabase.from("tasks").delete().eq("id", id);
    load();
  }

  async function quickAdd() {
    if (!quick.trim()) return;
    const parsed = parseNaturalDate(quick);
    const { data } = await supabase.from("tasks").insert({ title: parsed.title, due_date: parsed.due_date }).select();
    setQuick("");
    load();
    maybeSuggestBreakdown((data as Task[] | null)?.[0]);
  }

  async function maybeSuggestBreakdown(task?: Task) {
    if (!task) return;
    setBreakdownLoading(true);
    try {
      const res = await fetch("/api/nova/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: task.title, notes: task.notes ?? "", language: profile?.language }),
      });
      const data = (await res.json()) as { items?: BreakdownSuggestion[] };
      if (data.items?.length) setBreakdown({ taskId: task.id, taskTitle: task.title, items: data.items });
    } catch {
      // offline fallback: rule-based templates
      const items = breakdownSuggestions(task.title, task.notes ?? "");
      if (items?.length) setBreakdown({ taskId: task.id, taskTitle: task.title, items });
    } finally {
      setBreakdownLoading(false);
    }
  }

  async function acceptBreakdown() {
    if (!breakdown) return;
    await supabase.from("tasks").insert(
      breakdown.items.map((it) => ({
        title: it.title,
        parent_task_id: breakdown.taskId,
        estimated_minutes: it.estimated_minutes,
        priority: "low",
      }))
    );
    setBreakdown(null);
    load();
  }

  async function createStudyBlocks(task: Task) {
    const plan = deadlinePlan(task);
    if (!plan || plan.schedule.length === 0) return;
    setCreatingBlocks(task.id);
    let created = 0;
    for (const slot of plan.schedule) {
      const start = slot.date.toISOString();
      const end = new Date(slot.date.getTime() + slot.minutes * 60000).toISOString();
      const { data: clash } = await supabase.from("calendar_events").select("id").gte("start_at", start).lt("start_at", end).limit(1);
      if (!clash?.length) {
        await supabase.from("calendar_events").insert({
          title: `📚 ${task.title}`,
          start_at: start,
          end_at: end,
          all_day: false,
          color: "#8b5cf6",
          calendar_name: "Estudo",
          source: "lifeos",
        });
        created++;
      }
    }
    setCreatingBlocks(null);
    setBlocksMsg({ taskId: task.id, created });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-14" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.tasks.title}
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            {t.tasks.addTask}
          </Button>
        }
      />

      {/* Quick add */}
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
          <Zap className="h-4 w-4 shrink-0 text-amber-400" />
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && quickAdd()}
            placeholder={`${t.tasks.quickAdd} — “${t.tasks.quickAdd === "Quick add task" ? "Buy groceries tomorrow at 18:00" : "Comprar mercearias amanhã às 18:00"}”`}
            className="h-11 w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
        </div>
        <Button variant="secondary" onClick={quickAdd}>
          {t.common.add}
        </Button>
      </div>

      {/* Automatic task breakdown suggestion (#17) — Nova proposes */}
      {breakdownLoading && (
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
          ✨ Nova {t.tasks.breakdownThinking}
        </p>
      )}
      {breakdown && (
        <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/8 px-4 py-3">
          <p className="text-sm text-zinc-200">
            ✨ <span className="font-medium">“{breakdown.taskTitle}”</span> — {t.tasks.breakdown}
          </p>
          <ul className="mt-2 space-y-1">
            {breakdown.items.map((it, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="text-emerald-400">▸</span>
                <span>
                  {i + 1}. {it.title}
                </span>
                <span className="ml-auto text-zinc-600">{it.estimated_minutes}m</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={acceptBreakdown}>
              {t.tasks.breakdownCreate}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setBreakdown(null)}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "today", label: t.tasks.today },
            { value: "upcoming", label: t.tasks.upcoming },
            { value: "inbox", label: t.tasks.inbox },
            { value: "completed", label: t.tasks.completed },
          ]}
        />
        {projects.length > 0 && (
          <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="w-40">
            <option value="all">{t.common.all}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {/* Micro-task filter (#55) */}
      <div className="flex flex-wrap gap-1.5">
        {([
          { id: "all", label: t.common.all },
          { id: "quick", label: t.tasks.microQuick },
          { id: "medium", label: t.tasks.microMedium },
          { id: "deep", label: t.tasks.microDeep },
        ] as { id: MicroBucket; label: string }[]).map((b) => (
          <button
            key={b.id}
            onClick={() => setMicro(b.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              micro === b.id
                ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-300"
                : "border-white/10 text-zinc-400 hover:bg-white/5"
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      <Card>
        {visible.length === 0 ? (
          <EmptyState icon="🗂️" title={t.tasks.noTasks} />
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map((task) => {
              const overdue =
                task.due_date && task.status !== "done" && new Date(task.due_date).getTime() < Date.now();
              const project = projects.find((p) => p.id === task.project_id);
              const subs = subMap[task.id] ?? [];
              const risk = deadlineRisk(task);
              const plan = task.due_date && task.estimated_minutes ? deadlinePlan(task) : null;
              const expandable = subs.length > 0 || Boolean(task.notes) || Boolean(plan);
              return (
                <div key={task.id} className="group">
                  <div className="flex items-center gap-3 py-3">
                    <button
                      onClick={() => toggleDone(task)}
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                        task.status === "done"
                          ? "border-transparent bg-gradient-to-br from-indigo-500 to-violet-500"
                          : "border-white/20 hover:border-indigo-400"
                      )}
                    >
                      {task.status === "done" && <Check className="h-3.5 w-3.5 text-white" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => expandable && setExpanded(expanded === task.id ? null : task.id)}
                        className={cn("flex w-full items-center gap-1.5 text-left", !expandable && "cursor-default")}
                      >
                        <span
                          className={cn(
                            "truncate text-sm font-medium",
                            task.status === "done" ? "text-zinc-500 line-through" : "text-zinc-100"
                          )}
                        >
                          {task.title}
                        </span>
                        {expandable && (
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform",
                              expanded === task.id && "rotate-180"
                            )}
                          />
                        )}
                      </button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                        {task.due_date && (
                          <span className={cn(overdue && "text-red-400")}>
                            {formatDate(task.due_date)}
                            {task.due_date.includes("T") && ` · ${formatTime(task.due_date)}`}
                            {overdue && ` · ${daysUntil(task.due_date.slice(0, 10)) * -1}d`}
                          </span>
                        )}
                        {task.estimated_minutes != null && (
                          <span>
                            · {task.estimated_minutes}m {t.tasks.estimated}
                          </span>
                        )}
                        {risk && (
                          <span
                            className={cn(
                              "font-medium",
                              risk.severity === "high" ? "text-red-400" : "text-amber-400"
                            )}
                          >
                            ⚠️ {t.tasks.risk}
                          </span>
                        )}
                        {project && <span style={{ color: project.color }}>{project.name}</span>}
                        {task.priority === "high" && <Flag className="h-3 w-3 text-red-400" />}
                        {task.priority === "medium" && <Flag className="h-3 w-3 text-amber-400" />}
                        {task.tags.map((tag) => (
                          <Badge key={tag} color="violet">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {task.status !== "done" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => router.push(`/app/focus?task=${task.id}`)}
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{t.tasks.doNow}</span>
                      </Button>
                    )}
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Expanded: notes, subtasks, study plan */}
                  {expanded === task.id && (
                    <div className="space-y-3 border-t border-white/5 px-2 py-3">
                      {task.notes && <p className="text-xs text-zinc-400">{task.notes}</p>}

                      {subs.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                            {t.tasks.subtasks}
                          </p>
                          <div className="space-y-1">
                            {subs.map((sub) => (
                              <div key={sub.id} className="flex items-center gap-2 text-sm">
                                <button
                                  onClick={() => toggleDone(sub)}
                                  className={cn(
                                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition",
                                    sub.status === "done"
                                      ? "border-transparent bg-gradient-to-br from-indigo-500 to-violet-500"
                                      : "border-white/20 hover:border-indigo-400"
                                  )}
                                >
                                  {sub.status === "done" && <Check className="h-2.5 w-2.5 text-white" />}
                                </button>
                                <span
                                  className={cn(
                                    "truncate",
                                    sub.status === "done" ? "text-zinc-500 line-through" : "text-zinc-300"
                                  )}
                                >
                                  {sub.title}
                                </span>
                                {sub.estimated_minutes != null && (
                                  <span className="ml-auto shrink-0 text-[11px] text-zinc-600">{sub.estimated_minutes}m</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {plan && (
                        <div className="rounded-xl border border-violet-500/20 bg-violet-500/8 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-violet-300">{t.tasks.studyPlan}</p>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={creatingBlocks === task.id}
                              onClick={() => createStudyBlocks(task)}
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                              {t.tasks.createBlocks}
                            </Button>
                          </div>
                          <p className="mt-1.5 text-xs text-zinc-400">
                            Faltam {plan.daysRemaining} {t.tasks.daysLeft} · {plan.totalMinutes} min · {plan.sessionsNeeded}{" "}
                            {t.tasks.sessionsWord} de {plan.sessionMinutes} min · {cadenceLabel(plan.cadenceDays)}
                          </p>
                          {blocksMsg?.taskId === task.id && (
                            <p className="mt-1 text-[11px] text-emerald-400">
                              ✓ {blocksMsg.created} {t.tasks.blocksCreated}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <TaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        projects={projects}
        onSaved={load}
        onCreated={(task) => maybeSuggestBreakdown(task)}
      />
    </div>
  );
}

/* ---------- helpers ---------- */
function cadenceLabel(days: number[]): string {
  if (days.length >= 7) return "todos os dias";
  const names = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return days.map((d) => names[d]).join(" + ");
}

/* ---------- natural language date parsing ---------- */
function parseNaturalDate(input: string): { title: string; due_date: string | null } {
  let text = input.trim();
  let due: Date | null = null;

  const timeMatch = text.match(/(?:às|as|at)\s*(\d{1,2})[:h.](\d{2})/i);
  let hour = 18;
  let minute = 0;
  if (timeMatch) {
    hour = parseInt(timeMatch[1]);
    minute = parseInt(timeMatch[2]);
    text = text.replace(timeMatch[0], "").trim();
  }

  if (/(amanhã|tomorrow)/i.test(text)) {
    due = new Date();
    due.setDate(due.getDate() + 1);
    text = text.replace(/(amanhã|tomorrow)/i, "").trim();
  } else if (/(hoje|today)/i.test(text)) {
    due = new Date();
    text = text.replace(/(hoje|today)/i, "").trim();
  } else if (/(depois de amanhã|day after tomorrow)/i.test(text)) {
    due = new Date();
    due.setDate(due.getDate() + 2);
    text = text.replace(/(depois de amanhã|day after tomorrow)/i, "").trim();
  } else {
    // weekday names
    const weekdays: [RegExp, number][] = [
      [/(segunda|monday)/i, 1],
      [/(terça|terca|tuesday)/i, 2],
      [/(quarta|wednesday)/i, 3],
      [/(quinta|thursday)/i, 4],
      [/(sexta|friday)/i, 5],
      [/(sábado|sabado|saturday)/i, 6],
      [/(domingo|sunday)/i, 0],
    ];
    for (const [re, target] of weekdays) {
      if (re.test(text)) {
        due = new Date();
        const diff = (target - due.getDay() + 7) % 7;
        due.setDate(due.getDate() + (diff === 0 ? 7 : diff));
        text = text.replace(re, "").trim();
        break;
      }
    }
  }

  if (due && /^\d{2}:\d{2}$/.test(text.trim())) {
    const [h, m] = text.trim().split(":").map(Number);
    hour = h;
    minute = m;
    text = text.replace(/\d{2}:\d{2}/, "").trim();
  }

  if (due) {
    due.setHours(hour, minute, 0, 0);
    return { title: text || "Tarefa", due_date: due.toISOString() };
  }
  return { title: text || "Tarefa", due_date: null };
}

function TaskModal({
  open,
  onClose,
  projects,
  onSaved,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onSaved: () => void;
  onCreated?: (task: Task | undefined) => void;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("18:00");
  const [priority, setPriority] = useState("medium");
  const [projectId, setProjectId] = useState("");
  const [tags, setTags] = useState("");
  const [estMin, setEstMin] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setNotes("");
      setDueDate("");
      setDueTime("18:00");
      setPriority("medium");
      setProjectId("");
      setTags("");
      setEstMin("");
    }
  }, [open]);

  async function save() {
    if (!title.trim()) return;
    const due = dueDate
      ? new Date(`${dueDate}T${dueTime || "18:00"}`).toISOString()
      : null;
    const { data } = await supabase
      .from("tasks")
      .insert({
        title: title.trim(),
        notes: notes || null,
        due_date: due,
        priority,
        project_id: projectId || null,
        estimated_minutes: estMin ? parseInt(estMin) || null : null,
        tags: tags
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      })
      .select();
    onSaved();
    onClose();
    onCreated?.((data as Task[] | null)?.[0]);
  }

  return (
    <Modal open={open} onClose={onClose} title={t.tasks.addTask}>
      <div className="space-y-4">
        <Field label={t.common.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lavar o carro…" autoFocus />
        </Field>
        <Field label={t.common.notes}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.date}>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label={t.common.time}>
            <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!dueDate} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.tasks.priority}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.tasks.projects}>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{t.common.none}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t.tasks.estimatedMinutes}>
          <Input type="number" inputMode="numeric" value={estMin} onChange={(e) => setEstMin(e.target.value)} placeholder="30" />
        </Field>
        <Field label={t.tasks.tags}>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="trabalho, casa" />
        </Field>
        <Button className="w-full" onClick={save} disabled={!title.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

export default function TasksPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-72" />
        </div>
      }
    >
      <TasksPageInner />
    </Suspense>
  );
}
