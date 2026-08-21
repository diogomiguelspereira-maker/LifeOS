import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const checks: { name: string; ok: boolean; detail?: string }[] = [];

  // New tables that depend on migrations 7–9.
  for (const table of ["calendar_shares", "bank_links", "integration_tokens"]) {
    const { error } = await supabase.from(table).select("id").limit(1);
    checks.push({
      name: table,
      ok: !error,
      detail: error ? error.message : undefined,
    });
  }

  // The share RPC is healthy when a random token yields "share_not_found" (P0001).
  const { error: rpcErr } = await supabase.rpc("get_shared_calendar", {
    p_token: "diagnostics-probe",
  });
  checks.push({
    name: "get_shared_calendar",
    ok: !!rpcErr && rpcErr.code === "P0001",
    detail: rpcErr ? rpcErr.message : "unexpected success",
  });

  return NextResponse.json({ ok: checks.every((c) => c.ok), checks });
}
