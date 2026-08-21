import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGoCardlessConfigured } from "@/lib/gocardless";
import type { BankLink } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const configured = isGoCardlessConfigured();
  let links: BankLink[] = [];
  if (configured) {
    const { data } = await supabase
      .from("bank_links")
      .select("*")
      .order("created_at", { ascending: false });
    links = (data as BankLink[]) ?? [];
  }
  return NextResponse.json({ configured, links });
}
