"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Droplets, Moon, Plus, Zap } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import type { ExerciseLog, SleepLog, WaterLog, WellnessLog } from "@/lib/types";
import { cn } from "@/lib/cn";

const EXERCISE_TYPES = ["gym", "running", "cycling", "walking", "sports", "other"];

export default function WellnessPage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [sleep, setSleep] = useState<SleepLog[]>([]);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [exercise, setExercise] = useState<ExerciseLog[]>([]);
  const [wellness, setWellness] = useState<WellnessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [wellnessOpen, setWellnessOpen] = useState(false);

  const load = useCallback(async () => {
    const [sl, wl, ex, we] = await Promise.all([
      api.sleepLogs(supabase, 30),
      api.waterLogs(supabase, 30),
      api.exerciseLogs(supabase, 60),
      api.wellnessLogs(supabase, 30),
    ]);
    setSleep(sl);
    setWater(wl);
    setExercise(ex);
    setWellness(we);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySleep = sleep.find((s) => s.date === todayKey);
  const todayWater = water.find((w) => w.date === todayKey);

  const avgSleep = useMemo(() => {
    const vals = sleep.slice(0, 7).filter((s) => s.hours > 0);
    if (!vals.length) return 0;
    return vals.reduce((s, x) => s + x.hours, 0) / vals.length;
  }, [sleep]);

  const weekExercise = useMemo(() => {
    const start = new Date();
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    return exercise.filter((e) => e.date >= start.toISOString().slice(0, 10)).length;
  }, [exercise]);

  const avgMood = useMemo(() => {
    const vals = wellness.filter((w) => w.mood).slice(0, 14);
    if (!vals.length) return 0;
    return vals.reduce((s, x) => s + (x.mood ?? 0), 0) / vals.length;
  }, [wellness]);

  const avgEnergy = useMemo(() => {
    const vals = wellness.filter((w) => w.energy).slice(0, 14);
    if (!vals.length) return 0;
    return vals.reduce((s, x) => s + (x.energy ?? 0), 0) / vals.length;
  }, [wellness]);

  async function addWater() {
    const current = todayWater?.glasses ?? 0;
    await supabase.from("water_logs").upsert({ date: todayKey, glasses: current + 1 });
    load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t.wellness.title} />
      <p className="rounded-xl bg-white/4 px-3 py-2 text-xs text-zinc-500">ℹ️ {t.wellness.info}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* sleep */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-indigo-500" />
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.wellness.sleep}</p>
            <Moon className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-zinc-800 dark:text-zinc-100">
            {todaySleep?.hours ? `${todaySleep.hours}h` : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {t.wellness.avg}: {avgSleep.toFixed(1)}h · {t.wellness.quality} {todaySleep?.quality ? `${todaySleep.quality}/5` : ""}
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSleepOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t.wellness.addSleep}
          </Button>
        </Card>

        {/* water */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-sky-500" />
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.wellness.water}</p>
            <Droplets className="h-4 w-4 text-sky-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-zinc-800 dark:text-zinc-100">{todayWater?.glasses ?? 0} 🥛</p>
          <p className="mt-1 text-xs text-zinc-500">{t.wellness.glasses} · meta 8</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={addWater}>
            <Plus className="h-3.5 w-3.5" />
            {t.wellness.addWater}
          </Button>
        </Card>

        {/* exercise */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500" />
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.wellness.exercise}</p>
            <Zap className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-zinc-800 dark:text-zinc-100">{weekExercise}</p>
          <p className="mt-1 text-xs text-zinc-500">{t.wellness.daysExercised} / semana</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setExerciseOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t.wellness.addExercise}
          </Button>
        </Card>

        {/* mood/energy */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-amber-500" />
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.wellness.mood} / {t.wellness.energy}</p>
          <p className="mt-1.5 text-2xl font-bold text-zinc-800 dark:text-zinc-100">
            {avgMood ? "😀" : "—"} {avgMood.toFixed(1)} · ⚡ {avgEnergy.toFixed(1)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">14 dias</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setWellnessOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t.wellness.addWellness}
          </Button>
        </Card>
      </div>

      {/* sleep trend */}
      <Card>
        <CardHeader title={`${t.wellness.sleep} — ${t.wellness.trend}`} />
        {sleep.length === 0 ? (
          <EmptyState icon="🌙" title={t.wellness.addSleep} />
        ) : (
          <div className="flex items-end gap-1.5">
            {sleep.slice(0, 14).reverse().map((s) => (
              <div key={s.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn("w-full rounded-t-lg", s.hours > 0 ? "bg-indigo-500/40" : "bg-zinc-50 dark:bg-white/5")}
                  style={{ height: `${Math.min(100, (s.hours / 10) * 100)}px` }}
                  title={`${s.date}: ${s.hours}h`}
                />
                <span className="text-[9px] text-zinc-600">{new Date(s.date).getDate()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SleepModal open={sleepOpen} onClose={() => setSleepOpen(false)} onSaved={load} />
      <ExerciseModal open={exerciseOpen} onClose={() => setExerciseOpen(false)} onSaved={load} />
      <WellnessModal open={wellnessOpen} onClose={() => setWellnessOpen(false)} onSaved={load} />
    </div>
  );
}

function SleepModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [hours, setHours] = useState("7");
  const [quality, setQuality] = useState("3");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) {
      setHours("7");
      setQuality("3");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  async function save() {
    await supabase.from("sleep_logs").upsert({ date, hours: parseFloat(hours.replace(",", ".")) || 0, quality: parseInt(quality) || null });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.wellness.addSleep}>
      <div className="space-y-4">
        <Field label={t.common.date}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={`${t.wellness.hours} (ex: 7.5)`}>
          <Input type="number" inputMode="decimal" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <Field label={t.wellness.quality}>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((q) => (
              <button
                key={q}
                onClick={() => setQuality(String(q))}
                className={cn(
                  "h-10 w-10 rounded-xl border text-sm font-medium transition",
                  quality === String(q) ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-zinc-200 dark:border-white/10 text-zinc-500 hover:bg-zinc-50 dark:bg-white/5"
                )}
              >
                {q}
              </button>
            ))}
          </div>
        </Field>
        <Button className="w-full" onClick={save}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function ExerciseModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [type, setType] = useState("gym");
  const [minutes, setMinutes] = useState("30");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) {
      setType("gym");
      setMinutes("30");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  async function save() {
    await supabase.from("exercise_logs").insert({ date, type, duration_minutes: parseInt(minutes) || 30 });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.wellness.addExercise}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.date}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={`${t.focus.minutes} (min)`}>
            <Input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
        </div>
        <Field label={t.common.category}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {EXERCISE_TYPES.map((x) => (
              <option key={x} value={x}>
                {t.wellness[x as keyof typeof t.wellness]}
              </option>
            ))}
          </Select>
        </Field>
        <Button className="w-full" onClick={save}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function WellnessModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [mood, setMood] = useState("4");
  const [energy, setEnergy] = useState("3");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) {
      setMood("4");
      setEnergy("3");
      setNotes("");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  async function save() {
    await supabase
      .from("wellness_logs")
      .upsert({ date, mood: parseInt(mood) || null, energy: parseInt(energy) || null, notes: notes || null });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.wellness.addWellness}>
      <div className="space-y-4">
        <Field label={t.common.date}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.wellness.mood}>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((m) => (
                <button
                  key={m}
                  onClick={() => setMood(String(m))}
                  className={cn(
                    "h-9 w-9 rounded-xl border text-base transition",
                    mood === String(m) ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:bg-white/5"
                  )}
                >
                  {["😞", "😕", "😐", "🙂", "😄"][m - 1]}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t.wellness.energy}>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((e) => (
                <button
                  key={e}
                  onClick={() => setEnergy(String(e))}
                  className={cn(
                    "h-9 w-9 rounded-xl border text-base transition",
                    energy === String(e) ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:bg-white/5"
                  )}
                >
                  {["🪫", "🔋", "⚡", "⚡⚡", "🚀"][e - 1]}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label={t.common.notes}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <Button className="w-full" onClick={save}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
