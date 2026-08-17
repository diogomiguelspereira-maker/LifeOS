"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Flame, Plus, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Progress,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import type { Habit, HabitCompletion } from "@/lib/types";
import { cn } from "@/lib/cn";

const HABIT_ICONS = ["🔥", "💪", "💧", "📖", "🧘", "😴", "💻", "🥗", "🏃", "✍️", "🎯", "🚭"];
const HABIT_COLORS = ["#f97316", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#f59e0b"];

export default function HabitsPage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const [hs, cs] = await Promise.all([
      api.habits(supabase),
      api.completions(supabase, new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)),
    ]);
    setHabits(hs);
    setCompletions(cs);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const todayKey = new Date().toISOString().slice(0, 10);

  async function toggle(habit: Habit) {
    const existing = completions.find((c) => c.habit_id === habit.id && c.date === todayKey);
    if (existing) {
      await supabase.from("habit_completions").delete().eq("id", existing.id);
    } else {
      await supabase.from("habit_completions").insert({ habit_id: habit.id, date: todayKey });
    }
    load();
  }

  async function remove(id: string) {
    await supabase.from("habits").delete().eq("id", id);
    load();
  }

  const weekStart = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }, []);

  function weekCount(habitId: string): number {
    const start = weekStart.toISOString().slice(0, 10);
    return completions.filter((c) => c.habit_id === habitId && c.date >= start).length;
  }

  function streak(habitId: string): number {
    let count = 0;
    const done = new Set(completions.filter((c) => c.habit_id === habitId).map((c) => c.date));
    const d = new Date();
    while (done.has(d.toISOString().slice(0, 10))) {
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }

  function consistency(habitId: string): number {
    const done = new Set(completions.filter((c) => c.habit_id === habitId).map((c) => c.date));
    let hit = 0;
    const d = new Date();
    for (let i = 0; i < 28; i++) {
      if (done.has(d.toISOString().slice(0, 10))) hit++;
      d.setDate(d.getDate() - 1);
    }
    return Math.round((hit / 28) * 100);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.habits.title}
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            {t.habits.addHabit}
          </Button>
        }
      />

      {habits.length === 0 ? (
        <Card>
          <EmptyState icon="🌱" title={t.habits.noHabits} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {habits.map((h) => {
            const done = completions.some((c) => c.habit_id === h.id && c.date === todayKey);
            const wc = weekCount(h.id);
            return (
              <Card key={h.id} className="group">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggle(h)}
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl transition-all",
                      done ? "scale-105" : "hover:scale-105"
                    )}
                    style={{
                      background: done ? h.color : `${h.color}1f`,
                      boxShadow: done ? `0 8px 24px ${h.color}55` : "none",
                    }}
                  >
                    {done ? <Check className="h-5 w-5 text-white" /> : h.icon}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-sm font-semibold", done ? "text-zinc-500" : "text-zinc-100")}>
                        {h.name}
                      </p>
                      <button
                        onClick={() => remove(h.id)}
                        className="rounded-lg p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
                      <span className="flex items-center gap-0.5">
                        <Flame className="h-3 w-3 text-orange-400" />
                        {streak(h.id)} {t.habits.streak.toLowerCase()}
                      </span>
                      <span>
                        {wc}/{h.target_per_week} {t.habits.weekly.toLowerCase()}
                      </span>
                      <span>{consistency(h.id)}% {t.habits.consistency.toLowerCase()}</span>
                    </div>
                    <div className="mt-2">
                      <Progress
                        value={(wc / Math.max(1, h.target_per_week)) * 100}
                        color="bg-gradient-to-r from-indigo-500 to-violet-500"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddHabitModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} />
    </div>
  );
}

function AddHabitModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🔥");
  const [color, setColor] = useState(HABIT_COLORS[0]);
  const [target, setTarget] = useState("3");

  useEffect(() => {
    if (open) {
      setName("");
      setIcon("🔥");
      setColor(HABIT_COLORS[0]);
      setTarget("3");
    }
  }, [open]);

  async function save() {
    if (!name.trim()) return;
    await supabase.from("habits").insert({
      name: name.trim(),
      icon,
      color,
      target_per_week: parseInt(target) || 3,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.habits.addHabit}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Beber água, ler…" autoFocus />
        </Field>
        <Field label={t.habits.targetPerWeek}>
          <div className="flex gap-2">
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                onClick={() => setTarget(String(n))}
                className={cn(
                  "h-10 w-10 rounded-xl border text-sm font-medium transition",
                  target === String(n)
                    ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-300"
                    : "border-white/10 text-zinc-500 hover:bg-white/5"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t.goals.icon}>
          <div className="flex flex-wrap gap-2">
            {HABIT_ICONS.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition",
                  icon === i ? "border-indigo-400/60 bg-indigo-500/15" : "border-white/10 hover:bg-white/5"
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t.common.color}>
          <div className="flex flex-wrap gap-2">
            {HABIT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn("h-8 w-8 rounded-full transition", color === c && "ring-2 ring-white ring-offset-2 ring-offset-zinc-950")}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <Button className="w-full" onClick={save} disabled={!name.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
