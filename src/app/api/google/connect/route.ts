import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { appBaseUrl, authUrl, isGoogleConfigured } from "@/lib/google";
import crypto from "crypto";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/app/settings?google=not-configured", request.url));
  }

  const state = crypto.randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const base = appBaseUrl(request);
  return NextResponse.redirect(authUrl(base, state));
}
