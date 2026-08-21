import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccountDetails, getRequisition } from "@/lib/gocardless";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const ref = new URL(request.url).searchParams.get("ref") ?? "";

  // load the pending link this requisition belongs to (must be the current user's)
  const { data: link } = await supabase
    .from("bank_links")
    .select("id")
    .eq("requisition_id", ref)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) return NextResponse.redirect(new URL("/app/settings?bank=error", request.url));

  try {
    const requisition = await getRequisition(ref);
    if (requisition.status !== "LN" && requisition.status !== "GA") {
      return NextResponse.redirect(new URL("/app/settings?bank=error", request.url));
    }
    const accounts = [];
    for (const accountId of requisition.accounts) {
      const details = await getAccountDetails(accountId);
      accounts.push({
        id: accountId,
        iban: details.account.iban ?? null,
        currency: details.account.currency ?? null,
        owner: details.account.ownerName ?? null,
      });
    }
    await supabase
      .from("bank_links")
      .update({ status: "linked", accounts })
      .eq("id", link.id);
    return NextResponse.redirect(new URL("/app/settings?bank=connected", request.url));
  } catch (err) {
    console.error("bank callback error", err);
    await supabase.from("bank_links").update({ status: "failed" }).eq("id", link.id);
    return NextResponse.redirect(new URL("/app/settings?bank=error", request.url));
  }
}
