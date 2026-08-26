"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings2, Sparkles } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api, currentMonthTransactions, spendingByCategory } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Progress,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney, monthKey, percent } from "@/lib/format";
import type { Budget, Category, Transaction } from "@/lib/types";
import { cn } from "@/lib/cn";

export default function BudgetsPage() {
  const { t, currency, profile } = useApp();
  const supabase = useSupabase();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    const mk = monthKey();
    const [b, cats, tx] = await Promise.all([
      api.budget(supabase, mk),
      api.categories(supabase),
      api.transactions(supabase, mk),
    ]);
    setCategories(cats);
    setTransactions(tx);
    if (b) {
      setBudget(b);
    } else if (profile) {
      // first time: propose a 50/30/20 split from monthly income
      const income = profile.monthly_income || 0;
      const { data } = await supabase
        .from("budgets")
        .insert({
          month: mk,
          needs_limit: Math.round(income * 0.5 * 100) / 100,
          wants_limit: Math.round(income * 0.3 * 100) / 100,
          savings_target: Math.round(income * 0.15 * 100) / 100,
          investments_target: Math.round(income * 0.05 * 100) / 100,
        })
        .select()
        .single();
      if (data) setBudget(data as Budget);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, profile?.monthly_income]);

  useEffect(() => {
    load();
  }, [load]);

  const monthTx = useMemo(() => currentMonthTransactions(transactions), [transactions]);
  const byCat = useMemo(() => spendingByCategory(monthTx, categories), [monthTx, categories]);

  const income = monthTx.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
  const spentNeeds = monthTx
    .filter((x) => x.amount < 0)
    .filter((x) => {
      const cat = categories.find((c) => c.id === x.category_id);
      return cat?.budget_type === "needs";
    })
    .reduce((s, x) => s + Math.abs(x.amount), 0);
  const spentWants = monthTx
    .filter((x) => x.amount < 0)
    .filter((x) => {
      const cat = categories.find((c) => c.id === x.category_id);
      return cat?.budget_type !== "needs";
    })
    .reduce((s, x) => s + Math.abs(x.amount), 0);

  const needsPct = budget ? percent(spentNeeds, budget.needs_limit) : 0;
  const wantsPct = budget ? percent(spentWants, budget.wants_limit) : 0;
  const savingsPct = budget ? percent(0, budget.savings_target) : 0;
  const invPct = budget ? percent(0, budget.investments_target) : 0;

  // Nova's note (rule-based assessment)
  const wantsShare = income > 0 ? Math.round((spentWants / income) * 100) : 0;
  const novaNote =
    wantsShare > 30
      ? `Estás a gastar ${wantsShare}% do teu rendimento em desejos. Está acima dos 30% — reduzir ~${formatMoney(Math.round((income * 0.3 - spentWants) * -1) || 0, currency)}/mês ajudaria a atingir as tuas metas.`
      : `Estás a gastar ${wantsShare}% do teu rendimento em desejos. Está dentro do saudável (≤30%). Continua assim!`;

  const plan = [
    { key: "needs", label: t.budgets.needs, spent: spentNeeds, limit: budget?.needs_limit ?? 0, pct: needsPct, color: "from-sky-500 to-cyan-500" },
    { key: "wants", label: t.budgets.wants, spent: spentWants, limit: budget?.wants_limit ?? 0, pct: wantsPct, color: "from-rose-500 to-orange-500" },
    { key: "savings", label: t.budgets.savings, spent: 0, limit: budget?.savings_target ?? 0, pct: savingsPct, color: "from-emerald-500 to-teal-500" },
    { key: "investments", label: t.budgets.investments, spent: 0, limit: budget?.investments_target ?? 0, pct: invPct, color: "from-violet-500 to-fuchsia-500" },
  ];

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
        title={t.budgets.title}
        action={
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Settings2 className="h-4 w-4" />
            {t.budgets.setBudget}
          </Button>
        }
      />

      {/* Nova's note */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{t.budgets.aiNote}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{novaNote}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 50/30/20 plan */}
        <Card>
          <CardHeader title={t.budgets.monthlyPlan} subtitle={`${t.budgets.income}: ${formatMoney(income, currency)}`} />
          <div className="space-y-4">
            {plan.map((p) => (
              <div key={p.key}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">{p.label}</span>
                  <span className="text-xs text-zinc-500">
                    {formatMoney(p.spent, currency)} / {formatMoney(p.limit, currency)}
                  </span>
                </div>
                <Progress value={p.pct} color={p.color} />
                <div className="mt-1 text-right">
                  {p.limit > 0 && p.spent > p.limit ? (
                    <Badge color="red">{t.budgets.overBudget}</Badge>
                  ) : p.limit > 0 ? (
                    <Badge color="green">{t.budgets.onBudget}</Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Category limits */}
        <Card>
          <CardHeader title={t.budgets.categories} />
          {byCat.length === 0 ? (
            <EmptyState icon="🎯" title={t.money.noTransactions} />
          ) : (
            <div className="space-y-3">
              {byCat.slice(0, 8).map((c) => {
                const cat = categories.find((x) => x.name === c.category);
                const limit = cat?.monthly_budget;
                if (!limit) {
                  return (
                    <div key={c.category} className="flex items-center gap-2 text-sm">
                      <span className="text-base">{c.icon}</span>
                      <span className="text-zinc-600 dark:text-zinc-300">{c.category}</span>
                      <span className="ml-auto text-zinc-500 dark:text-zinc-400">{formatMoney(c.value, currency)}</span>
                      <Badge color="zinc">{t.common.unavailable}</Badge>
                    </div>
                  );
                }
                const pct = percent(c.value, limit);
                return (
                  <div key={c.category}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                        <span>{c.icon}</span>
                        {c.category}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {formatMoney(c.value, currency)} / {formatMoney(limit, currency)}
                      </span>
                    </div>
                    <Progress value={pct} color={pct > 100 ? "from-rose-500 to-red-500" : "from-indigo-500 to-violet-500"} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <BudgetEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        budget={budget}
        income={income}
        onSaved={load}
        currency={currency}
      />
    </div>
  );
}

function BudgetEditModal({
  open,
  onClose,
  budget,
  income,
  onSaved,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  budget: Budget | null;
  income: number;
  onSaved: () => void;
  currency: string;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [needs, setNeeds] = useState("0");
  const [wants, setWants] = useState("0");
  const [savings, setSavings] = useState("0");
  const [investments, setInvestments] = useState("0");

  useEffect(() => {
    if (open) {
      setNeeds(String(budget?.needs_limit ?? ""));
      setWants(String(budget?.wants_limit ?? ""));
      setSavings(String(budget?.savings_target ?? ""));
      setInvestments(String(budget?.investments_target ?? ""));
    }
  }, [open, budget]);

  async function save() {
    const mk = monthKey();
    await supabase.from("budgets").upsert({
      month: mk,
      needs_limit: parseFloat(needs.replace(",", ".")) || 0,
      wants_limit: parseFloat(wants.replace(",", ".")) || 0,
      savings_target: parseFloat(savings.replace(",", ".")) || 0,
      investments_target: parseFloat(investments.replace(",", ".")) || 0,
    });
    onSaved();
    onClose();
  }

  const p50 = income > 0 ? Math.round(income * 0.5 * 100) / 100 : 0;

  return (
    <Modal open={open} onClose={onClose} title={t.budgets.setBudget}>
      <div className="space-y-4">
        <p className="rounded-xl bg-zinc-50 dark:bg-white/5 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
          {t.budgets.income}: {formatMoney(income, currency)}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.budgets.needs} hint={`50% → ${formatMoney(p50, currency)}`}>
            <Input type="number" inputMode="decimal" value={needs} onChange={(e) => setNeeds(e.target.value)} />
          </Field>
          <Field label={t.budgets.wants}>
            <Input type="number" inputMode="decimal" value={wants} onChange={(e) => setWants(e.target.value)} />
          </Field>
          <Field label={t.budgets.savings}>
            <Input type="number" inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)} />
          </Field>
          <Field label={t.budgets.investments}>
            <Input type="number" inputMode="decimal" value={investments} onChange={(e) => setInvestments(e.target.value)} />
          </Field>
        </div>
        <Button className="w-full" onClick={save}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
