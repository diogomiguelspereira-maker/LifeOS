import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { breakdownSuggestions, type BreakdownSuggestion } from "@/lib/deadlines";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, notes, language } = (await request.json()) as {
    title?: string;
    notes?: string;
    language?: string;
  };
  if (!title?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  const fallback = (): NextResponse => {
    const items = breakdownSuggestions(title.trim(), notes ?? "") ?? [];
    return NextResponse.json({ items });
  };

  // Offline mode: rule-based templates.
  if (!process.env.OPENAI_API_KEY) return fallback();

  try {
    const baseURL = process.env.OPENAI_BASE_URL || undefined;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(baseURL ? { baseURL } : {}),
    });
    const pt = language !== "en";
    const prompt = `Tarefa: "${title}"${notes ? `\nNotas: "${notes}"` : ""}
Proponhe uma decomposição da tarefa em ${pt ? "subtarefas" : "subtasks"} concretas e acionáveis (3-6 passos).
Regras:
- Se a tarefa for trivial (uma única ação que se faz em menos de 15 minutos), devolve uma lista VAZIA.
- Cada passo: {"title": título curto, "estimated_minutes": número inteiro de minutos}.
- Ordena por ordem lógica de execução.
Responde APENAS com JSON válido: {"items": [{"title": string, "estimated_minutes": number}]}`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: "system", content: prompt }],
      temperature: 0.4,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { items?: { title?: string; estimated_minutes?: number }[] };
    const items: BreakdownSuggestion[] = (parsed.items ?? [])
      .filter((it) => it.title?.trim())
      .map((it) => ({
        title: it.title!.trim(),
        estimated_minutes: Math.max(5, Math.round(it.estimated_minutes ?? 30)),
      }))
      .slice(0, 6);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("nova breakdown error", err);
    return fallback();
  }
}
