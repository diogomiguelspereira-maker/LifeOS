"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Sparkles, Trash2, TrendingUp } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import { SWATCHES as COLORS } from "@/lib/colors";
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
import { formatMoney } from "@/lib/format";
import type { SavingsGoal } from "@/lib/types";
import { cn } from "@/lib/cn";

const ICONS = ["🎯", "💻", "📱", "🚗", "🏍️", "✈️", "🏠", "🎓", "🎸", "🕹️", "🐷", "🛡️"];


function GoalsPageInner() {
  const { t, currency } = useApp();
  const supabase = useSupabase();
  const params = useSearchParams();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setGoals(await api.goals(supabase));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    if (params.get("new") === "1") setAddOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deleteGoal(id: string) {
    await supabase.from("savings_goals").delete().eq("id", id);
    load();
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
        title={t.goals.title}
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            {t.goals.addGoal}
          </Button>
        }
      />

      {goals.length === 0 ? (
        <Card>
          <EmptyState icon="🎯" title={t.goals.addGoal} subtitle={t.dashboard.activeGoals} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((g) => {
            const pct = g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0;
            const monthsLeft = g.deadline
              ? Math.max(1, Math.round((new Date(g.deadline).getTime() - Date.now()) / (30 * 86400000)))
              : null;
            const neededMonthly = g.deadline
              ? Math.max(0, (g.target_amount - g.current_amount) / monthsLeft!)
              : null;
            const done = g.current_amount >= g.target_amount;
            return (
              <Card key={g.id} className="group relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: g.color }} />
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
                      style={{ background: `${g.color}22` }}
                    >
                      {g.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{g.name}</p>
                      <p className="text-xs text-zinc-500">
                        {formatMoney(g.current_amount, currency)} / {formatMoney(g.target_amount, currency)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteGoal(g.id)}
                    className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3">
                  <Progress value={pct} color="bg-gradient-to-r from-indigo-500 to-violet-500" />
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">{Math.round(pct)}%</span>
                    <span className="text-zinc-500">{t.goals.progress}</span>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-xs">
                  {g.deadline && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">{t.goals.estimatedCompletion}</span>
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">
                        {new Date(g.deadline).toLocaleDateString("pt-PT", { month: "long", year: "numeric" })}
                      </span>
                    </div>
                  )}
                  {g.monthly_contribution > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">{t.goals.monthlyContribution}</span>
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">{formatMoney(g.monthly_contribution, currency)}</span>
                    </div>
                  )}
                </div>

                {done ? (
                  <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400">
                    {t.goals.completed}
                  </p>
                ) : neededMonthly !== null && neededMonthly > g.monthly_contribution ? (
                  <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-500/8 px-3 py-2 text-[11px] leading-snug text-amber-300">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t.goals.saveMore} <b>{formatMoney(neededMonthly, currency)}</b> {t.goals.perMonth}
                  </p>
                ) : g.monthly_contribution > 0 ? (
                  <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-500/8 px-3 py-2 text-[11px] text-emerald-300">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {t.goals.onTrack}
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <AddGoalModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} currency={currency} />
    </div>
  );
}

function AddGoalModal({
  open,
  onClose,
  onSaved,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  currency: string;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [deadline, setDeadline] = useState("");
  const [contribution, setContribution] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setTarget("");
      setCurrent("");
      setDeadline("");
      setContribution("");
      setIcon("🎯");
      setColor(COLORS[0]);
    }
  }, [open]);

  async function save() {
    const targetNum = parseFloat(target.replace(",", "."));
    if (!name || !targetNum) return;
    setSaving(true);
    await supabase.from("savings_goals").insert({
      name,
      target_amount: targetNum,
      current_amount: parseFloat(current.replace(",", ".")) || 0,
      deadline: deadline || null,
      monthly_contribution: parseFloat(contribution.replace(",", ".")) || 0,
      icon,
      color,
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.goals.addGoal}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gaming PC, Férias em Madrid…" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.goals.target}>
            <Input type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`0,00 ${currency}`} />
          </Field>
          <Field label={t.goals.current}>
            <Input type="number" inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0,00" />
          </Field>
          <Field label={t.goals.deadline}>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label={t.goals.monthlyContribution}>
            <Input type="number" inputMode="decimal" value={contribution} onChange={(e) => setContribution(e.target.value)} placeholder="0,00" />
          </Field>
        </div>

        <Field label={t.goals.icon}>
          <div className="flex flex-wrap gap-2">
            {ICONS.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition",
                  icon === i ? "border-indigo-400/60 bg-indigo-500/15" : "border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:bg-white/5"
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t.common.color}>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  "h-8 w-8 rounded-full transition",
                  color === c && "ring-2 ring-white ring-offset-2 ring-offset-zinc-100 dark:ring-offset-zinc-950"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>

        <Button className="w-full" onClick={save} disabled={saving || !name || !target}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

export default function GoalsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-72" />
        </div>
      }
    >
      <GoalsPageInner />
    </Suspense>
  );
}
