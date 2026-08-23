"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp, useSupabase } from "@/lib/app-context";
import { api, currentMonthTransactions } from "@/lib/api";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney } from "@/lib/format";
import type { Task, Transaction } from "@/lib/types";

export default function StatsPage() {
  const { t, currency } = useApp();
  const supabase = useSupabase();
  const [tx, setTx] = useState<Transaction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [allTx, allTasks] = await Promise.all([api.allTransactions(supabase, 500), api.tasks(supabase)]);
    setTx(allTx);
    setTasks(allTasks);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const monthTx = useMemo(() => currentMonthTransactions(tx), [tx]);

  const chartData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("pt-PT", { month: "short" }) });
    }
    return months.map((m) => {
      const next = new Date(m.key);
      next.setMonth(next.getMonth() + 1);
      const inMonth = tx.filter((x) => x.date >= m.key && x.date < next.toISOString().slice(0, 10));
      return {
        name: m.label,
        income: inMonth.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0),
        expenses: Math.abs(inMonth.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0)),
      };
    });
  }, [tx]);

  const done = tasks.filter((x) => x.status === "done").length;
  const overdue = tasks.filter((x) => x.status !== "done" && x.due_date && new Date(x.due_date).getTime() < Date.now()).length;
  const completionRate = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const income = monthTx.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
  const expenses = Math.abs(monthTx.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0));
  const savingsRate = income > 0 ? Math.round((1 - expenses / income) * 100) : 0;

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
      <PageHeader title={t.stats.title} />

      <Card>
        <CardHeader title={t.stats.incomeVsExpenses} />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                formatter={(v) => formatMoney(Number(v), currency)}
              />
              <Bar dataKey="income" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t.stats.financial} value={`${savingsRate}%`} sub={`${t.money.savingsRate.toLowerCase()}`} />
        <StatCard label={t.stats.productivity} value={`${completionRate}%`} sub={t.stats.completionRate.toLowerCase()} />
        <StatCard label={t.stats.tasksCompleted} value={String(done)} sub={t.stats.productivity.toLowerCase()} />
        <StatCard label={t.stats.tasksOverdue} value={String(overdue)} sub={t.stats.tasksOverdue.toLowerCase()} />
      </div>

      <Card>
        <CardHeader title={t.stats.spendingTrend} />
        <div className="flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Badge color="green">{t.money.monthlyIncome}: {formatMoney(income, currency)}</Badge>
          <Badge color="red">{t.money.monthlyExpenses}: {formatMoney(expenses, currency)}</Badge>
          <Badge color="blue">{t.money.savingsRate}: {savingsRate}%</Badge>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
    </Card>
  );
}
