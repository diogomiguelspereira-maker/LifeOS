import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appBaseUrl } from "@/lib/google";
import { createRequisition, isGoCardlessConfigured } from "@/lib/gocardless";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isGoCardlessConfigured())
    return NextResponse.json({ error: "not-configured" }, { status: 400 });

  const body = (await request.json()) as { institution_id?: string; institution_name?: string };
  if (!body.institution_id)
    return NextResponse.json({ error: "missing-institution" }, { status: 400 });

  try {
    const { requisitionId, link } = await createRequisition(
      body.institution_id,
      `${appBaseUrl(request)}/api/bank/callback`
    );
    const { error } = await supabase.from("bank_links").insert({
      user_id: user.id,
      institution_id: body.institution_id,
      institution_name: body.institution_name ?? body.institution_id,
      requisition_id: requisitionId,
      status: "pending",
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, link });
  } catch (err) {
    console.error("bank connect error", err);
    return NextResponse.json({ error: "connect-failed" }, { status: 500 });
  }
}
