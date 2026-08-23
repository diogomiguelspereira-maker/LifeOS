"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import { monthlyCost } from "@/lib/finance";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { daysUntil, formatDate, formatMoney } from "@/lib/format";
import type { Subscription } from "@/lib/types";
import { cn } from "@/lib/cn";

const CYCLES = [
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
  { value: "weekly", label: "Semanal" },
];

export default function SubscriptionsPage() {
  const { t, currency } = useApp();
  const supabase = useSupabase();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("subscriptions").select("*").order("created_at");
    setSubs((data as Subscription[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const monthly = useMemo(() => subs.filter((s) => s.is_active).reduce((s, x) => s + monthlyCost(x), 0), [subs]);
  const upcoming = useMemo(
    () =>
      subs
        .filter((s) => s.is_active && s.next_billing_date && daysUntil(s.next_billing_date) >= 0 && daysUntil(s.next_billing_date) <= 7)
        .sort((a, b) => new Date(a.next_billing_date!).getTime() - new Date(b.next_billing_date!).getTime()),
    [subs]
  );
  const toCancel = subs.filter((s) => s.to_cancel);
  const unused = subs.filter((s) => s.is_unused);

  async function patch(id: string, data: Partial<Subscription>) {
    await supabase.from("subscriptions").update(data).eq("id", id);
    load();
  }

  async function remove(id: string) {
    await supabase.from("subscriptions").delete().eq("id", id);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.subs.title}
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            {t.subs.add}
          </Button>
        }
      />

      {/* cost analyzer */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500" />
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.subs.perMonth}</p>
          <p className="mt-1.5 text-2xl font-bold text-zinc-800 dark:text-zinc-100">{formatMoney(monthly, currency)}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-rose-500 to-orange-500" />
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.subs.perYear}</p>
          <p className="mt-1.5 text-2xl font-bold text-rose-400">{formatMoney(monthly * 12, currency)}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-500 to-yellow-500" />
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.subs.warnings}</p>
          <p className="mt-1.5 text-2xl font-bold text-zinc-800 dark:text-zinc-100">{upcoming.length}</p>
          <p className="mt-1 text-xs text-zinc-500">{t.subs.renewalSoon}</p>
        </Card>
      </div>

      {/* warnings */}
      {upcoming.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <p className="text-xs font-semibold text-amber-300">{t.subs.warnings}</p>
          <div className="mt-2 space-y-1.5">
            {upcoming.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-200">{s.name}</span>
                <Badge color="amber" className="shrink-0">
                  {t.subs.renews} {formatDate(s.next_billing_date!)} · {formatMoney(monthlyCost(s), currency)}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* cancel tracker */}
      {toCancel.length > 0 && (
        <Card className="border-rose-500/20 bg-rose-500/5">
          <p className="text-xs font-semibold text-rose-300">{t.subs.toCancel}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {toCancel.map((s) => (
              <Badge key={s.id} color="red">
                {s.name} · {formatMoney(monthlyCost(s), currency)}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* list */}
      <Card>
        <CardHeader title={t.subs.title} />
        {subs.length === 0 ? (
          <EmptyState icon="🔁" title={t.subs.noSubs} />
        ) : (
          <div className="divide-y divide-white/5">
            {subs.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", s.is_active ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-500 line-through")}>
                    {s.name}
                    {s.to_cancel && <Badge color="red" className="ml-2">{t.subs.toCancel}</Badge>}
                    {s.is_unused && <Badge color="zinc" className="ml-2">{t.subs.unused}</Badge>}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {formatMoney(s.amount, currency)} · {s.billing_cycle} ·{" "}
                    {s.next_billing_date ? `${t.subs.renews} ${formatDate(s.next_billing_date)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    title={t.subs.used}
                    className={cn("rounded-lg px-2 py-1 text-[11px] font-medium", s.is_unused ? "bg-zinc-50 dark:bg-white/5 text-zinc-500" : "bg-emerald-500/10 text-emerald-400")}
                  >
                    {s.is_unused ? t.subs.unused : t.subs.used}
                  </span>
                  <Switch checked={s.to_cancel} onChange={(v) => patch(s.id, { to_cancel: v })} />
                  <button onClick={() => remove(s.id)} className="rounded-lg p-1.5 text-zinc-600 transition hover:text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SubModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} currency={currency} />
    </div>
  );
}

function SubModal({ open, onClose, onSaved, currency }: { open: boolean; onClose: () => void; onSaved: () => void; currency: string }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [next, setNext] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setAmount("");
      setCycle("monthly");
      setNext("");
    }
  }, [open]);

  async function save() {
    if (!name || !amount) return;
    await supabase.from("subscriptions").insert({
      name,
      amount: parseFloat(amount.replace(",", ".")) || 0,
      billing_cycle: cycle,
      next_billing_date: next || null,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.subs.add}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Netflix, Spotify…" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.amount}>
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`0,00 ${currency}`} />
          </Field>
          <Field label={t.subs.cycle}>
            <Select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              {CYCLES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t.subs.renews}>
          <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Button className="w-full" onClick={save} disabled={!name || !amount}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
