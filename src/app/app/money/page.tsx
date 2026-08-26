"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, Download, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useApp, useSupabase } from "@/lib/app-context";
import { api, currentMonthTransactions, moneyTotals, prevMonthTransactions, spendingByCategory } from "@/lib/api";
import { SWATCHES } from "@/lib/colors";
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
  Select,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { ListToolbar, type OrderDir } from "@/components/ListToolbar";
import { formatMoney, monthKey } from "@/lib/format";
import { sortBy } from "@/lib/sort";
import type { Account, Category, Transaction } from "@/lib/types";
import { cn } from "@/lib/cn";

const ACCOUNT_TYPES = [
  { value: "cash", label: "💵 Dinheiro" },
  { value: "bank", label: "🏦 Banco" },
  { value: "savings", label: "🐷 Poupança" },
  { value: "investment", label: "📈 Investimento" },
  { value: "credit", label: "💳 Cartão crédito" },
  { value: "crypto", label: "🪙 Crypto" },
  { value: "loan", label: "🏦 Empréstimo" },
];

function MoneyPageInner() {
  const { t, currency } = useApp();
  const supabase = useSupabase();
  const params = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [txOpen, setTxOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const cancelNameRef = useRef(false);

  const load = useCallback(async () => {
    const [tx, acc, cats] = await Promise.all([
      api.allTransactions(supabase, 200),
      api.accounts(supabase),
      api.categories(supabase),
    ]);
    setTransactions(tx);
    setAccounts(acc);
    setCategories(cats);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    if (params.get("new") === "1") setTxOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthTx = useMemo(() => currentMonthTransactions(transactions), [transactions]);
  const totals = useMemo(() => moneyTotals(accounts, monthTx, null), [accounts, monthTx]);
  const prevMonthTx = useMemo(() => prevMonthTransactions(transactions), [transactions]);
  const prevTotals = useMemo(() => moneyTotals(accounts, prevMonthTx, null), [accounts, prevMonthTx]);
  const byCategory = useMemo(
    () => spendingByCategory(monthTx, categories),
    [monthTx, categories]
  );
  const topExpenses = useMemo(() => byCategory.slice(0, 3), [byCategory]);
  const monthlyInsight = useMemo(() => {
    if (monthTx.length === 0) return null;
    const top = byCategory[0];
    const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const perDay = Math.abs(totals.monthlyExpenses) / days;
    return { top, perDay };
  }, [monthTx, byCategory, totals]);
  const [search, setSearch] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const [txSort, setTxSort] = useState("date");
  const [txOrder, setTxOrder] = useState<OrderDir>("desc");
  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = transactions;
    if (txFilter === "income") list = list.filter((tx) => tx.amount > 0);
    else if (txFilter === "expense") list = list.filter((tx) => tx.amount < 0);
    if (q) {
      list = list.filter((tx) => {
        const cat = categories.find((c) => c.id === tx.category_id);
        return (
          (tx.description ?? "").toLowerCase().includes(q) ||
          (cat?.name ?? "").toLowerCase().includes(q) ||
          tx.date.includes(q)
        );
      });
    }
    return sortBy(list, (tx) => (txSort === "amount" ? Math.abs(tx.amount) : tx.date), txOrder);
  }, [transactions, search, categories, txFilter, txSort, txOrder]);

  const expenseCats = categories.filter((c) => c.type === "expense");
  const incomeCats = categories.filter((c) => c.type === "income");

  function pctDelta(cur: number, prev: number): number | null {
    if (prev === 0) return null;
    return Math.round(((cur - prev) / Math.abs(prev)) * 100);
  }

  const expDelta = pctDelta(totals.monthlyExpenses, prevTotals.monthlyExpenses);
  const incDelta = pctDelta(totals.monthlyIncome, prevTotals.monthlyIncome);

  async function deleteTx(id: string) {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    await supabase.from("transactions").delete().eq("id", id);
    if (tx.account_id) {
      await supabase
        .from("accounts")
        .update({ balance: (accounts.find((a) => a.id === tx.account_id)?.balance ?? 0) - tx.amount })
        .eq("id", tx.account_id);
    }
    load();
  }

  async function duplicateTx(tx: Transaction) {
    await supabase.from("transactions").insert({
      account_id: tx.account_id,
      category_id: tx.category_id,
      amount: tx.amount,
      description: tx.description,
      merchant: tx.merchant,
      date: new Date().toISOString().slice(0, 10),
      is_recurring: tx.is_recurring,
    });
    if (tx.account_id) {
      await supabase
        .from("accounts")
        .update({ balance: (accounts.find((a) => a.id === tx.account_id)?.balance ?? 0) + tx.amount })
        .eq("id", tx.account_id);
    }
    load();
  }

  function exportCsv() {
    const header = [t.common.date, t.common.description, t.common.amount, t.money.type];
    const rows = transactions.map((tx) => [
      tx.date,
      tx.description ?? "",
      String(tx.amount),
      tx.amount >= 0 ? t.money.income : t.money.expense,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => '"' + String(v).split('"').join('""') + '"').join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lifeos-movimentos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function startRename(tx: Transaction) {
    cancelNameRef.current = false;
    setDraftName(tx.description ?? "");
    setEditingNameId(tx.id);
  }

  async function commitRename(tx: Transaction) {
    setEditingNameId(null);
    if (cancelNameRef.current) {
      cancelNameRef.current = false;
      return;
    }
    const name = draftName.trim();
    if (name === (tx.description ?? "")) return;
    await supabase.from("transactions").update({ description: name }).eq("id", tx.id);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.money.title}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={transactions.length === 0}>
              <Download className="h-4 w-4" />
              {t.money.exportCsv}
            </Button>
            <Button
              onClick={() => {
                setEditingTx(null);
                setTxOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t.money.addTransaction}
            </Button>
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label={t.money.totalBalance} value={formatMoney(totals.totalBalance, currency)} accent="bg-indigo-500" />
        <SummaryCard label={t.money.netWorth} value={formatMoney(totals.netWorth, currency)} accent="bg-violet-500" />
        <SummaryCard label={t.money.monthlyIncome} value={formatMoney(totals.monthlyIncome, currency)} accent="bg-emerald-500" delta={incDelta == null ? null : { text: `${incDelta >= 0 ? "▲" : "▼"} ${Math.abs(incDelta)}% ${t.money.vsLastMonth}`, tone: incDelta >= 0 ? "up" : "down" }} />
        <SummaryCard label={t.money.monthlyExpenses} value={formatMoney(totals.monthlyExpenses, currency)} accent="bg-rose-500" delta={expDelta == null ? null : { text: `${expDelta >= 0 ? "▲" : "▼"} ${Math.abs(expDelta)}% ${t.money.vsLastMonth}`, tone: expDelta <= 0 ? "up" : "down" }} />
        <SummaryCard label={t.money.available} value={formatMoney(totals.available, currency)} accent="bg-sky-500" />
        <SummaryCard label={t.money.savingsRate} value={`${totals.savingsRate}%`} accent="bg-amber-500" />
      </div>

      {monthlyInsight && (
        <Card>
          <CardHeader title={t.money.monthlyHighlight} />
          <div className="space-y-2">
            {topExpenses.map((c, i) => (
              <div key={c.category} className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base" style={{ background: `${c.color}22` }}>
                  {c.icon ?? "📦"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">{c.category}</p>
                  <p className="text-[11px] text-zinc-500">
                    {i === 0 ? `${t.money.top1Label} · ` : ""}
                    {formatMoney(c.value, currency)}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{formatMoney(c.value, currency)}</span>
              </div>
            ))}
            <p className="rounded-xl bg-white/4 px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              💡 {t.money.insightLine.replace("{cat}", monthlyInsight.top?.category ?? "—").replace("{value}", formatMoney(monthlyInsight.top?.value ?? 0, currency)).replace("{perDay}", formatMoney(monthlyInsight.perDay, currency))}
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Chart */}
        <Card>
          <CardHeader title={t.money.whereDidMoneyGo} subtitle={t.dashboard.thisMonth} />
          {byCategory.length === 0 ? (
            <EmptyState icon="📊" title={t.money.noTransactions} />
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="value"
                      nameKey="category"
                      innerRadius={52}
                      outerRadius={80}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {byCategory.map((c, i) => (
                        <Cell key={i} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#18181b",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(v) => formatMoney(Number(v), currency)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                {byCategory.slice(0, 6).map((c) => (
                  <div key={c.category} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="truncate text-zinc-500 dark:text-zinc-400">{c.category}</span>
                    <span className="ml-auto font-medium text-zinc-700 dark:text-zinc-200">
                      {formatMoney(c.value, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Accounts */}
        <Card>
          <CardHeader
            title={t.money.accounts}
            subtitle={`${accounts.length} ${accounts.length === 1 ? "conta" : "contas"} · ${formatMoney(accounts.reduce((s, a) => s + a.balance, 0), currency)}`}
            action={
              <Button variant="ghost" size="sm" onClick={() => { setEditingAccount(null); setAccountOpen(true); }}>
                <Plus className="h-3.5 w-3.5" />
                {t.money.addAccount}
              </Button>
            }
          />
          <div className="space-y-2">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="group flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-white/6 bg-white/4 px-3 py-3 transition hover:border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:bg-white/6"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                  style={{ background: `${a.color ?? "#6366f1"}22` }}
                >
                  {a.icon ?? "🏦"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{a.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {ACCOUNT_TYPES.find((x) => x.value === a.type)?.label.replace(/^[^\s]+\s/, "") ?? a.type}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums tracking-tight text-zinc-800 dark:text-zinc-100">
                  {formatMoney(a.balance, currency)}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => {
                      setEditingAccount(a);
                      setAccountOpen(true);
                    }}
                    className="rounded-lg border border-zinc-200 dark:border-white/10 p-1.5 text-zinc-500 dark:text-zinc-400 transition hover:border-indigo-400/40 hover:text-indigo-600 dark:text-indigo-300"
                    title={t.common.edit}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      await supabase.from("accounts").delete().eq("id", a.id);
                      load();
                    }}
                    className="rounded-lg border border-zinc-200 dark:border-white/10 p-1.5 text-zinc-500 dark:text-zinc-400 transition hover:border-red-400/40 hover:text-red-400"
                    title={t.common.delete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Transactions */}
      <Card>
        <CardHeader
          title={t.money.transactions}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ListToolbar
                filters={[
                  { value: "all", label: t.common.all },
                  { value: "income", label: t.money.income },
                  { value: "expense", label: t.money.expense },
                ]}
                filter={txFilter}
                onFilter={setTxFilter}
                sortOptions={[
                  { value: "date", label: t.common.date },
                  { value: "amount", label: t.common.amount },
                ]}
                sort={txSort}
                onSort={setTxSort}
                order={txOrder}
                onOrder={setTxOrder}
                filterLabel={t.common.filter}
                sortLabel={t.common.sortBy}
                orderTitle={`${t.common.sortBy}: ${txOrder === "asc" ? t.common.ascending : t.common.descending}`}
              />
              <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.common.search}
                  className="h-8 w-28 bg-transparent text-xs text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-500 outline-none sm:w-40"
                />
              </div>
            </div>
          }
        />
        {filteredTx.length === 0 ? (
          <EmptyState icon="🧾" title={t.money.noTransactions} />
        ) : (
          <div className="divide-y divide-white/5">
            {filteredTx.slice(0, 50).map((tx) => {
              const cat = categories.find((c) => c.id === tx.category_id);
              const income = tx.amount > 0;
              return (
                <div key={tx.id} className="group flex items-center gap-3 py-2.5">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      income ? "bg-emerald-500/12" : "bg-zinc-100 dark:bg-white/6"
                    )}
                  >
                    {income ? (
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <span className="text-base">{cat?.icon ?? "📦"}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingNameId === tx.id ? (
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={() => commitRename(tx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            cancelNameRef.current = true;
                            e.currentTarget.blur();
                          }
                        }}
                        className="h-7 w-full rounded-lg border border-indigo-400/60 bg-zinc-50 dark:bg-white/5 px-2 text-sm font-medium text-zinc-800 dark:text-zinc-100 outline-none ring-2 ring-indigo-500/20"
                        placeholder={cat?.name ?? t.common.title}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRename(tx)}
                        title={t.common.edit}
                        className="block w-full truncate text-left text-sm font-medium text-zinc-700 dark:text-zinc-200 transition hover:text-indigo-600 dark:text-indigo-300"
                      >
                        {tx.description || cat?.name || t.common.title}
                      </button>
                    )}
                    <p className="text-[11px] text-zinc-500">
                      {cat?.name ?? "—"} · {relDay(tx.date, t.common.today, t.common.yesterday)}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      income ? "text-emerald-400" : "text-zinc-800 dark:text-zinc-100"
                    )}
                  >
                    {income ? "+" : "−"}
                    {formatMoney(Math.abs(tx.amount), currency)}
                  </p>
                  <div className="flex shrink-0 items-center">
                    <button
                      onClick={() => duplicateTx(tx)}
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 dark:bg-white/8 hover:text-indigo-600 dark:text-indigo-300"
                      title={t.common.duplicate}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingTx(tx);
                        setTxOpen(true);
                      }}
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 dark:bg-white/8 hover:text-indigo-600 dark:text-indigo-300"
                      title={t.common.edit}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteTx(tx.id)}
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 dark:bg-white/8 hover:text-red-400"
                      title={t.common.delete}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Add transaction modal */}
      <TransactionModal
        open={txOpen}
        onClose={() => {
          setTxOpen(false);
          setEditingTx(null);
        }}
        transaction={editingTx}
        accounts={accounts}
        categories={categories}
        expenseCats={expenseCats}
        incomeCats={incomeCats}
        onSaved={load}
        currency={currency}
      />

      {/* Add/edit account modal */}
      <AccountModal open={accountOpen} account={editingAccount} onClose={() => { setAccountOpen(false); setEditingAccount(null); }} onSaved={load} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  delta,
}: {
  label: string;
  value: string;
  accent: string;
  delta?: { text: string; tone: "up" | "down" } | null;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn("absolute inset-x-0 top-0 h-0.5", accent)} />
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1.5 text-lg font-bold tracking-tight text-zinc-800 dark:text-zinc-100">{value}</p>
      {delta && (
        <p className={cn("mt-1 text-[10px] font-medium", delta.tone === "up" ? "text-emerald-400" : "text-rose-400")}>
          {delta.text}
        </p>
      )}
    </Card>
  );
}

function relDay(dateStr: string, today: string, yesterday: string): string {
  const now = new Date();
  if (dateStr === now.toISOString().slice(0, 10)) return today;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dateStr === y.toISOString().slice(0, 10)) return yesterday;
  return dateStr;
}

function TransactionModal({
  open,
  onClose,
  accounts,
  categories,
  expenseCats,
  incomeCats,
  onSaved,
  currency,
  transaction,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  expenseCats: Category[];
  incomeCats: Category[];
  onSaved: () => void;
  currency: string;
  transaction?: Transaction | null;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      const txType: "expense" | "income" = transaction.amount > 0 ? "income" : "expense";
      const list = txType === "expense" ? expenseCats : incomeCats;
      setType(txType);
      setAmount(String(Math.abs(transaction.amount)));
      setDescription(transaction.description ?? "");
      setCategoryId(list.some((c) => c.id === transaction.category_id) ? (transaction.category_id ?? "") : (list[0]?.id ?? ""));
      setAccountId(transaction.account_id ?? accounts[0]?.id ?? "");
      setDate(transaction.date ?? new Date().toISOString().slice(0, 10));
    } else {
      setType("expense");
      setAmount("");
      setDescription("");
      setCategoryId(expenseCats[0]?.id ?? "");
      setAccountId(accounts[0]?.id ?? "");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, transaction, expenseCats, incomeCats, accounts]);

  const cats = type === "expense" ? expenseCats : incomeCats;

  async function save() {
    const value = parseFloat(amount.replace(",", "."));
    if (!value || !categoryId || !accountId) return;
    setSaving(true);
    const signed = type === "expense" ? -Math.abs(value) : Math.abs(value);

    if (transaction) {
      // Editing: keep the account balances consistent by reversing the old
      // movement's effect and applying the new one.
      const oldAccountId = transaction.account_id;
      if (oldAccountId === accountId) {
        const account = accounts.find((a) => a.id === accountId);
        await supabase
          .from("accounts")
          .update({ balance: (account?.balance ?? 0) + (signed - transaction.amount) })
          .eq("id", accountId);
      } else {
        if (oldAccountId) {
          const oldAccount = accounts.find((a) => a.id === oldAccountId);
          await supabase
            .from("accounts")
            .update({ balance: (oldAccount?.balance ?? 0) - transaction.amount })
            .eq("id", oldAccountId);
        }
        const account = accounts.find((a) => a.id === accountId);
        await supabase
          .from("accounts")
          .update({ balance: (account?.balance ?? 0) + signed })
          .eq("id", accountId);
      }
      await supabase
        .from("transactions")
        .update({ amount: signed, description, category_id: categoryId, account_id: accountId, date })
        .eq("id", transaction.id);
    } else {
      const { data } = await supabase
        .from("transactions")
        .insert({ amount: signed, description, category_id: categoryId, account_id: accountId, date })
        .select()
        .single();
      if (data) {
        const account = accounts.find((a) => a.id === accountId);
        await supabase
          .from("accounts")
          .update({ balance: (account?.balance ?? 0) + signed })
          .eq("id", accountId);
      }
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={transaction ? t.money.editTransaction : t.money.addTransaction}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setType("expense");
              setCategoryId(expenseCats[0]?.id ?? "");
            }}
            className={cn(
              "rounded-xl border py-2.5 text-sm font-medium transition",
              type === "expense"
                ? "border-rose-600 bg-rose-600 text-white shadow-sm"
                : "border-zinc-200 dark:border-white/10 text-zinc-500 hover:bg-zinc-50 dark:bg-white/5"
            )}
          >
            {t.money.expense}
          </button>
          <button
            onClick={() => {
              setType("income");
              setCategoryId(incomeCats[0]?.id ?? "");
            }}
            className={cn(
              "rounded-xl border py-2.5 text-sm font-medium transition",
              type === "income"
                ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                : "border-zinc-200 dark:border-white/10 text-zinc-500 hover:bg-zinc-50 dark:bg-white/5"
            )}
          >
            {t.money.income}
          </button>
        </div>

        <Field label={t.common.amount}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`0,00 ${currency}`}
            autoFocus
          />
        </Field>

        <Field label={t.common.description}>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === "expense" ? "Supermercado, jantar…" : "Salário, freelance…"}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.category}>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ${c.name}` : c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.common.account}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t.common.date}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Button className="w-full" onClick={save} disabled={saving || !amount}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

const ACCOUNT_ICONS = ["🏦", "💵", "🐷", "📈", "💳", "🪙", "🏠", "🚗", "✈️", "🎓", "🛒", "🎯"];
const ACCOUNT_COLORS = SWATCHES;

function AccountModal({
  open,
  account,
  onClose,
  onSaved,
}: {
  open: boolean;
  account: Account | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [balance, setBalance] = useState("");
  const [icon, setIcon] = useState("🏦");
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);

  useEffect(() => {
    if (open) {
      setName(account?.name ?? "");
      setType(account?.type ?? "bank");
      setBalance(account ? String(account.balance ?? 0) : "");
      setIcon(account?.icon ?? "🏦");
      setColor(account?.color ?? ACCOUNT_COLORS[0]);
    }
  }, [open, account]);

  async function save() {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      type,
      balance: parseFloat(balance.replace(",", ".")) || 0,
      icon,
      color,
    };
    if (account) {
      await supabase.from("accounts").update(payload).eq("id", account.id);
    } else {
      await supabase.from("accounts").insert(payload);
    }
    onSaved();
    onClose();
  }

  async function remove() {
    if (!account) return;
    await supabase.from("accounts").delete().eq("id", account.id);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={account ? t.money.editAccount : t.money.addAccount}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Conta à ordem" autoFocus />
        </Field>
        <Field label={t.money.type}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {ACCOUNT_TYPES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.money.balance}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="0,00"
          />
        </Field>
        <Field label={t.money.icon}>
          <div className="flex flex-wrap gap-1.5">
            {ACCOUNT_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl text-lg transition hover:scale-110",
                  icon === ic ? "bg-zinc-200 dark:bg-white/12 ring-2 ring-indigo-400" : "bg-white/4"
                )}
              >
                {ic}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t.money.color}>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-110"
                style={{ background: c }}
              >
                {color === c && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} disabled={!name.trim()}>
            {t.common.save}
          </Button>
          {account && (
            <Button variant="danger" onClick={remove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function MoneyPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-72" />
        </div>
      }
    >
      <MoneyPageInner />
    </Suspense>
  );
}
