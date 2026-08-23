"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, PiggyBank, Plus, Sparkles, Trash2, TrendingUp, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp, useSupabase } from "@/lib/app-context";
import { api, currentMonthTransactions, moneyTotals } from "@/lib/api";
import {
  avgDailySpend,
  cashFlowForecast,
  dailyLimit,
  emergencyFund,
  monthlyCost,
  netWorth,
  nextPayday,
  safeToSpend,
} from "@/lib/finance";
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
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { daysUntil, formatDate, formatMoney, monthKey, percent } from "@/lib/format";
import type { Account, Category, FinancialChallenge, IncomeSchedule, Subscription, Transaction } from "@/lib/types";
import { cn } from "@/lib/cn";

type Tab = "overview" | "insights" | "challenges";

const CHALLENGE_KINDS = [
  { value: "no_purchases", label: "🚫 Sem compras desnecessárias" },
  { value: "save_amount", label: "💰 Poupar valor" },
  { value: "cook_home", label: "🍳 Cozinhar em casa" },
  { value: "no_delivery", label: "🚫 Sem comida ao domicílio" },
  { value: "custom", label: "🎯 Personalizado" },
];

export default function FinancePage() {
  const { t, currency, profile } = useApp();
  const supabase = useSupabase();
  const [tab, setTab] = useState<Tab>("overview");
  const [tx, setTx] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [income, setIncome] = useState<IncomeSchedule[]>([]);
  const [snapshots, setSnapshots] = useState<{ date: string; net_worth: number }[]>([]);
  const [challenges, setChallenges] = useState<FinancialChallenge[]>([]);
  const [goals, setGoals] = useState<{ id: string; name: string; current_amount: number; target_amount: number; monthly_contribution: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [bonus, setBonus] = useState("");

  const load = useCallback(async () => {
    const [tx_, acc, cats, subs_, inc, snap, chall, goals_] = await Promise.all([
      api.allTransactions(supabase, 400),
      api.accounts(supabase),
      api.categories(supabase),
      api.subscriptions(supabase),
      api.incomeSchedule(supabase),
      api.netWorthSnapshots(supabase),
      api.challenges(supabase),
      api.goals(supabase),
    ]);
    setTx(tx_);
    setAccounts(acc);
    setCategories(cats);
    setSubs(subs_);
    setIncome(inc);
    setSnapshots(snap);
    setChallenges(chall);
    setGoals(goals_);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const monthTx = useMemo(() => currentMonthTransactions(tx), [tx]);
  const totals = useMemo(() => moneyTotals(accounts, monthTx, profile), [accounts, monthTx, profile]);
  const payday = useMemo(() => nextPayday(income), [income]);
  const avg = useMemo(() => avgDailySpend(tx), [tx]);
  const safe = useMemo(
    () => safeToSpend(totals.totalBalance, income, subs, avg),
    [totals.totalBalance, income, subs, avg]
  );
  const forecast = useMemo(
    () => cashFlowForecast(totals.totalBalance, income, subs, avg),
    [totals.totalBalance, income, subs, avg]
  );
  const nw = useMemo(() => netWorth(accounts), [accounts]);
  const eff = useMemo(() => emergencyFund(totals.monthlyExpenses || profile?.typical_expenses || 0, 3), [totals.monthlyExpenses, profile?.typical_expenses]);

  const prevMonthTx = useMemo(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = prev.toISOString().slice(0, 10);
    const next = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return tx.filter((x) => x.date >= prevKey && x.date < next);
  }, [tx]);

  const prevSpent = Math.abs(prevMonthTx.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0));
  const spentDiff = totals.monthlyExpenses - prevSpent;

  const merchants = useMemo(() => {
    const map = new Map<string, number>();
    for (const tr of monthTx) {
      if (tr.amount >= 0) continue;
      const key = tr.merchant || tr.description || "—";
      map.set(key, (map.get(key) ?? 0) + Math.abs(tr.amount));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [monthTx]);

  const heatmap = useMemo(() => {
    // last 8 weeks × 7 weekdays
    const weeks: { label: string; days: number[] }[] = [];
    const now = new Date();
    for (let w = 7; w >= 0; w--) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - w * 7);
      const days = Array.from({ length: 7 }, (_, d) => {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
        const key = date.toISOString().slice(0, 10);
        return Math.abs(tx.filter((x) => x.amount < 0 && x.date === key).reduce((s, x) => s + x.amount, 0));
      });
      weeks.push({ label: `-${w * 7}d`, days });
    }
    return weeks;
  }, [tx]);
  const maxHeat = Math.max(1, ...heatmap.flatMap((w) => w.days));

  const monthlySubs = subs.reduce((s, x) => s + monthlyCost(x), 0);

  async function recordSnapshot() {
    await supabase.from("net_worth_snapshots").upsert({ date: new Date().toISOString().slice(0, 10), net_worth: nw });
    load();
  }

  const bonusNum = parseFloat(bonus.replace(",", ".")) || 0;
  const bonusSplit = bonusNum
    ? [
        { label: "Poupanças", value: Math.round(bonusNum * 0.5), color: "#10b981" },
        { label: "Investir", value: Math.round(bonusNum * 0.25), color: "#6366f1" },
        { label: "Diversão", value: Math.round(bonusNum * 0.15), color: "#f59e0b" },
        { label: "Fundo emergência", value: Math.round(bonusNum * 0.1), color: "#06b6d4" },
      ]
    : [];

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
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.finance.title}
        action={
          <Button variant="outline" size="sm" onClick={recordSnapshot}>
            <TrendingUp className="h-4 w-4" />
            {t.finance.snapshot}
          </Button>
        }
      />

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: t.dashboard.moneyOverview },
          { value: "insights", label: t.finance.compare },
          { value: "challenges", label: t.finance.challenges },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-5">
          {/* hero cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500" />
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.finance.payday}</p>
              <p className="mt-1.5 text-2xl font-bold text-zinc-800 dark:text-zinc-100">
                {payday ? `${payday.days} ${t.finance.daysUntil}` : "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {payday ? `${formatMoney(payday.amount, currency)} · ${formatDate(payday.date)}` : t.finance.addIncome}
              </p>
            </Card>
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.finance.safeToSpend}</p>
              <p className="mt-1.5 text-2xl font-bold text-emerald-400">{formatMoney(safe.amount, currency)}</p>
              <p className="mt-1 text-xs text-zinc-500">{t.finance.untilPayday}</p>
            </Card>
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sky-500 to-cyan-500" />
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.finance.dailyLimit}</p>
              <p className="mt-1.5 text-2xl font-bold text-zinc-800 dark:text-zinc-100">
                {formatMoney(dailyLimit(safe.amount, payday?.days ?? 1), currency)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {t.finance.weeklyLimit}: {formatMoney(dailyLimit(safe.amount, payday?.days ?? 1) * 7, currency)}
              </p>
            </Card>
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-500 to-orange-500" />
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.finance.emergencyFund}</p>
              <p className="mt-1.5 text-2xl font-bold text-zinc-800 dark:text-zinc-100">{formatMoney(eff, currency)}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {t.finance.recommended}: {formatMoney(eff * 2, currency)} · {t.finance.monthsExpenses}
              </p>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* cash flow forecast */}
            <Card>
              <CardHeader title={t.finance.cashFlow} subtitle={`${t.money.totalBalance}: ${formatMoney(totals.totalBalance, currency)}`} />
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecast}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      formatter={(v) => formatMoney(Number(v), currency)}
                    />
                    <Line type="monotone" dataKey="balance" stroke="#818cf8" strokeWidth={2.5} dot={{ r: 4, fill: "#818cf8" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* net worth timeline */}
            <Card>
              <CardHeader title={t.finance.netWorthTimeline} subtitle={`${t.finance.netWorth}: ${formatMoney(nw, currency)}`} />
              {snapshots.length < 2 ? (
                <div className="flex h-48 items-center justify-center">
                  <p className="text-sm text-zinc-500">💡 {t.finance.snapshot}</p>
                </div>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={snapshots}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip
                        contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                        formatter={(v) => formatMoney(Number(v), currency)}
                      />
                      <Line type="monotone" dataKey="net_worth" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3, fill: "#34d399" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* financial calendar: income + bills */}
          <Card>
            <CardHeader
              title={t.finance.financialCalendar}
              action={
                <Button variant="ghost" size="sm" onClick={() => setIncomeOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  {t.finance.addIncome}
                </Button>
              }
            />
            <div className="space-y-1.5">
              {income.filter((s) => s.active).map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{s.name}</p>
                    <p className="text-[11px] text-zinc-500">
                      {s.type === "salary" ? t.finance.salary : s.type === "freelance" ? t.finance.freelance : t.finance.bonus} · dia {s.day_of_month}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-400">+{formatMoney(s.amount, currency)}</span>
                </div>
              ))}
              {subs.filter((s) => s.is_active).map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{s.name}</p>
                    <p className="text-[11px] text-zinc-500">
                      {s.next_billing_date ? `${t.subs.renews} ${formatDate(s.next_billing_date)}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-rose-400">−{formatMoney(monthlyCost(s), currency)}</span>
                </div>
              ))}
              {income.filter((s) => s.active).length === 0 && subs.filter((s) => s.is_active).length === 0 && (
                <p className="py-2 text-sm text-zinc-500">{t.finance.empty}</p>
              )}
            </div>
          </Card>

          {/* money timeline: next 30 days of cash flow */}
          <Card>
            <CardHeader title={t.finance.timeline} subtitle={t.finance.next30} />
            {(() => {
              const days: { date: Date; label: string; value: number; icon: string }[] = [];
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const horizon = new Date(today.getTime() + 30 * 86400000);
              // recurring income
              for (const s of income) {
                if (!s.active) continue;
                let d = new Date(today.getFullYear(), today.getMonth(), s.day_of_month);
                if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, s.day_of_month);
                while (d <= horizon) {
                  days.push({ date: new Date(d), label: s.name, value: s.amount, icon: "+" });
                  d = new Date(d.getFullYear(), d.getMonth() + 1, s.day_of_month);
                }
              }
              // subscription bills
              for (const s of subs) {
                if (!s.is_active || !s.next_billing_date) continue;
                let d = new Date(s.next_billing_date);
                while (d <= horizon && d >= today) {
                  days.push({ date: new Date(d), label: s.name, value: -s.amount, icon: "−" });
                  const next = new Date(d);
                  if (s.billing_cycle === "weekly") next.setDate(next.getDate() + 7);
                  else if (s.billing_cycle === "yearly") next.setFullYear(next.getFullYear() + 1);
                  else next.setMonth(next.getMonth() + 1);
                  d = next;
                }
              }
              // savings goal auto-contribution
              for (const g of goals) {
                if (g.monthly_contribution <= 0 || g.current_amount >= g.target_amount) continue;
                const d = new Date(today.getFullYear(), today.getMonth(), 28);
                if (d >= today && d <= horizon) {
                  days.push({ date: new Date(d), label: `${t.finance.savingsAuto}: ${g.name}`, value: -g.monthly_contribution, icon: "🎯" });
                }
              }
              days.sort((a, b) => a.date.getTime() - b.date.getTime());
              let running = totals.totalBalance;
              const seen = new Set<string>();
              return days.length === 0 ? (
                <p className="py-2 text-sm text-zinc-500">{t.finance.empty}</p>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2">
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{t.common.today}</span>
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{formatMoney(running, currency)}</span>
                  </div>
                  {days.map((row, i) => {
                    const key = `${row.date.toISOString().slice(0, 10)}-${row.label}`;
                    if (seen.has(key)) return null;
                    seen.add(key);
                    running += row.value;
                    return (
                      <div key={key} className="flex items-center justify-between rounded-xl bg-white/3 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-8 shrink-0 text-[10px] text-zinc-500">
                            {row.date.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}
                          </span>
                          <span className="text-sm text-zinc-600 dark:text-zinc-300">
                            {row.icon} {row.label}
                          </span>
                        </div>
                        <span className={cn("text-sm font-semibold", row.value >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {row.value >= 0 ? "+" : "−"}
                          {formatMoney(Math.abs(row.value), currency)}
                          <span className="ml-2 text-xs font-normal text-zinc-600">{formatMoney(running, currency)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </Card>

          {/* bonus simulator */}
          <Card className="border-amber-500/20">
            <CardHeader title={t.finance.bonusSimulator} subtitle={t.finance.bonusHint} />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label={t.common.amount}>
                  <Input type="number" inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="1000" />
                </Field>
              </div>
              {bonusSplit.length > 0 && (
                <div className="flex-1 space-y-2">
                  {bonusSplit.map((b) => (
                    <div key={b.label} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                      <span className="flex-1 text-zinc-600 dark:text-zinc-300">{b.label}</span>
                      <span className="font-medium text-zinc-800 dark:text-zinc-100">{formatMoney(b.value, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === "insights" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.finance.monthSpent}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-800 dark:text-zinc-100">{formatMoney(totals.monthlyExpenses, currency)}</p>
              <Badge color={spentDiff > 0 ? "red" : "green"} className="mt-1">
                {spentDiff > 0 ? "▲" : "▼"} {formatMoney(Math.abs(spentDiff), currency)} {t.finance.vsLastMonth}
              </Badge>
            </Card>
            <Card>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.subs.costAnalyzer}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-800 dark:text-zinc-100">{formatMoney(monthlySubs, currency)}<span className="text-sm text-zinc-500"> /mês</span></p>
              <p className="mt-1 text-xs text-zinc-500">{formatMoney(monthlySubs * 12, currency)} /ano</p>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* merchant analytics */}
            <Card>
              <CardHeader title={t.finance.merchants} />
              {merchants.length === 0 ? (
                <EmptyState icon="🧾" title={t.money.noTransactions} />
              ) : (
                <div className="space-y-2">
                  {merchants.map(([name, value]) => (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <span className="w-32 truncate text-zinc-600 dark:text-zinc-300">{name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/8">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${percent(value, merchants[0][1])}%` }} />
                      </div>
                      <span className="w-20 text-right font-medium text-zinc-700 dark:text-zinc-200">{formatMoney(value, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* spending heatmap */}
            <Card>
              <CardHeader title={t.finance.heatmap} />
              <div className="space-y-1">
                {heatmap.map((week, wi) => (
                  <div key={wi} className="flex items-center gap-1">
                    {week.days.map((v, di) => (
                      <div
                        key={di}
                        title={`${v.toFixed(2)} ${currency}`}
                        className="h-6 flex-1 rounded-md"
                        style={{ background: v === 0 ? "rgba(255,255,255,0.05)" : `rgba(99,102,241,${0.15 + (v / maxHeat) * 0.85})` }}
                      />
                    ))}
                  </div>
                ))}
                <div className="flex justify-between pt-1 text-[10px] text-zinc-600">
                  <span>{t.finance.heatWeekday}</span>
                  <span>{t.finance.heatHour === "Hora" ? "últimas 8 semanas" : "last 8 weeks"}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "challenges" && (
        <div className="space-y-4">
          <Button onClick={() => setChallengeOpen(true)}>
            <Plus className="h-4 w-4" />
            {t.finance.addChallenge}
          </Button>
          {challenges.length === 0 ? (
            <Card>
              <EmptyState icon="🎯" title={t.finance.addChallenge} />
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {challenges.map((c) => {
                const total = Math.max(1, Math.round((new Date(c.end_date).getTime() - new Date(c.start_date).getTime()) / 86400000));
                const elapsed = Math.min(total, Math.max(0, Math.round((Date.now() - new Date(c.start_date).getTime()) / 86400000)) + 1);
                const pct = c.completed ? 100 : percent(elapsed, total);
                return (
                  <Card key={c.id} className="group">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{c.name}</p>
                        <p className="text-[11px] text-zinc-500">
                          {formatDate(c.start_date)} → {formatDate(c.end_date)}
                          {c.kind === "save_amount" && c.target > 0 && ` · ${formatMoney(c.target, currency)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            await supabase.from("financial_challenges").update({ completed: !c.completed }).eq("id", c.id);
                            load();
                          }}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                            c.completed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-zinc-200 dark:border-white/10 text-zinc-500 hover:bg-zinc-50 dark:bg-white/5"
                          )}
                        >
                          {c.completed ? "✓" : t.common.done}
                        </button>
                        <button
                          onClick={async () => {
                            await supabase.from("financial_challenges").delete().eq("id", c.id);
                            load();
                          }}
                          className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Progress value={pct} color={c.completed ? "from-emerald-500 to-teal-500" : "from-indigo-500 to-violet-500"} />
                      <p className="mt-1 text-right text-xs text-zinc-500">{Math.round(pct)}%</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <IncomeModal open={incomeOpen} onClose={() => setIncomeOpen(false)} onSaved={load} currency={currency} />
      <ChallengeModal open={challengeOpen} onClose={() => setChallengeOpen(false)} onSaved={load} />
    </div>
  );
}

function IncomeModal({ open, onClose, onSaved, currency }: { open: boolean; onClose: () => void; onSaved: () => void; currency: string }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const [type, setType] = useState("salary");

  useEffect(() => {
    if (open) {
      setName("");
      setAmount("");
      setDay("1");
      setType("salary");
    }
  }, [open]);

  async function save() {
    if (!name || !amount) return;
    await supabase.from("income_schedule").insert({
      name,
      amount: parseFloat(amount.replace(",", ".")) || 0,
      day_of_month: Math.min(28, parseInt(day) || 1),
      type,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.finance.addIncome}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Salário mensal" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.amount}>
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`0,00 ${currency}`} />
          </Field>
          <Field label={t.finance.dayOfMonth}>
            <Input type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
        </div>
        <Field label={t.finance.type}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="salary">{t.finance.salary}</option>
            <option value="freelance">{t.finance.freelance}</option>
            <option value="bonus">{t.finance.bonus}</option>
            <option value="other">{t.common.other}</option>
          </Select>
        </Field>
        <Button className="w-full" onClick={save} disabled={!name || !amount}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function ChallengeModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("no_purchases");
  const [target, setTarget] = useState("");
  const [days, setDays] = useState("7");

  useEffect(() => {
    if (open) {
      setName("");
      setKind("no_purchases");
      setTarget("");
      setDays("7");
    }
  }, [open]);

  async function save() {
    const label =
      kind === "no_purchases"
        ? t.finance.noPurchases
        : kind === "save_amount"
          ? t.finance.saveAmount
          : kind === "cook_home"
            ? t.finance.cookHome
            : kind === "no_delivery"
              ? t.finance.noDelivery
              : name || t.common.title;
    const now = new Date();
    const end = new Date(now.getTime() + (parseInt(days) || 7) * 86400000);
    await supabase.from("financial_challenges").insert({
      name: label,
      kind,
      target: parseFloat(target.replace(",", ".")) || 0,
      unit: "days",
      start_date: now.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.finance.addChallenge}>
      <div className="space-y-4">
        <Field label={t.common.category}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {CHALLENGE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "custom" && (
          <Field label={t.common.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        {kind === "save_amount" && (
          <Field label={t.common.amount}>
            <Input type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
        )}
        <Field label={`${t.finance.days} (7, 14, 30…)`}>
          <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Button className="w-full" onClick={save}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
