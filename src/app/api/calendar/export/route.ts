import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** yyyyMMddTHHmmssZ (UTC) for timestamp values. */
function fmt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/g, "");
}

/** yyyyMMdd (local) for all-day values. */
function fmtDay(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: events, error } = await supabase
    .from("calendar_events")
    .select("id, title, description, location, start_at, end_at, all_day, calendar_name")
    .order("start_at", { ascending: true });

  if (error)
    return NextResponse.json({ error: "db-error", detail: error.message }, { status: 500 });

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LifeOS//LifeOS Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const e of events ?? []) {
    const start = new Date(e.start_at);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@lifeos`);
    lines.push(`DTSTAMP:${fmt(new Date())}`);
    if (e.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${fmtDay(start)}`);
      const end = e.end_at ? new Date(e.end_at) : new Date(start.getTime() + 24 * 3600000);
      lines.push(`DTEND;VALUE=DATE:${fmtDay(end)}`);
    } else {
      lines.push(`DTSTART:${fmt(start)}`);
      const end = e.end_at ? new Date(e.end_at) : new Date(start.getTime() + 3600000);
      lines.push(`DTEND:${fmt(end)}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lifeos-calendar.ics"',
      "Cache-Control": "no-store",
    },
  });
}
