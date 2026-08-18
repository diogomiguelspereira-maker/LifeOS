import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTokens, googleGet, mapGoogleEvent, type GCalEvent } from "@/lib/google";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const tokens = await getTokens(supabase, user.id);
    if (!tokens) return NextResponse.json({ error: "not-connected" }, { status: 400 });

    const timeMin = new Date(Date.now() - 7 * 86400000).toISOString();
    const timeMax = new Date(Date.now() + 60 * 86400000).toISOString();
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "500",
    });
    const data = (await googleGet(
      tokens.access_token,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tokens.calendar_id)}/events?${params}`
    )) as { items?: GCalEvent[] };

    const remote = new Map<string, GCalEvent>((data.items ?? []).map((e) => [e.id, e]));
    const ids = [...remote.keys()];

    // Fetch existing google-sourced events in the same window
    const { data: existing } = await supabase
      .from("calendar_events")
      .select("id, google_event_id, start_at")
      .eq("source", "google")
      .gte("start_at", timeMin)
      .lte("start_at", timeMax);

    const existingByGoogle = new Map((existing as { id: string; google_event_id: string | null; start_at: string }[] ?? []).map((e) => [e.google_event_id, e.id]));

    // Upsert remote events
    let created = 0;
    let updated = 0;
    for (const gid of ids) {
      const ev = remote.get(gid)!;
      const mapped = mapGoogleEvent(ev);
      const localId = existingByGoogle.get(gid);
      if (localId) {
        await supabase.from("calendar_events").update(mapped).eq("id", localId);
        updated++;
      } else {
        await supabase.from("calendar_events").insert(mapped);
        created++;
      }
    }

    // Remove local google events that disappeared from Google in the window
    let removed = 0;
    for (const e of existing as { id: string; google_event_id: string | null }[] ?? []) {
      if (e.google_event_id && !remote.has(e.google_event_id)) {
        await supabase.from("calendar_events").delete().eq("id", e.id);
        removed++;
      }
    }

    return NextResponse.json({ ok: true, created, updated, removed });
  } catch (err) {
    console.error("google sync error", err);
    return NextResponse.json({ error: "sync-failed" }, { status: 500 });
  }
}
