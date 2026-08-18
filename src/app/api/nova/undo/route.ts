import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { action_id } = (await request.json()) as { action_id?: string };
  if (!action_id) return NextResponse.json({ error: "missing" }, { status: 400 });

  const { data: log } = await supabase
    .from("ai_action_log")
    .select("*")
    .eq("id", action_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!log) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const payload = (log.undo_payload as Record<string, unknown>) ?? {};
  const createdEvents = (payload.created_events as string[] | undefined) ?? [];
  const createdTasks = (payload.created_tasks as string[] | undefined) ?? [];

  try {
    if (createdEvents.length) {
      await supabase.from("calendar_events").delete().in("id", createdEvents);
    }
    if (createdTasks.length) {
      await supabase.from("tasks").delete().in("id", createdTasks);
    }
    await supabase.from("ai_action_log").delete().eq("id", action_id);
    return NextResponse.json({ ok: true, removed_events: createdEvents.length, removed_tasks: createdTasks.length });
  } catch (err) {
    console.error("undo error", err);
    return NextResponse.json({ error: "undo-failed" }, { status: 500 });
  }
}
