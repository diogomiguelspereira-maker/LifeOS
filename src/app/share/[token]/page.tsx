"use client";

import { use, useEffect, useState } from "react";
import { CalendarDays, Clock, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { pt, en, es, fr, type Dict } from "@/lib/i18n";
import type { SharedCalendarEvent } from "@/lib/types";
import { cn } from "@/lib/cn";

type Status = "loading" | "invalid" | "error" | "empty" | "ok";

function pickLang(): Dict {
  try {
    const l = (navigator.language || "pt").toLowerCase();
    if (l.startsWith("en")) return en;
    if (l.startsWith("es")) return es;
    if (l.startsWith("fr")) return fr;
  } catch {
    /* fall through to pt */
  }
  return pt;
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [status, setStatus] = useState<Status>("loading");
  const [events, setEvents] = useState<SharedCalendarEvent[]>([]);
  const [t] = useState<Dict>(() => pickLang());

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_shared_calendar", { p_token: token });
        if (cancelled) return;
        if (error) {
          setStatus(error.code === "P0001" ? "invalid" : "error");
          return;
        }
        const rows = (data as SharedCalendarEvent[] | null) ?? [];
        if (rows.length === 0) {
          setStatus("empty");
          return;
        }
        setEvents(rows);
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function downloadIcs() {
    const esc = (s: string) =>
      s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/g, "");
    const fmtDay = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//LifeOS//Shared Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];
    for (const ev of events) {
      const start = new Date(ev.start_at);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${ev.id}@lifeos-share`);
      lines.push(`DTSTAMP:${fmt(new Date())}`);
      if (ev.all_day) {
        lines.push(`DTSTART;VALUE=DATE:${fmtDay(start)}`);
        const end = ev.end_at ? new Date(ev.end_at) : new Date(start.getTime() + 24 * 3600000);
        lines.push(`DTEND;VALUE=DATE:${fmtDay(end)}`);
      } else {
        lines.push(`DTSTART:${fmt(start)}`);
        const end = ev.end_at ? new Date(ev.end_at) : new Date(start.getTime() + 3600000);
        lines.push(`DTEND:${fmt(end)}`);
      }
      lines.push(`SUMMARY:${esc(ev.title)}`);
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agenda-partilhada.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  // group by local day
  const byDay = new Map<string, SharedCalendarEvent[]>();
  for (const ev of events) {
    const k = localDayKey(new Date(ev.start_at));
    const list = byDay.get(k) ?? [];
    list.push(ev);
    byDay.set(k, list);
  }
  const days = [...byDay.entries()];

  const first = events[0];
  const ownerName = first?.owner_name ?? first?.owner_email ?? null;
  const shareLabel = first?.share_label ?? null;
  const isUnlimited = first?.is_unlimited ?? false;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8 sm:py-12">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 text-white">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-zinc-800 dark:text-zinc-100">
            {shareLabel || `${t.calendar.shareAgendaOf} ${ownerName ?? "LifeOS"}`}
          </h1>
          {shareLabel && ownerName && (
            <p className="truncate text-xs text-zinc-500">
              {t.calendar.shareAgendaOf} {ownerName}
            </p>
          )}
        </div>
      </header>

      {status === "loading" && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="skeleton h-3 w-40 rounded-full" />
          <div className="skeleton h-3 w-56 rounded-full" />
          <p className="mt-2 text-xs text-zinc-500">{t.calendar.shareLoading}</p>
        </div>
      )}

      {status === "invalid" && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white/[0.04] px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
            <Lock className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-zinc-700 dark:text-zinc-200">{t.calendar.shareUnavailableTitle}</p>
          <p className="max-w-sm text-sm text-zinc-500">{t.calendar.shareUnavailable}</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white/[0.04] px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
            <Lock className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-zinc-700 dark:text-zinc-200">{t.common.error}</p>
          <p className="max-w-sm text-sm text-zinc-500">{t.calendar.shareLoadFailed}</p>
        </div>
      )}

      {status === "empty" && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white/[0.04] px-6 py-16 text-center">
          <p className="text-base font-semibold text-zinc-700 dark:text-zinc-200">{t.calendar.shareNoEvents}</p>
        </div>
      )}

      {status === "ok" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {isUnlimited ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-[11px] text-emerald-600 dark:text-emerald-300">
                🔓 {t.calendar.shareUnlimitedNote}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-300">
                🔒 {t.calendar.shareOneTimeNote}
              </div>
            )}
            <button
              onClick={downloadIcs}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 py-1.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 transition hover:bg-white/10"
            >
              📥 {t.calendar.shareDownloadIcs}
            </button>
          </div>

          {days.map(([key, list]) => {
            const d = new Date(`${key}T00:00:00`);
            const todayKey = localDayKey(new Date());
            return (
              <section key={key} className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/[0.04] p-4">
                <h2
                  className={cn(
                    "mb-3 text-xs font-semibold uppercase tracking-wider",
                    key === todayKey ? "text-indigo-400" : "text-zinc-500 dark:text-zinc-400"
                  )}
                >
                  {d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                  {key === todayKey && " · " + t.common.today}
                </h2>
                <ul className="space-y-2">
                  {list.map((ev) => (
                    <li key={ev.id} className="flex items-start gap-3">
                      <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ background: ev.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{ev.title}</p>
                          <span className="flex items-center gap-1 text-[11px] tabular-nums text-zinc-500">
                            <Clock className="h-3 w-3" />
                            {ev.all_day
                              ? t.calendar.allDay
                              : `${fmtTime(new Date(ev.start_at))}${ev.end_at ? `–${fmtTime(new Date(ev.end_at))}` : ""}`}
                          </span>
                        </div>

                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <footer className="mt-8 text-center text-[11px] text-zinc-600">
        Partilhado via <span className="font-semibold text-zinc-500">LifeOS</span> 🧠
      </footer>
    </main>
  );
}
