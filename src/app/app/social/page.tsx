"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { ListToolbar, type OrderDir } from "@/components/ListToolbar";
import { sortBy } from "@/lib/sort";
import type { SharedExpense } from "@/lib/types";

export default function SocialPage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expFilter, setExpFilter] = useState("all");
  const [expSort, setExpSort] = useState("date");
  const [expOrder, setExpOrder] = useState<OrderDir>("desc");

  const load = useCallback(async () => {
    setExpenses(await api.sharedExpenses(supabase));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleExpenses = useMemo(() => {
    let list = expenses;
    if (expFilter === "settled") list = list.filter((e) => e.settled);
    else if (expFilter === "open") list = list.filter((e) => !e.settled);
    return sortBy(list, (e) => (expSort === "amount" ? e.amount : e.date), expOrder);
  }, [expenses, expFilter, expSort, expOrder]);

  const totals = useMemo(() => {
    let iOwe = 0;
    let owed = 0;
    for (const e of expenses) {
      if (e.settled || e.participants.length === 0) continue;
      const share = e.amount / (e.participants.length + 1); // +1 = me
      if (e.paid_by === "eu") owed += e.amount - share;
      else iOwe += share;
    }
    return { iOwe, owed };
  }, [expenses]);

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
        title={t.social.title}
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t.social.addExpense}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.social.iOwe}</p>
          <p className="mt-1.5 text-2xl font-bold text-red-400">{totals.iOwe.toFixed(2)}€</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.social.eachOwes}</p>
          <p className="mt-1.5 text-2xl font-bold text-emerald-400">{totals.owed.toFixed(2)}€</p>
        </Card>
      </div>

      <ListToolbar
        filters={[
          { value: "all", label: t.common.all },
          { value: "open", label: t.social.open },
          { value: "settled", label: t.social.settled },
        ]}
        filter={expFilter}
        onFilter={setExpFilter}
        sortOptions={[
          { value: "date", label: t.common.date },
          { value: "amount", label: t.common.amount },
        ]}
        sort={expSort}
        onSort={setExpSort}
        order={expOrder}
        onOrder={setExpOrder}
        filterLabel={t.common.filter}
        sortLabel={t.common.sortBy}
        orderTitle={`${t.common.sortBy}: ${expOrder === "asc" ? t.common.ascending : t.common.descending}`}
      />
      <Card>
        <p className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{t.social.shared}</p>
        {visibleExpenses.length === 0 ? (
          <EmptyState icon="🤝" title={t.social.noData} />
        ) : (
          <div className="space-y-2">
            {visibleExpenses.map((e) => {
              const share = e.participants.length ? e.amount / (e.participants.length + 1) : e.amount;
              return (
                <div key={e.id} className="group flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-white/6 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">{e.title}</p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {e.date} · {t.social.paidBy}: {e.paid_by} · {e.participants.join(", ") || "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{e.amount.toFixed(2)}€</p>
                    <p className="text-[11px] text-zinc-500">
                      {t.social.eachOwes}: {share.toFixed(2)}€
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from("shared_expenses").update({ settled: !e.settled }).eq("id", e.id);
                      load();
                    }}
                    className="shrink-0"
                  >
                    <Badge color={e.settled ? "green" : "amber"}>{t.social.settled}</Badge>
                  </button>
                  <button
                    onClick={async () => {
                      await supabase.from("shared_expenses").delete().eq("id", e.id);
                      load();
                    }}
                    className="shrink-0 rounded-lg p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ExpenseModal open={open} onClose={() => setOpen(false)} onSaved={load} />
    </div>
  );
}

function ExpenseModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("eu");
  const [participants, setParticipants] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setAmount("");
      setPaidBy("eu");
      setParticipants("");
    }
  }, [open]);

  async function save() {
    if (!title.trim() || !parseFloat(amount)) return;
    const parts = participants
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await supabase.from("shared_expenses").insert({
      title: title.trim(),
      amount: parseFloat(amount),
      paid_by: paidBy,
      participants: parts,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.social.addExpense}>
      <div className="space-y-4">
        <Field label={t.common.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Jantar, bilhetes…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t.common.amount} (€)`}>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={t.social.paidBy}>
            <Input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} placeholder="eu, João, Maria…" />
          </Field>
        </div>
        <Field label={`${t.social.participants} (vírgula)`}>
          <Input value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="João, Maria" />
        </Field>
        <Button className="w-full" onClick={save} disabled={!title.trim() || !parseFloat(amount)}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
