import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAccountTransactions,
  isGoCardlessConfigured,
  mapGcTransaction,
} from "@/lib/gocardless";
import type { BankLink } from "@/lib/types";

export const runtime = "nodejs";

const CHUNK = 500;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isGoCardlessConfigured())
    return NextResponse.json({ error: "not-configured" }, { status: 400 });

  const body = (await request.json()) as { link_id?: string };
  let q = supabase.from("bank_links").select("*").eq("user_id", user.id);
  if (body.link_id) q = q.eq("id", body.link_id);
  const { data: links } = await q;
  const bankLinks = ((links as BankLink[] | null) ?? []).filter((l) => l.status === "linked");

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const link of bankLinks) {
    for (const account of link.accounts) {
      try {
        const { transactions } = await getAccountTransactions(account.id);
        const rows = [...transactions.booked, ...transactions.pending]
          .map((tx) => mapGcTransaction(account.id, tx))
          .filter((r) => r.external_id && r.amount !== 0);

        // dedup against what's already imported
        const externalIds = rows.map((r) => r.external_id);
        const have = new Set<string>();
        for (let i = 0; i < externalIds.length; i += CHUNK) {
          const { data: existing } = await supabase
            .from("transactions")
            .select("external_id")
            .eq("user_id", user.id)
            .in("external_id", externalIds.slice(i, i + CHUNK));
          for (const e of (existing as { external_id: string }[] | null) ?? []) {
            if (e.external_id) have.add(e.external_id);
          }
        }
        const fresh = rows.filter((r) => !have.has(r.external_id));
        skipped += rows.length - fresh.length;

        if (fresh.length > 0) {
          const { error } = await supabase.from("transactions").insert(
            fresh.map((r) => ({
              user_id: user.id,
              account_id: link.lifeos_account_id ?? null,
              amount: r.amount,
              description: r.description,
              merchant: r.merchant,
              date: r.date,
              external_id: r.external_id,
            }))
          );
          if (error) throw error;
          created += fresh.length;
        }
      } catch (err) {
        console.error("bank sync error", err);
        errors.push(link.institution_name);
      }
    }
  }

  return NextResponse.json({ ok: true, created, skipped, errors });
}
