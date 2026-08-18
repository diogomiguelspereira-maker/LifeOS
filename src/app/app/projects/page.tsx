"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FolderKanban, Link2, Plus, Trash2, Wallet } from "lucide-react";
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
  Progress,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney, percent } from "@/lib/format";
import type { Account, Project, SavingsGoal, Task, Transaction } from "@/lib/types";
import { cn } from "@/lib/cn";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#06b6d4", "#f59e0b", "#ef4444"];

export default function ProjectsPage() {
  const { t, currency } = useApp();
  const supabase = useSupabase();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tx, setTx] = useState<Transaction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [expenseFor, setExpenseFor] = useState<Project | null>(null);
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [goalLinkFor, setGoalLinkFor] = useState<Project | null>(null);

  const load = useCallback(async () => {
    const [ps, tx_, ts, gs, acc] = await Promise.all([
      api.projects(supabase),
      api.allTransactions(supabase, 300),
      api.tasks(supabase),
      api.goals(supabase),
      api.accounts(supabase),
    ]);
    setProjects(ps);
    setTx(tx_);
    setTasks(ts);
    setGoals(gs);
    setAccounts(acc);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProject() {
    if (!editing?.name.trim()) return;
    if (editing.id) {
      await supabase
        .from("projects")
        .update({ name: editing.name.trim(), description: editing.description || null, budget: editing.budget, color: editing.color })
        .eq("id", editing.id);
    } else {
      await supabase.from("projects").insert({
        name: editing.name.trim(),
        description: editing.description || null,
        budget: editing.budget,
        color: editing.color,
      });
    }
    setEditOpen(false);
    setEditing(null);
    load();
  }

  async function addExpense() {
    if (!expenseFor || !expAmount) return;
    const amount = -Math.abs(parseFloat(expAmount.replace(",", ".")));
    const first = accounts[0] ?? null;
    await supabase.from("transactions").insert({
      amount,
      description: expDesc.trim() || expenseFor.name,
      project_id: expenseFor.id,
      account_id: first?.id ?? null,
      date: new Date().toISOString().slice(0, 10),
    });
    if (first) {
      await supabase.from("accounts").update({ balance: (first.balance ?? 0) + amount }).eq("id", first.id);
    }
    setExpenseFor(null);
    setExpAmount("");
    setExpDesc("");
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

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.projects.title}
        action={
          <Button
            onClick={() => {
              setEditing({ id: "", user_id: "", name: "", description: "", color: COLORS[0], budget: null, status: "active" });
              setEditOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t.projects.add}
          </Button>
        }
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState icon="🗂️" title={t.projects.noProjects} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((p) => {
            const spent = tx.filter((x) => x.project_id === p.id && x.amount < 0).reduce((s, x) => s + Math.abs(x.amount), 0);
            const pct = p.budget && p.budget > 0 ? percent(spent, p.budget) : 0;
            const ptasks = tasks.filter((x) => x.project_id === p.id && x.status !== "done");
            const goal = goals.find((g) => g.project_id === p.id) ?? null;
            const gPct = goal ? percent(goal.current_amount, goal.target_amount) : 0;
            return (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl text-lg" style={{ background: `${p.color}22` }}>
                      <FolderKanban className="h-4.5 w-4.5" style={{ color: p.color }} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{p.name}</p>
                      {p.description && <p className="text-[11px] text-zinc-500">{p.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditing(p);
                        setEditOpen(true);
                      }}
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/8 hover:text-zinc-200"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={async () => {
                        await supabase.from("projects").delete().eq("id", p.id);
                        load();
                      }}
                      className="rounded-lg p-1.5 text-zinc-600 transition hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {p.budget != null && p.budget > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-zinc-500">
                        {t.projects.spent}: {formatMoney(spent, currency)} / {formatMoney(p.budget, currency)}
                      </span>
                      <span className={cn(pct > 100 ? "text-red-400" : "text-zinc-400")}>{pct}%</span>
                    </div>
                    <Progress value={pct} color={pct > 100 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-indigo-500 to-violet-400"} />
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setExpenseFor(p)}>
                    <Wallet className="h-3.5 w-3.5" />
                    {t.projects.addExpense}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setGoalLinkFor(p)}>
                    <Link2 className="h-3.5 w-3.5" />
                    {goal ? goal.name : t.projects.linkGoal}
                  </Button>
                </div>

                {ptasks.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.projects.tasks}</p>
                    <div className="space-y-1">
                      {ptasks.slice(0, 4).map((task) => (
                        <div key={task.id} className="flex items-center gap-2 text-sm text-zinc-300">
                          <span className="h-3 w-3 shrink-0 rounded-full border border-white/20" />
                          <span className="truncate">{task.title}</span>
                          {task.estimated_minutes != null && <span className="ml-auto text-[11px] text-zinc-600">{task.estimated_minutes}m</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {goal && (
                  <div className="mt-3 rounded-xl bg-white/4 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-400">
                        🎯 {goal.name} · {formatMoney(goal.current_amount, currency)} / {formatMoney(goal.target_amount, currency)}
                      </span>
                      <span className="text-zinc-500">{gPct}%</span>
                    </div>
                    <Progress value={gPct} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* create/edit */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing?.id ? t.projects.add : t.projects.add}>
        {editing && (
          <div className="space-y-4">
            <Field label={t.common.title}>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
            </Field>
            <Field label={t.common.notes}>
              <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
            </Field>
            <Field label={`${t.projects.budget} (${currency})`}>
              <Input
                type="number"
                value={editing.budget ?? ""}
                onChange={(e) => setEditing({ ...editing, budget: e.target.value ? parseFloat(e.target.value) : null })}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setEditing({ ...editing, color: c })}
                  className="flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-110"
                  style={{ background: c }}
                >
                  {editing.color === c && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
            <Button className="w-full" onClick={saveProject} disabled={!editing.name.trim()}>
              {t.common.save}
            </Button>
          </div>
        )}
      </Modal>

      {/* expense */}
      <Modal open={!!expenseFor} onClose={() => setExpenseFor(null)} title={`${t.projects.addExpense} — ${expenseFor?.name}`}>
        <div className="space-y-4">
          <Field label={`${t.common.amount} (${currency})`}>
            <Input type="number" inputMode="decimal" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} autoFocus />
          </Field>
          <Field label={t.common.title}>
            <Input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Peças, alojamento…" />
          </Field>
          <Button className="w-full" onClick={addExpense} disabled={!expAmount}>
            {t.common.save}
          </Button>
        </div>
      </Modal>

      {/* link goal */}
      <Modal open={!!goalLinkFor} onClose={() => setGoalLinkFor(null)} title={t.projects.linkGoal}>
        <div className="space-y-1">
          {goals
            .filter((g) => !g.project_id || g.project_id === goalLinkFor?.id)
            .map((g) => (
              <button
                key={g.id}
                onClick={async () => {
                  if (goalLinkFor) {
                    await supabase.from("savings_goals").update({ project_id: goalLinkFor.id }).eq("id", g.id);
                    load();
                    setGoalLinkFor(null);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/10"
              >
                <span>{g.icon}</span>
                <span className="truncate">{g.name}</span>
                <span className="ml-auto text-xs text-zinc-500">
                  {formatMoney(g.current_amount, currency)}/{formatMoney(g.target_amount, currency)}
                </span>
              </button>
            ))}
          {goals.filter((g) => !g.project_id).length === 0 && (
            <p className="py-2 text-sm text-zinc-500">{t.projects.noGoal}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
