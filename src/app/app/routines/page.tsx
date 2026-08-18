"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Check, Plus, Pencil, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import { SWATCHES as COLORS } from "@/lib/colors";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Segmented,
  Skeleton,
  Switch,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { ROUTINE_PRESETS, routineOnDay, sortSteps } from "@/lib/routines";
import type { Routine, RoutineCompletion, RoutineStep } from "@/lib/types";
import { cn } from "@/lib/cn";

const ICONS = ["🌅", "💼", "🌙", "☀️", "🏋️", "📚", "🧘", "🍳", "🚶", "🧹"];


function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface StepRow {
  title: string;
  time: string;
  duration: number;
}

export default function RoutinesPage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [loading, setLoading] = useState(true);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [steps, setSteps] = useState<RoutineStep[]>([]);
  const [completions, setCompletions] = useState<RoutineCompletion[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [days, setDays] = useState<Routine["days"]>("daily");
  const [startTime, setStartTime] = useState("08:00");
  const [active, setActive] = useState(true);
  const [stepRows, setStepRows] = useState<StepRow[]>([]);
  const [genMsg, setGenMsg] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const todayKey = localDayKey(new Date());

  const load = useCallback(async () => {
    const [rs, st, comp] = await Promise.all([
      api.routines(supabase),
      api.routineSteps(supabase),
      api.routineCompletions(supabase, todayKey),
    ]);
    setRoutines(rs);
    setSteps(st);
    setCompletions(comp);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function fillFromPreset(p: (typeof ROUTINE_PRESETS)[number]) {
    setEditing(null);
    setName(p.name);
    setIcon(p.icon);
    setColor(p.color);
    setDays(p.days);
    setStartTime(p.start_time);
    setActive(true);
    setStepRows(p.steps.map((s) => ({ title: s.title, time: s.time, duration: s.duration_minutes })));
    setEditorOpen(true);
  }

  function openNew() {
    setEditing(null);
    setName("");
    setIcon(ICONS[0]);
    setColor(COLORS[0]);
    setDays("daily");
    setStartTime("08:00");
    setActive(true);
    setStepRows([
      { title: "", time: startTime, duration: 15 },
      { title: "", time: "09:00", duration: 30 },
    ]);
    setEditorOpen(true);
  }

  function openEdit(r: Routine) {
    const existing = sortSteps(steps.filter((s) => s.routine_id === r.id));
    setEditing(r);
    setName(r.name);
    setIcon(r.icon || "🌅");
    setColor(r.color);
    setDays(r.days || "daily");
    setStartTime(r.start_time || "08:00");
    setActive(r.active);
    setStepRows(
      existing.length > 0
        ? existing.map((s) => ({ title: s.title, time: s.time, duration: s.duration_minutes }))
        : [{ title: "", time: r.start_time || "08:00", duration: 15 }]
    );
    setEditorOpen(true);
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const rows = stepRows.filter((s) => s.title.trim() && s.time);
    try {
      let routineId = editing?.id ?? "";
      if (editing) {
        const { error } = await supabase
          .from("routines")
          .update({ name: name.trim(), icon, color, days, start_time: startTime, active })
          .eq("id", editing.id);
        if (error) throw error;
        routineId = editing.id;
      } else {
        const { data, error } = await supabase
          .from("routines")
          .insert({ name: name.trim(), icon, color, days, start_time: startTime, active })
          .select()
          .single();
        if (error) throw error;
        routineId = (data as Routine).id;
      }
      // update steps in place (keeps completion history for unchanged rows)
      const existing = sortSteps(steps.filter((s) => s.routine_id === routineId));
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (i < existing.length) {
          await supabase
            .from("routine_steps")
            .update({ title: row.title.trim(), time: row.time, duration_minutes: row.duration, order: i })
            .eq("id", existing[i].id);
        } else {
          await supabase
            .from("routine_steps")
            .insert({ routine_id: routineId, title: row.title.trim(), time: row.time, duration_minutes: row.duration, order: i });
        }
      }
      for (let i = rows.length; i < existing.length; i++) {
        await supabase.from("routine_steps").delete().eq("id", existing[i].id);
      }
    } catch {
      // keep modal open on error
    }
    setSaving(false);
    setEditorOpen(false);
    load();
  }

  async function toggleStep(step: RoutineStep) {
    const existing = completions.find((c) => c.step_id === step.id);
    if (existing) {
      await supabase.from("routine_completions").delete().eq("id", existing.id);
    } else {
      await supabase.from("routine_completions").insert({ step_id: step.id, date: todayKey });
    }
    load();
  }

  async function generateWeek(r: Routine) {
    const list = sortSteps(steps.filter((s) => s.routine_id === r.id));
    if (list.length === 0) return;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(dayStart.getTime() + 7 * 86400000);
    const existing = await api.events(supabase, dayStart.toISOString(), weekEnd.toISOString());
    let created = 0;
    for (let i = 0; i < 7; i++) {
      const day = new Date(dayStart.getTime() + i * 86400000);
      if (!routineOnDay(r, day)) continue;
      for (const s of list) {
        const [hh, mm] = s.time.split(":").map(Number);
        const start = new Date(day);
        start.setHours(hh, mm, 0, 0);
        const end = new Date(start.getTime() + (s.duration_minutes || 15) * 60000);
        const clash = existing.some(
          (e) =>
            new Date(e.start_at).getTime() < end.getTime() &&
            new Date(e.end_at ?? e.start_at).getTime() > start.getTime()
        );
        if (clash) continue;
        const { error } = await supabase.from("calendar_events").insert({
          title: `${r.icon || "⏰"} ${s.title}`,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          all_day: false,
          color: r.color,
          calendar_name: r.name,
          source: "lifeos",
        });
        if (!error) created++;
      }
    }
    setGenMsg((m) => ({ ...m, [r.id]: created }));
    load();
  }

  async function remove(r: Routine) {
    await supabase.from("routines").delete().eq("id", r.id);
    load();
  }

  async function toggleActive(r: Routine) {
    await supabase.from("routines").update({ active: !r.active }).eq("id", r.id);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const daysLabel = (r: Routine) =>
    r.days === "weekdays" ? t.routines.weekdays : r.days === "weekend" ? t.routines.weekend : t.routines.daily;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.routines.title}
        subtitle={t.routines.subtitle}
        action={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            {t.routines.add}
          </Button>
        }
      />

      {/* Presets */}
      <div className="grid grid-cols-3 gap-3">
        {ROUTINE_PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => fillFromPreset(p)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center transition hover:border-indigo-400/40 hover:bg-white/[0.06]"
          >
            <span className="text-2xl">{p.icon}</span>
            <span className="text-sm font-medium text-zinc-200">{p.name}</span>
            <span className="text-[11px] text-zinc-500">{p.steps.length} {t.routines.steps.toLowerCase()}</span>
          </button>
        ))}
      </div>

      {routines.length === 0 ? (
        <Card>
          <EmptyState icon="🌅" title={t.routines.empty} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {routines.map((r) => {
            const list = sortSteps(steps.filter((s) => s.routine_id === r.id));
            const done = list.filter((s) => completions.some((c) => c.step_id === s.id)).length;
            return (
              <Card key={r.id} className={cn(!r.active && "opacity-60")}>
                <CardHeader
                  title={`${r.icon || "⏰"} ${r.name}`}
                  subtitle={`${daysLabel(r)} · ${r.start_time}`}
                  action={
                    <div className="flex items-center gap-1">
                      <span title={t.routines.active} className="flex items-center">
                        <Switch checked={r.active} onChange={() => toggleActive(r)} />
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(r)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  }
                />

                <div className="space-y-1.5">
                  {list.length === 0 && <p className="text-sm text-zinc-500">—</p>}
                  {list.map((s) => {
                    const isDone = completions.some((c) => c.step_id === s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleStep(s)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                            isDone ? "border-emerald-400 bg-emerald-400/20" : "border-white/20"
                          )}
                        >
                          {isDone && <Check className="h-3 w-3 text-emerald-400" />}
                        </span>
                        <span className="w-12 shrink-0 text-xs tabular-nums text-zinc-500">{s.time}</span>
                        <span className={cn("truncate text-sm", isDone ? "text-zinc-500 line-through" : "text-zinc-200")}>
                          {s.title}
                        </span>
                        <span className="ml-auto text-[11px] text-zinc-600">{s.duration_minutes}m</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
                  <Badge color={done === list.length && list.length > 0 ? "green" : "zinc"}>
                    {done}/{list.length} {t.routines.todayProgress}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => generateWeek(r)}>
                    <CalendarPlus className="h-3.5 w-3.5" />
                    {t.routines.generateCalendar}
                    {genMsg[r.id] !== undefined && <span className="text-emerald-400">+{genMsg[r.id]}</span>}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Editor */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? t.common.edit : t.routines.add} maxWidth="max-w-lg">
        <div className="space-y-4">
          <Field label={t.common.title}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.routines.add} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.routines.start}>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label={t.routines.days}>
              <Segmented
                value={days}
                onChange={setDays}
                options={[
                  { value: "daily", label: t.routines.daily },
                  { value: "weekdays", label: t.routines.weekdays },
                  { value: "weekend", label: t.routines.weekend },
                ]}
              />
            </Field>
          </div>

          <Field label={t.routines.icon}>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((i) => (
                <button
                  key={i}
                  onClick={() => setIcon(i)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition",
                    icon === i ? "border-indigo-400/60 bg-indigo-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t.routines.color}>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn("h-8 w-8 rounded-full transition", color === c && "ring-2 ring-white ring-offset-2 ring-offset-zinc-950")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">{t.routines.steps}</span>
              <Button variant="ghost" size="sm" onClick={() => setStepRows((rows) => [...rows, { title: "", time: startTime, duration: 15 }])}>
                <Plus className="h-3.5 w-3.5" />
                {t.routines.addStep}
              </Button>
            </div>
            <div className="space-y-2">
              {stepRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={row.time}
                    className="w-28"
                    onChange={(e) =>
                      setStepRows((rows) => rows.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))
                    }
                  />
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    value={row.duration}
                    className="w-20"
                    onChange={(e) =>
                      setStepRows((rows) => rows.map((x, j) => (j === i ? { ...x, duration: Number(e.target.value) || 15 } : x)))
                    }
                  />
                  <Input
                    value={row.title}
                    placeholder={t.routines.step}
                    onChange={(e) =>
                      setStepRows((rows) => rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setStepRows((rows) => rows.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5">
            <span className="text-sm text-zinc-300">{t.routines.active}</span>
            <Switch checked={active} onChange={setActive} />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditorOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button className="flex-1" disabled={saving} onClick={save}>
              {t.common.save}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
