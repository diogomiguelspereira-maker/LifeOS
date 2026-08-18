import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { api, currentMonthTransactions, spendingByCategory } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [profile, tx, cats, tasks, habits, completions, goals, events] = await Promise.all([
      api.profile(supabase),
      api.allTransactions(supabase, 300),
      api.categories(supabase),
      api.tasks(supabase),
      api.habits(supabase),
      api.completions(supabase, weekAgo.slice(0, 10)),
      api.goals(supabase),
      api.events(supabase, weekAgo, new Date().toISOString()),
    ]);

    const weekTx = tx.filter((t) => t.date >= weekAgo.slice(0, 10));
    const spent = Math.abs(weekTx.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const income = weekTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const done = tasks.filter((t) => t.completed_at && t.completed_at >= weekAgo).length;
    const completedHabits = completions.length;
    const habitNames = new Set(completions.map((c) => c.habit_id));
    const habitCount = habits.filter((h) => habitNames.has(h.id)).length;
    const eventCount = events.length;
    const byCat = spendingByCategory(weekTx, cats).slice(0, 3);

    const currency = profile?.currency ?? "EUR";
    const pt = profile?.language !== "en";
    const fmt = (v: number) => `${Math.round(v).toLocaleString("pt-PT")} ${currency}`;

    const lines = [
      pt ? `📅 Resumo da tua semana (últimos 7 dias):` : `📅 Your week in review (last 7 days):`,
      pt ? `• ✅ Concluíste ${done} tarefa(s).` : `• ✅ You completed ${done} task(s).`,
      pt ? `• 💰 Gastaste ${fmt(spent)}${income > 0 ? ` e recebeste ${fmt(income)}` : ""}.` : `• 💰 You spent ${fmt(spent)}${income > 0 ? ` and received ${fmt(income)}` : ""}.`,
      pt ? `• 🔥 Registaste ${completedHabits} hábito(s) concluído(s) (${habitCount} hábito(s) ativos).` : `• 🔥 You logged ${completedHabits} habit completion(s) (${habitCount} active habit(s)).`,
      pt ? `• 📆 Tiveste ${eventCount} evento(s) no calendário.` : `• 📆 You had ${eventCount} calendar event(s).`,
    ];

    if (byCat.length) {
      lines.push(
        pt
          ? `• 🛒 Top gastos: ${byCat.map((c) => `${c.category} (${fmt(c.value)})`).join(", ")}.`
          : `• 🛒 Top spending: ${byCat.map((c) => `${c.category} (${fmt(c.value)})`).join(", ")}.`
      );
    }

    const activeGoals = goals.filter((g) => g.current_amount < g.target_amount);
    if (activeGoals.length) {
      const closest = activeGoals.sort((a, b) => b.current_amount / b.target_amount - a.current_amount / a.target_amount)[0];
      lines.push(
        pt
          ? `• 🎯 Objetivo mais perto: ${closest.name} (${Math.round((closest.current_amount / closest.target_amount) * 100)}%).`
          : `• 🎯 Closest goal: ${closest.name} (${Math.round((closest.current_amount / closest.target_amount) * 100)}%).`
      );
    }

    lines.push(
      pt
        ? `\n💡 Na próxima semana: escolhe uma tarefa importante e um hábito para manter a sequência.`
        : `\n💡 Next week: pick one important task and one habit to keep the streak going.`
    );

    return NextResponse.json({ reply: lines.join("\n") });
  } catch (err) {
    console.error("review error", err);
    return NextResponse.json(
      { reply: "Peço desculpa, não consegui gerar a revisão. Tenta novamente." },
      { status: 200 }
    );
  }
}
