import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGoCardlessConfigured, listInstitutions } from "@/lib/gocardless";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isGoCardlessConfigured())
    return NextResponse.json({ error: "not-configured" }, { status: 400 });

  const country = (new URL(request.url).searchParams.get("country") || "pt").toLowerCase();
  try {
    const institutions = await listInstitutions(country);
    return NextResponse.json({
      institutions: institutions
        .filter((i) => i.countries.includes(country.toUpperCase()))
        .map((i) => ({ id: i.id, name: i.name, logo: i.logo ?? null })),
    });
  } catch (err) {
    console.error("bank institutions error", err);
    return NextResponse.json({ error: "institutions-failed" }, { status: 500 });
  }
}
