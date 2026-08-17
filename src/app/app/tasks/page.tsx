"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Flag, Plus, Trash2, Zap } from "lucide-react";
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
  const { t } = useApp();
  const supabase = useSupabase();
  const params = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("today");
  const [addOpen, setAddOpen] = useState(false);
  const [quick, setQuick] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const load = useCallback(async () => {
    const [ts, ps] = await Promise.all([api.tasks(supabase), supabase.from("projects").select("*").eq("status", "active")]);
    setTasks(ts);
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
    const list = tasks.filter((task) => (projectFilter === "all" ? true : task.project_id === projectFilter));
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
  }, [tasks, view, projectFilter]);

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
    await supabase.from("tasks").insert({
      title: parsed.title,
      due_date: parsed.due_date,
    });
    setQuick("");
    load();
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

      <Card>
        {visible.length === 0 ? (
          <EmptyState icon="🗂️" title={t.tasks.noTasks} />
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map((task) => {
              const overdue =
                task.due_date && task.status !== "done" && new Date(task.due_date).getTime() < Date.now();
              const project = projects.find((p) => p.id === task.project_id);
              return (
                <div key={task.id} className="group flex items-center gap-3 py-3">
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
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        task.status === "done" ? "text-zinc-500 line-through" : "text-zinc-100"
                      )}
                    >
                      {task.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                      {task.due_date && (
                        <span className={cn(overdue && "text-red-400")}>
                          {formatDate(task.due_date)}
                          {task.due_date.includes("T") && ` · ${formatTime(task.due_date)}`}
                          {overdue && ` · ${daysUntil(task.due_date.slice(0, 10)) * -1}d`}
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
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
      />
    </div>
  );
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
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onSaved: () => void;
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

  useEffect(() => {
    if (open) {
      setTitle("");
      setNotes("");
      setDueDate("");
      setDueTime("18:00");
      setPriority("medium");
      setProjectId("");
      setTags("");
    }
  }, [open]);

  async function save() {
    if (!title.trim()) return;
    const due = dueDate
      ? new Date(`${dueDate}T${dueTime || "18:00"}`).toISOString()
      : null;
    await supabase.from("tasks").insert({
      title: title.trim(),
      notes: notes || null,
      due_date: due,
      priority,
      project_id: projectId || null,
      tags: tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    });
    onSaved();
    onClose();
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
