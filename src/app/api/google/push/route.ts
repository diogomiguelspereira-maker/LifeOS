import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTokens, googlePost } from "@/lib/google";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, start_at, end_at, all_day, description, location } = (await request.json()) as {
    title: string;
    start_at: string;
    end_at?: string | null;
    all_day?: boolean;
    description?: string | null;
    location?: string | null;
  };
  if (!title || !start_at) return NextResponse.json({ error: "missing" }, { status: 400 });

  try {
    const tokens = await getTokens(supabase, user.id);
    if (!tokens) return NextResponse.json({ error: "not-connected" }, { status: 400 });

    const body: Record<string, unknown> = {
      summary: title,
      description: description ?? undefined,
      location: location ?? undefined,
      start: all_day
        ? { date: start_at.slice(0, 10) }
        : { dateTime: new Date(start_at).toISOString() },
      end: all_day
        ? { date: (end_at ? new Date(end_at) : new Date(new Date(start_at).getTime() + 86400000)).toISOString().slice(0, 10) }
        : { dateTime: new Date(end_at ?? new Date(new Date(start_at).getTime() + 3600000)).toISOString() },
    };

    const created = (await googlePost(
      tokens.access_token,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tokens.calendar_id)}/events`,
      body
    )) as { id?: string };

    return NextResponse.json({ ok: true, google_event_id: created.id ?? null });
  } catch (err) {
    console.error("google push error", err);
    return NextResponse.json({ error: "push-failed" }, { status: 500 });
  }
}
