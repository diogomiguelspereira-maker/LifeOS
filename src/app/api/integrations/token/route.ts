import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const token = randomToken();
  const { data, error } = await supabase
    .from("integration_tokens")
    .insert({ user_id: user.id, name: body.name?.trim() || null, token })
    .select("id, name, created_at")
    .single();
  if (error)
    return NextResponse.json({ error: "insert-failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, token, id: data.id, name: data.name, created_at: data.created_at });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "missing-id" }, { status: 400 });
  await supabase.from("integration_tokens").delete().eq("id", body.id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
