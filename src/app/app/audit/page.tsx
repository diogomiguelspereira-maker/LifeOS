"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api, currentMonthTransactions, moneyTotals, spendingByCategory } from "@/lib/api";
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatDate, formatMoney } from "@/lib/format";
import type { Category, Document, HabitCompletion, SavingsGoal, Subscription, Task, Transaction } from "@/lib/types";

export default function AuditPage() {
  const { t, currency, profile } = useApp();
  const supabase = useSupabase();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [tx, setTx] = useState<Transaction[]>([]);
  const [studyMinutes, setStudyMinutes] = useState(0);

  const load = useCallback(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const [tasks_, subs_, goals_, docs_, comps_, cats_, tx_, study_] = await Promise.all([
      api.tasks(supabase),
      api.subscriptions(supabase),
      api.goals(supabase),
      supabase.from("documents").select("*"),
      api.completions(supabase, weekAgo),
      api.categories(supabase),
      api.allTransactions(supabase, 300),
      api.studySessions(supabase, 30),
    ]);
    setTasks(tasks_);
    setSubs(subs_);
    setGoals(goals_);
    setDocs((docs_.data as Document[]) ?? []);
    setCompletions(comps_);
    setCats(cats_);
    setTx(tx_);
    setStudyMinutes(study_.reduce((s, x) => s + x.minutes, 0));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const todayKey = new Date().toISOString().slice(0, 10);

  /* ---------- cleanup (#76) ---------- */
  const overdue = tasks.filter((x) => x.status !== "done" && x.due_date && x.due_date.slice(0, 10) < todayKey);
  const unusedSubs = subs.filter((s) => s.is_unused && !s.to_cancel);
  const dupGroups = new Map<string, Task[]>();
  for (const x of tasks.filter((x2) => x2.status !== "done")) {
    const key = x.title.trim().toLowerCase();
    const arr = dupGroups.get(key) ?? [];
    arr.push(x);
    if (arr.length > 1) dupGroups.set(key, arr);
  }
  const duplicates = [...dupGroups.values()].filter((a) => a.length > 1);
  const stuckGoals = goals.filter((g) => g.current_amount <= 0);
  const expiring = docs.filter((d) => d.expiry_date && d.expiry_date >= todayKey && d.expiry_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const cleanupCount = overdue.length + unusedSubs.length + duplicates.length + stuckGoals.length + expiring.length;

  /* ---------- life audit (#77) ---------- */
  const monthTx = currentMonthTransactions(tx);
  const totals = moneyTotals([], monthTx, profile);
  const byCat = spendingByCategory(monthTx, cats);
  const wantsCats = cats.filter((c) => c.budget_type !== "needs" && c.type === "expense");
  const wantsSpent = Math.abs(monthTx.filter((x) => x.amount < 0 && wantsCats.some((c) => c.id === x.category_id)).reduce((s, x) => s + x.amount, 0));
  const habitsConsistency = completions.length; // completions in last 7 days
  const learningHours = Math.round(studyMinutes / 60);

  const findings: { group: "keep" | "improve" | "remove" | "start"; icon: string; text: string }[] = [];
  if (totals.savingsRate >= 10) findings.push({ group: "keep", icon: "💰", text: `Taxa de poupança de ${totals.savingsRate}% — mantém o ritmo.` });
  else if (totals.monthlyIncome > 0) findings.push({ group: "improve", icon: "💰", text: `Taxa de poupança de ${totals.savingsRate}% — tenta chegar aos 10% (cerca de ${formatMoney(totals.monthlyIncome * 0.1, currency)}/mês).` });
  if (totals.monthlyIncome > 0 && wantsSpent > totals.monthlyIncome * 0.3) findings.push({ group: "improve", icon: "🛍️", text: `Gastas ${Math.round((wantsSpent / totals.monthlyIncome) * 100)}% do rendimento em desejos (meta: ≤30%).` });
  if (unusedSubs.length) findings.push({ group: "remove", icon: "💸", text: `${unusedSubs.length} subscrição(ões) marcadas como não usadas — cancela e poupa ${formatMoney(unusedSubs.reduce((s, x) => s + x.amount, 0), currency)}/mês.` });
  if (overdue.length === 0 && tasks.filter((x) => x.status !== "done").length <= 3) findings.push({ group: "keep", icon: "✅", text: "Lista de tarefas sob controlo." });
  else if (overdue.length) findings.push({ group: "improve", icon: "⏰", text: `${overdue.length} tarefa(s) atrasada(s) — reserva 30 min hoje para limpar as antigas.` });
  if (habitsConsistency >= 4) findings.push({ group: "keep", icon: "🔥", text: `${habitsConsistency} hábito(s) concluído(s) esta semana — consistência boa.` });
  else findings.push({ group: "start", icon: "🌱", text: "Menos de 4 hábitos esta semana — começa com 1 pequeno (ex: 1 copo de água ao acordar)." });
  if (goals.filter((g) => g.current_amount < g.target_amount).length === 0) findings.push({ group: "start", icon: "🎯", text: "Sem objetivos ativos — define 1 meta de poupança para dar direção." });
  else if (stuckGoals.length) findings.push({ group: "improve", icon: "🎯", text: `${stuckGoals.length} objetivo(s) sem progresso — ou avança com uma contribuição pequena ou remove-os.` });
  if (learningHours <= 0) findings.push({ group: "start", icon: "📚", text: "Sem horas de estudo registadas este mês — 20 min por dia já fazem diferença." });

  return (
    <div className="space-y-5">
      <PageHeader title={t.audit.title} />

      {/* Cleanup */}
      <Card>
        <CardHeader title={t.audit.cleanup} subtitle={cleanupCount ? `${cleanupCount} ${t.audit.found}` : undefined} />
        {cleanupCount === 0 ? (
          <EmptyState icon="✨" title={t.audit.nothingFound} />
        ) : (
          <div className="space-y-2">
            {overdue.map((task) => (
              <div key={task.id} className="flex items-center gap-2 text-sm">
                <span>⏰</span>
                <span className="truncate text-zinc-700 dark:text-zinc-200">{task.title}</span>
                <Badge color="red">atrasada</Badge>
                <span className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={async () => { await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", task.id); load(); }}>
                    <Check className="h-3.5 w-3.5" /> concluir
                  </Button>
                  <Button size="sm" variant="danger" onClick={async () => { await supabase.from("tasks").delete().eq("id", task.id); load(); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>
            ))}
            {unusedSubs.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span>💸</span>
                <span className="truncate text-zinc-700 dark:text-zinc-200">{s.name}</span>
                <Badge color="amber">não usada</Badge>
                <span className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={async () => { await supabase.from("subscriptions").update({ to_cancel: true }).eq("id", s.id); load(); }}>
                    marcar para cancelar
                  </Button>
                </span>
              </div>
            ))}
            {duplicates.map((group, gi) => (
              <div key={gi} className="flex items-center gap-2 text-sm">
                <span>📑</span>
                <span className="truncate text-zinc-700 dark:text-zinc-200">{group[0].title}</span>
                <Badge color="zinc">{group.length}× duplicada</Badge>
                <span className="ml-auto">
                  <Button size="sm" variant="danger" onClick={async () => { await supabase.from("tasks").delete().in("id", group.slice(1).map((x) => x.id)); load(); }}>
                    <Trash2 className="h-3.5 w-3.5" /> remover duplicadas
                  </Button>
                </span>
              </div>
            ))}
            {stuckGoals.map((g) => (
              <div key={g.id} className="flex items-center gap-2 text-sm">
                <span>{g.icon}</span>
                <span className="truncate text-zinc-700 dark:text-zinc-200">{g.name}</span>
                <Badge color="amber">sem progresso</Badge>
                <span className="ml-auto">
                  <Button size="sm" variant="danger" onClick={async () => { await supabase.from("savings_goals").delete().eq("id", g.id); load(); }}>
                    <Trash2 className="h-3.5 w-3.5" /> remover
                  </Button>
                </span>
              </div>
            ))}
            {expiring.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <span>📄</span>
                <span className="truncate text-zinc-700 dark:text-zinc-200">{d.name}</span>
                <Badge color="red">expira {formatDate(d.expiry_date!)}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Life audit */}
      <Card>
        <CardHeader title={t.audit.auditTitle} />
        <div className="grid gap-3 sm:grid-cols-2">
          {(["keep", "improve", "remove", "start"] as const).map((group) => {
            const items = findings.filter((f) => f.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="rounded-xl border border-zinc-200 dark:border-white/8 bg-white/4 px-3 py-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {group === "keep" ? "✅ KEEP" : group === "improve" ? "📈 IMPROVE" : group === "remove" ? "🗑️ REMOVE" : "🚀 START"}
                </p>
                <div className="space-y-1.5">
                  {items.map((f, i) => (
                    <p key={i} className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                      {f.icon} {f.text}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
