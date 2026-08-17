import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { api, currentMonthTransactions, moneyTotals, spendingByCategory } from "@/lib/api";
import type { NovaResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { message, conversation_id } = (await request.json()) as {
    message: string;
    conversation_id?: string | null;
  };
  if (!message?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  try {
    // ---- gather user context (RLS-scoped to this user) ----
    const [profile, tx, accounts, cats, tasks, events, goals, subs] = await Promise.all([
      api.profile(supabase),
      api.allTransactions(supabase, 200),
      api.accounts(supabase),
      api.categories(supabase),
      api.tasks(supabase),
      (async () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        const end = new Date(d.getTime() + 7 * 86400000);
        return api.events(supabase, d.toISOString(), end.toISOString());
      })(),
      api.goals(supabase),
      api.subscriptions(supabase),
    ]);

    const monthTx = currentMonthTransactions(tx);
    const totals = moneyTotals(accounts, monthTx, profile);
    const byCat = spendingByCategory(monthTx, cats).slice(0, 6);

    const context = {
      user: profile?.name ?? user.email,
      currency: profile?.currency ?? "EUR",
      language: profile?.language ?? "pt",
      money: {
        available: totals.available,
        monthlyIncome: totals.monthlyIncome,
        monthlyExpenses: totals.monthlyExpenses,
        savingsRate: totals.savingsRate,
        totalBalance: totals.totalBalance,
        spendingByCategory: byCat.map((c) => ({ [c.category]: c.value })),
      },
      goals: goals.map((g) => ({ name: g.name, current: g.current_amount, target: g.target_amount, deadline: g.deadline, monthlyContribution: g.monthly_contribution })),
      subscriptions: subs.map((s) => ({ name: s.name, amount: s.amount, next: s.next_billing_date })),
      upcomingEvents: events.slice(0, 5).map((e) => ({ title: e.title, start: e.start_at })),
      openTasks: tasks.filter((x) => x.status !== "done").slice(0, 10).map((x) => ({ title: x.title, due: x.due_date })),
    };

    // conversation history
    let convId = conversation_id ?? null;
    let history: { role: "user" | "assistant"; content: string }[] = [];
    if (convId) {
      const { data } = await supabase
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true })
        .limit(20);
      history = ((data as { role: "user" | "assistant"; content: string }[]) ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      }));
    }

    if (!convId) {
      const { data } = await supabase
        .from("ai_conversations")
        .insert({ title: message.slice(0, 40) })
        .select()
        .single();
      convId = (data as { id: string } | null)?.id ?? null;
    }

    const systemPrompt = `És a Nova, a assistente pessoal de IA da LifeOS — o centro de comando pessoal do utilizador (dinheiro, tarefas, calendário, hábitos, objetivos).
Regras:
- Responde sempre no idioma do utilizador (campo language do contexto: pt ou en).
- Responde de forma curta, calorosa e prática, como uma assistente de confiança. Usa emojis com moderação.
- Quando o utilizador pedir para CRIAR algo (tarefa, evento, objetivo de poupança, nota, movimento financeiro), devolve JSON com campo "reply" (texto a mostrar) e campo "action" com {kind, payload}. Kinds válidos: create_task {title, due_date?, notes?}, create_event {title, start_at?, end_at?}, create_goal {name, target_amount?, deadline?}, create_note {title, content}, create_transaction {amount, description?, type: "expense"|"income"}.
- Para operações destrutivas (apagar, alterar) NUNCA devolvas action: apenas confirma o que encontraste e pergunta se quer que avance (o utilizador confirma na UI).
- Usa os dados do contexto para responder com números reais. Para "can I afford it" / "posso comprar": analisa dinheiro disponível, rendimento, despesas, objetivos e respondes com recomendação educacional clara, distinguindo-a de aconselhamento financeiro profissional.
- Não inventes dados que não estejam no contexto.
Contexto do utilizador: ${JSON.stringify(context)}
Responde APENAS com JSON válido: {"reply": string, "action"?: object}.`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history,
      { role: "user" as const, content: message },
    ];

    let result: NovaResponse;

    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
        max_tokens: 700,
        response_format: { type: "json_object" },
      });
      const raw = completion.choices[0]?.message?.content ?? '{"reply":"Peço desculpa, algo correu mal."}';
      try {
        result = JSON.parse(raw);
      } catch {
        result = { reply: raw };
      }
    } else {
      result = localNova(message, context);
    }

    // persist the exchange
    if (convId) {
      await supabase.from("ai_messages").insert([
        { conversation_id: convId, role: "user", content: message },
        { conversation_id: convId, role: "assistant", content: result.reply },
      ]);
    }

    return NextResponse.json({ ...result, conversation_id: convId });
  } catch (err) {
    console.error("nova error", err);
    return NextResponse.json(
      { reply: "Peço desculpa, tive um problema. Tenta novamente daqui a pouco." },
      { status: 200 }
    );
  }
}

/* ---------- offline fallback (no OpenAI key) ---------- */
function localNova(message: string, ctx: { language: string; money: Record<string, unknown>; goals: { name: string; current: number; target: number }[]; openTasks: { title: string; due: string | null }[] }): NovaResponse {
  const m = message.toLowerCase();
  const money = ctx.money as { available: number; monthlyIncome: number; monthlyExpenses: number };
  const fmt = (v: number) => `${Math.round(v).toLocaleString("pt-PT")} €`;
  const pt = ctx.language !== "en";

  if (/(quanto posso gastar|how much can i spend|disponível|available)/.test(m)) {
    return { reply: pt ? `💰 Tens ${fmt(money.available)} disponíveis para gastar este mês (rendimento ${fmt(money.monthlyIncome)} − despesas ${fmt(money.monthlyExpenses)}).` : `💰 You have ${fmt(money.available)} available to spend this month.` };
  }
  if (/(quanto gastei|how much did i spend|gastei|spent)/.test(m)) {
    return { reply: pt ? `Este mês gastaste ${fmt(money.monthlyExpenses)}.` : `You spent ${fmt(money.monthlyExpenses)} this month.` };
  }
  if (/(o que tenho amanhã|what do i have tomorrow|amanhã|tomorrow)/.test(m) && /(tenho|have|o que|what)/.test(m)) {
    return { reply: pt ? "📅 Amanhã está vazio no teu calendário. Queres que te sugira algo produtivo?" : "📅 Tomorrow looks free. Want me to suggest something productive?" };
  }
  if (/(objetivo|goal|poupança|savings)/.test(m) && /(cria|create|quero|want)/.test(m)) {
    const amount = m.match(/(\d[\d\s.,]*)\s*(€|euros|eur)?/);
    const target = amount ? parseFloat(amount[1].replace(/\s/g, "").replace(",", ".")) : 500;
    return {
      reply: pt ? `Vou criar um objetivo de poupança de ${fmt(target)}. Confirma para eu adicionar. 🎯` : `I'll create a ${fmt(target)} savings goal. Confirm to add it. 🎯`,
      action: { kind: "create_goal", payload: { name: "Nova poupança", target_amount: target } },
    };
  }
  if (/(lembra-me|remind me|recorda)/.test(m)) {
    const title = message.replace(/^(lembra-me|remind me|recorda[-]?me)\s+(de|para|to|about|of)?\s*/i, "").trim() || "Lembrete";
    return {
      reply: pt ? `Claro! Vou criar a tarefa "…${title}". Confirma para eu guardar. ⏰` : `Sure! I'll create the task "${title}". Confirm to save it. ⏰`,
      action: { kind: "create_task", payload: { title, due_date: null } },
    };
  }
  if (/(tarefa|task)/.test(m) && /(cria|create|adiciona|add)/.test(m)) {
    const title = message.replace(/^(cria|create|adiciona|add)\s+(uma\s+)?(tarefa|task)\s*/i, "").trim() || "Tarefa nova";
    return {
      reply: pt ? `Vou adicionar a tarefa "${title}". Confirma? ✅` : `I'll add the task "${title}". Confirm? ✅`,
      action: { kind: "create_task", payload: { title } },
    };
  }
  if (/(olá|hello|oi|hey|bom dia|boa tarde|boa noite)/.test(m)) {
    return { reply: pt ? "Olá! 👋 Estou aqui para te ajudar com dinheiro, tarefas, calendário e objetivos. O que precisas?" : "Hi! 👋 I'm here to help with money, tasks, calendar and goals. What do you need?" };
  }
  if (/(posso comprar|can i afford|comprar|buy)/.test(m)) {
    const amount = m.match(/(\d[\d\s.,]*)\s*(€|euros|eur)?/);
    const price = amount ? parseFloat(amount[1].replace(/\s/g, "").replace(",", ".")) : 0;
    if (price > 0) {
      return {
        reply: pt
          ? `Com ${fmt(money.available)} disponíveis, ${price <= money.available ? "tecnicamente consegues" : "não tens liquidez suficiente"} comprar por ${fmt(price)}. Recomendo esperar 1–2 meses ou poupar mais ${fmt(Math.max(0, price - money.available))} primeiro. Isto é uma opinião educacional, não aconselhamento financeiro profissional.`
          : `With ${fmt(money.available)} available you ${price <= money.available ? "can technically afford" : "don't have enough liquidity for"} ${fmt(price)}. I'd recommend waiting 1–2 months or saving ${fmt(Math.max(0, price - money.available))} more first. This is educational, not professional financial advice.`,
      };
    }
  }
  if (/(conta|tell me|como estou|how am i|resumo|summary)/.test(m)) {
    return {
      reply: pt
        ? `📊 Resumo: tens ${fmt(money.available)} disponíveis, ${ctx.goals.length} objetivo(s) ativo(s) e ${ctx.openTasks.length} tarefa(s) em aberto.`
        : `📊 Summary: ${fmt(money.available)} available, ${ctx.goals.length} active goal(s), ${ctx.openTasks.length} open task(s).`,
    };
  }
  return {
    reply: pt
      ? "Posso ajudar com: 💰 quanto podes gastar, 📅 o teu dia, 🎯 criar objetivos, ✅ criar tarefas e ✍️ notas. Experimenta perguntar! (Dica: adiciona uma chave OpenAI nas definições para respostas completas.)"
      : "I can help with: 💰 how much you can spend, 📅 your day, 🎯 creating goals, ✅ tasks and ✍️ notes. Try asking! (Tip: add an OpenAI key in settings for full responses.)",
  };
}
