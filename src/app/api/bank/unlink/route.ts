import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as { link_id?: string };
  if (!body.link_id) return NextResponse.json({ error: "missing-link" }, { status: 400 });

  await supabase.from("bank_links").delete().eq("id", body.link_id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
