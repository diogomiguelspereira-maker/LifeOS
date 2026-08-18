import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGoogleConfigured } from "@/lib/google";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const configured = isGoogleConfigured();
  let connected = false;
  let email: string | null = null;
  if (configured) {
    // order+limit (instead of maybeSingle) so a stray duplicate row can't hide a real connection
    const { data } = await supabase
      .from("google_tokens")
      .select("google_email, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      connected = true;
      email = (data[0].google_email as string) ?? null;
    }
  }
  return NextResponse.json({ configured, connected, email });
}
