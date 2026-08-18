import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { appBaseUrl, storeCode } from "@/lib/google";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/app/settings?google=error", request.url));
  }

  const cookieStore = await cookies();
  const expected = cookieStore.get("google_oauth_state")?.value;
  if (!expected || expected !== state) {
    return NextResponse.redirect(new URL("/app/settings?google=state-mismatch", request.url));
  }
  cookieStore.delete("google_oauth_state");

  try {
    await storeCode(supabase, user.id, code);
    return NextResponse.redirect(new URL("/app/calendar?google=connected", request.url));
  } catch (err) {
    console.error("google callback error", err);
    return NextResponse.redirect(new URL("/app/settings?google=error", request.url));
  }
}
