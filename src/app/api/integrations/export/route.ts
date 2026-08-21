import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bearerToken, findUserByIntegrationToken } from "@/lib/integrations";

export const runtime = "nodejs";

const TYPES: Record<string, { table: string; order: string }> = {
  tasks: { table: "tasks", order: "created_at" },
  events: { table: "calendar_events", order: "start_at" },
  notes: { table: "notes", order: "updated_at" },
  transactions: { table: "transactions", order: "date" },
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const userId = await findUserByIntegrationToken(supabase, bearerToken(request));
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const type = new URL(request.url).searchParams.get("type") ?? "tasks";
  const conf = TYPES[type];
  if (!conf) return NextResponse.json({ error: "unsupported-type" }, { status: 400 });

  const limit = Math.min(500, Number(new URL(request.url).searchParams.get("limit")) || 200);
  const { data, error } = await supabase
    .from(conf.table)
    .select("*")
    .eq("user_id", userId)
    .order(conf.order, { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: "query-failed" }, { status: 500 });
  return NextResponse.json({ type, data });
}
