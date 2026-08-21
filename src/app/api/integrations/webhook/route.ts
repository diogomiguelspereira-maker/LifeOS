import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bearerToken, findUserByIntegrationToken } from "@/lib/integrations";

export const runtime = "nodejs";

const ACTIONS = new Set([
  "create_task",
  "create_event",
  "create_note",
  "create_transaction",
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const userId = await findUserByIntegrationToken(supabase, bearerToken(request));
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: string; payload?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  const action = body.action;
  if (!action || !ACTIONS.has(action))
    return NextResponse.json({ error: "unsupported-action" }, { status: 400 });
  const payload = body.payload ?? {};

  try {
    switch (action) {
      case "create_task": {
        const title = String(payload.title ?? "").trim();
        if (!title) return NextResponse.json({ error: "missing-title" }, { status: 400 });
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            user_id: userId,
            title,
            notes: payload.notes ? String(payload.notes) : null,
            due_date: payload.due_date ? String(payload.due_date) : null,
            priority: (["low", "medium", "high"].includes(String(payload.priority)) ? payload.priority : "medium") as "low" | "medium" | "high",
            tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
          })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
      case "create_event": {
        const title = String(payload.title ?? "").trim();
        const startAt = String(payload.start_at ?? "");
        if (!title || !startAt) return NextResponse.json({ error: "missing-title-or-start" }, { status: 400 });
        const { data, error } = await supabase
          .from("calendar_events")
          .insert({
            user_id: userId,
            title,
            start_at: startAt,
            end_at: payload.end_at ? String(payload.end_at) : null,
            all_day: Boolean(payload.all_day),
            color: typeof payload.color === "string" && payload.color.startsWith("#") ? payload.color : "#6366f1",
            location: payload.location ? String(payload.location) : null,
            description: payload.description ? String(payload.description) : null,
          })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
      case "create_note": {
        const title = String(payload.title ?? "").trim() || "Sem título";
        const { data, error } = await supabase
          .from("notes")
          .insert({
            user_id: userId,
            title,
            content: payload.content ? String(payload.content) : "",
            tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
          })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
      case "create_transaction": {
        const amount = Number(payload.amount);
        if (!Number.isFinite(amount) || amount === 0)
          return NextResponse.json({ error: "missing-amount" }, { status: 400 });
        const { data, error } = await supabase
          .from("transactions")
          .insert({
            user_id: userId,
            amount,
            description: payload.description ? String(payload.description) : "Movimento externo",
            merchant: payload.merchant ? String(payload.merchant) : null,
            date: payload.date ? String(payload.date) : new Date().toISOString().slice(0, 10),
            external_id: payload.external_id ? `webhook:${String(payload.external_id)}` : null,
          })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
    }
  } catch (err) {
    console.error("integration webhook error", err);
    return NextResponse.json({ error: "insert-failed" }, { status: 500 });
  }
}
