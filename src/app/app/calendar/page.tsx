"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, ClipboardPaste, MapPin, Pencil, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import { dontForgetHints } from "@/lib/dontforget";
import { parseScheduleText, SCHEDULE_EXAMPLE } from "@/lib/schedule-import";
import { SWATCHES as COLORS } from "@/lib/colors";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Skeleton,
  Switch,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import type { CalendarEvent } from "@/lib/types";
import { cn } from "@/lib/cn";

type View = "day" | "week" | "month";

const HOUR_HEIGHT = 56;

function fmtMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Local YYYY-MM-DD key. Using toISOString() here shifts days in UTC± timezones. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Relative day label: Hoje / Amanhã / Ontem (null for other days). */
function relDayLabel(d: Date, today: string, tomorrow: string, yesterday: string): string | null {
  const k = localDayKey(d);
  const t = localDayKey(new Date());
  if (k === t) return today;
  const diff = Math.round((new Date(`${t}T00:00:00`).getTime() - new Date(`${k}T00:00:00`).getTime()) / 86400000);
  if (diff === 1) return yesterday;
  if (diff === -1) return tomorrow;
  return null;
}

function CalendarPageInner() {
  const { t } = useApp();
  const supabase = useSupabase();
  const params = useSearchParams();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [details, setDetails] = useState<CalendarEvent | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [google, setGoogle] = useState<{ configured: boolean; connected: boolean; email: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const range = useMemo(() => {
    const start = new Date(cursor);
    if (view === "month") {
      start.setDate(1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    if (view === "week") {
      const day = start.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + diff);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [cursor, view]);

  const load = useCallback(async () => {
    const { start, end } = range;
    setEvents(await api.events(supabase, start, end));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, range]);

  const syncGoogle = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/google/sync", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; created?: number; updated?: number; removed?: number; error?: string };
      if (data.ok) {
        setSyncMsg(`✓ ${data.created ?? 0} novos · ${data.updated ?? 0} atualizados`);
        load();
      } else if (data.error === "not-connected") {
        setSyncMsg(null);
      } else {
        setSyncMsg(t.settings.googleSyncFailed);
      }
    } catch {
      setSyncMsg(t.settings.googleSyncFailed);
    }
    setSyncing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    setLoading(true);
    load();
    fetch("/api/google/status")
      .then((r) => r.json())
      .then((d) => {
        setGoogle(d);
        if (d?.connected) syncGoogle();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (params.get("new") === "1") setAddOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shift(dir: number) {
    const d = new Date(cursor);
    if (view === "day") d.setDate(d.getDate() + dir);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    setCursor(d);
  }

  const relLabel = view === "day" ? relDayLabel(cursor, t.common.today, t.common.tomorrow, t.common.yesterday) : null;
  const title =
    view === "day"
      ? `${relLabel ? `${relLabel} · ` : ""}${cursor.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}`
      : view === "week"
        ? `${cursor.toLocaleDateString("pt-PT", { month: "short" })} ${cursor.getFullYear()}`
        : cursor.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

  const dayEvents = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const k = localDayKey(new Date(ev.start_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(ev);
    }
    for (const list of map.values()) list.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    return map;
  }, [events]);

  // conflict detection: overlapping non-all-day events
  const conflicts = useMemo(() => {
    const out: { a: CalendarEvent; b: CalendarEvent }[] = [];
    for (const list of dayEvents.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const x = list[i];
          const y = list[j];
          if (x.all_day || y.all_day) continue;
          const xs = new Date(x.start_at).getTime();
          const xe = x.end_at ? new Date(x.end_at).getTime() : xs + 3600000;
          const ys = new Date(y.start_at).getTime();
          const ye = y.end_at ? new Date(y.end_at).getTime() : ys + 3600000;
          if (xs < ye && ys < xe) out.push({ a: x, b: y });
        }
      }
    }
    return out;
  }, [dayEvents]);

  // free-time detection (current day, 8h-22h)
  const freeTime = useMemo(() => {
    const key = localDayKey(cursor);
    const list = (dayEvents.get(key) ?? []).filter((e) => !e.all_day);
    const busy: [number, number][] = list.map((e) => {
      const s = new Date(e.start_at);
      const en = e.end_at ? new Date(e.end_at) : new Date(s.getTime() + 3600000);
      return [s.getHours() * 60 + s.getMinutes(), en.getHours() * 60 + en.getMinutes()];
    });
    busy.sort((a, b) => a[0] - b[0]);
    const free: { start: string; end: string }[] = [];
    let cur = 8 * 60;
    for (const [s, e] of busy) {
      if (s > cur) free.push({ start: fmtMin(cur), end: fmtMin(s) });
      cur = Math.max(cur, e);
    }
    if (cur < 22 * 60) free.push({ start: fmtMin(cur), end: fmtMin(22 * 60) });
    return free.slice(0, 3);
  }, [dayEvents, cursor]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-14" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.calendar.title}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <ClipboardPaste className="h-4 w-4" />
              {t.calendar.importSchedule}
            </Button>
            <Button onClick={() => { setEditing(null); setAddOpen(true); }}>
              <CalendarPlus className="h-4 w-4" />
              {t.calendar.addEvent}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })} className="capitalize">
            {t.common.today}
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-1 text-sm font-semibold capitalize text-zinc-200">{title}</span>
        </div>
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "day", label: t.calendar.day },
            { value: "week", label: t.calendar.week },
            { value: "month", label: t.calendar.month },
          ]}
        />
      </div>

      {view === "month" && (
        <MonthGrid cursor={cursor} dayEvents={dayEvents} onSelect={(d) => { setCursor(d); setView("day"); }} onEvent={setDetails} onSlot={(d) => { setEditing(null); setAddOpen(true); }} />
      )}
      {view === "week" && <WeekView cursor={cursor} dayEvents={dayEvents} onEvent={setDetails} />}
      {view === "day" && <DayView cursor={cursor} dayEvents={dayEvents} onEvent={setDetails} />}

      {conflicts.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-semibold text-amber-400">⚠️ {conflicts.length} conflito(s) no calendário</p>
          <div className="mt-2 space-y-1">
            {conflicts.slice(0, 3).map((c, i) => (
              <p key={i} className="text-xs text-zinc-400">
                {c.a.title} ↔ {c.b.title} — {new Date(c.a.start_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
              </p>
            ))}
          </div>
        </Card>
      )}

      {view === "day" && freeTime.length > 0 && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <p className="text-sm font-semibold text-emerald-400">🕐 Tempo livre hoje</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {freeTime.map((f, i) => (
              <span key={i} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                {f.start}–{f.end}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="border-indigo-500/15 bg-indigo-500/5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-indigo-300">
            🔗 {t.calendar.google}:{" "}
            {!google ? (
              "…"
            ) : google.connected ? (
              <span className="text-emerald-400">✓ {google.email ?? t.settings.googleConnected}</span>
            ) : google.configured ? (
              t.settings.googleNotConnected
            ) : (
              t.calendar.googleNotConnected
            )}
          </p>
          <div className="flex items-center gap-2">
            {syncMsg && <span className="text-[11px] text-emerald-400">{syncMsg}</span>}
            {google?.connected && (
              <Button variant="outline" size="sm" disabled={syncing} onClick={syncGoogle}>
                {syncing ? t.common.loading : t.settings.googleSync}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <EventModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        event={editing}
        defaultDate={cursor}
        onSaved={() => { load(); }}
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        fallbackDate={cursor}
        onImported={() => { load(); }}
      />
      <EventDetailsModal
        event={details}
        onClose={() => setDetails(null)}
        onEdit={(ev) => { setDetails(null); setEditing(ev); setAddOpen(true); }}
        onDeleted={() => { setDetails(null); load(); }}
      />
    </div>
  );
}

/* ---------- Month ---------- */
function MonthGrid({
  cursor,
  dayEvents,
  onSelect,
  onEvent,
  onSlot,
}: {
  cursor: Date;
  dayEvents: Map<string, CalendarEvent[]>;
  onSelect: (d: Date) => void;
  onEvent: (e: CalendarEvent) => void;
  onSlot: (d: Date) => void;
}) {
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    const diff = start.getDay() === 0 ? -6 : 1 - start.getDay();
    start.setDate(start.getDate() + diff);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return out;
  }, [cursor]);

  const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const todayKey = localDayKey(new Date());

  return (
    <Card className="p-2 sm:p-3">
      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((w) => (
          <div key={w} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const key = localDayKey(d);
          const evs = dayEvents.get(key) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              onClick={() => onSelect(d)}
              className={cn(
                "flex min-h-12 flex-col items-stretch gap-0.5 rounded-lg border p-1 text-left transition sm:min-h-20",
                inMonth ? "border-white/5 bg-white/3 hover:bg-white/8" : "border-transparent bg-transparent opacity-40"
              )}
            >
              <span
                className={cn(
                  "mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium",
                  isToday ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white" : "text-zinc-400"
                )}
              >
                {d.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {evs.slice(0, 3).map((ev) => (
                  <span
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEvent(ev); }}
                    className="truncate rounded px-1 py-0.5 text-[9px] font-medium text-white sm:text-[10px]"
                    style={{ background: ev.color }}
                  >
                    {!ev.all_day && `${new Date(ev.start_at).getHours()}:${String(new Date(ev.start_at).getMinutes()).padStart(2, "0")} `}
                    {ev.title}
                  </span>
                ))}
                {evs.length > 3 && (
                  <span className="px-1 text-[9px] text-zinc-500">+{evs.length - 3}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- Week ---------- */
function WeekView({
  cursor,
  dayEvents,
  onEvent,
}: {
  cursor: Date;
  dayEvents: Map<string, CalendarEvent[]>;
  onEvent: (e: CalendarEvent) => void;
}) {
  const days = useMemo(() => {
    const start = new Date(cursor);
    const diff = start.getDay() === 0 ? -6 : 1 - start.getDay();
    start.setDate(start.getDate() + diff);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor]);
  const todayKey = localDayKey(new Date());

  // On phones 7 fixed columns are ~40px each (unreadable and cramped). Make the
  // strip horizontally scrollable with readable columns instead of breaking the page.
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="grid min-w-[540px] grid-cols-7 gap-2">
        {days.map((d) => {
          const key = localDayKey(d);
          const evs = dayEvents.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <Card key={key} className={cn("p-2", isToday && "border-indigo-500/40")}>
              <p className={cn("mb-2 text-center text-xs font-semibold capitalize", isToday ? "text-indigo-400" : "text-zinc-400")}>
                {d.toLocaleDateString("pt-PT", { weekday: "short" })}
                <span className="ml-1 text-zinc-500">{d.getDate()}</span>
              </p>
              <div className="space-y-1.5">
                {evs.length === 0 && <p className="py-4 text-center text-[10px] text-zinc-600">—</p>}
                {evs.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => onEvent(ev)}
                    className="w-full truncate rounded-lg px-2 py-1.5 text-left text-[10px] font-medium text-white transition hover:opacity-80"
                    style={{ background: ev.color }}
                  >
                    {!ev.all_day && `${new Date(ev.start_at).getHours()}:${String(new Date(ev.start_at).getMinutes()).padStart(2, "0")} `}
                    {ev.title}
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Day ---------- */
function DayView({
  cursor,
  dayEvents,
  onEvent,
}: {
  cursor: Date;
  dayEvents: Map<string, CalendarEvent[]>;
  onEvent: (e: CalendarEvent) => void;
}) {
  const key = localDayKey(cursor);
  const evs = dayEvents.get(key) ?? [];

  return (
    <Card className="p-3">
      <div className="relative">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex h-14 items-start gap-2 border-t border-white/5">
            <span className="w-10 pt-1 text-right text-[10px] tabular-nums text-zinc-500">
              {h.toString().padStart(2, "0")}:00
            </span>
            <div className="flex-1" />
          </div>
        ))}
        {evs.map((ev) => {
          if (ev.all_day) {
            return (
              <button
                key={ev.id}
                onClick={() => onEvent(ev)}
                className="absolute inset-x-12 top-1 truncate rounded-lg px-2 py-1.5 text-xs font-medium text-white transition hover:opacity-80"
                style={{ background: ev.color }}
              >
                {ev.title} · dia inteiro
              </button>
            );
          }
          const start = new Date(ev.start_at);
          const end = ev.end_at ? new Date(ev.end_at) : new Date(start.getTime() + 60 * 60000);
          const top = (start.getHours() * 60 + start.getMinutes()) * (HOUR_HEIGHT / 60) + 2;
          const height = Math.max(28, ((end.getTime() - start.getTime()) / 60000) * (HOUR_HEIGHT / 60) - 2);
          return (
            <button
              key={ev.id}
              onClick={() => onEvent(ev)}
              className="absolute inset-x-12 overflow-hidden rounded-lg px-2 py-1 text-left text-[11px] font-medium text-white transition hover:opacity-80"
              style={{ background: ev.color, top, height }}
            >
              <p className="truncate">{ev.title}</p>
              <p className="truncate text-[9px] opacity-80">
                {start.getHours()}:{String(start.getMinutes()).padStart(2, "0")}–
                {end.getHours()}:{String(end.getMinutes()).padStart(2, "0")}
              </p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- Modals ---------- */
function ImportModal({
  open,
  onClose,
  fallbackDate,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  fallbackDate: Date;
  onImported: () => void;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [text, setText] = useState(SCHEDULE_EXAMPLE);
  const [defaultTitle, setDefaultTitle] = useState("Trabalho");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const parsed = useMemo(
    () => parseScheduleText(text, fallbackDate.getFullYear(), fallbackDate.getMonth() + 1),
    [text, fallbackDate]
  );

  const preview = useMemo(
    () => parsed.slots.map((s) => ({ ...s, title: s.title || defaultTitle.trim() || "—" })),
    [parsed, defaultTitle]
  );

  async function addAll() {
    const slots = parsed.slots.map((s) => ({ ...s, title: s.title || defaultTitle.trim() }));
    if (slots.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const events = slots.map((s) => {
        const [y, m, d] = s.date.split("-").map(Number);
        const startAt = s.start
          ? new Date(y, m - 1, d, ...s.start.split(":").map(Number))
          : new Date(y, m - 1, d, 0, 0, 0, 0);
        const endAt = s.end ? new Date(y, m - 1, d, ...s.end.split(":").map(Number)) : null;
        return {
          key: `${s.date}|${s.title}`,
          title: s.title,
          startAt,
          endAt,
          allDay: !s.start,
          color: "#6366f1",
        };
      });
      const min = events.reduce<Date>((a, b) => (b.startAt < a ? b.startAt : a), events[0].startAt);
      const max = events.reduce<Date>((a, b) => (b.startAt > a ? b.startAt : a), events[0].startAt);
      min.setDate(min.getDate() - 1);
      max.setDate(max.getDate() + 1);
      // skip entries that already exist on the same day with the same title
      const { data: existing } = await supabase
        .from("calendar_events")
        .select("id, title, start_at")
        .gte("start_at", min.toISOString())
        .lte("start_at", max.toISOString());
      const have = new Set(
        ((existing as { title: string; start_at: string }[] | null) ?? []).map(
          (e) => `${localDayKey(new Date(e.start_at))}|${e.title}`
        )
      );
      const fresh = events.filter((e) => !have.has(e.key));
      if (fresh.length === 0) {
        setMsg(t.calendar.importDone);
      } else {
        const { error } = await supabase.from("calendar_events").insert(
          fresh.map((s) => ({
            title: s.title,
            start_at: s.startAt.toISOString(),
            end_at: s.endAt ? s.endAt.toISOString() : null,
            all_day: s.allDay,
            color: s.color,
          }))
        );
        if (error) throw error;
        setMsg(`${t.calendar.importDone} +${fresh.length}`);
        onImported();
      }
    } catch {
      setMsg(t.calendar.importFailed);
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={t.calendar.importModal} maxWidth="max-w-lg">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-zinc-400">{t.calendar.importPasteHint}</p>
        <Field label={t.calendar.importTitle}>
          <Input value={defaultTitle} onChange={(e) => setDefaultTitle(e.target.value)} />
        </Field>
        <Field label={`${t.calendar.importSchedule} — Data | Dia | Horário`}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="font-mono text-xs" />
        </Field>
        <div className="rounded-xl bg-white/5 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {t.calendar.importPreview}
            {parsed.month ? ` · ${parsed.month.year}-${String(parsed.month.month).padStart(2, "0")}` : ""}
          </p>
          {preview.length === 0 ? (
            <p className="text-xs text-zinc-500">{t.calendar.importNone}</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {preview.slice(0, 60).map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="shrink-0 tabular-nums text-zinc-400">{s.date}</span>
                  <span className="flex-1 truncate text-zinc-200">{s.title}</span>
                  <span className="shrink-0 tabular-nums text-zinc-500">
                    {s.start ? `${s.start}–${s.end}` : t.calendar.allDay}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {parsed.skipped > 0 && (
            <p className="mt-2 text-[11px] text-amber-400">
              ⚠ {parsed.skipped} {t.calendar.importSkipped}
            </p>
          )}
          {msg && <p className="mt-2 text-[11px] text-emerald-400">{msg}</p>}
        </div>
        <Button className="w-full" onClick={addAll} disabled={busy || preview.length === 0}>
          {busy ? t.common.loading : t.calendar.importAddAll}
        </Button>
      </div>
    </Modal>
  );
}

function EventModal({
  open,
  onClose,
  event,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  event: CalendarEvent | null;
  defaultDate: Date;
  onSaved: () => void;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      const base = event ? new Date(event.start_at) : defaultDate;
      setTitle(event?.title ?? "");
      setDate(localDayKey(base));
      setStart(event ? `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}` : "09:00");
      const endD = event?.end_at ? new Date(event.end_at) : new Date(base.getTime() + 3600000);
      setEnd(`${String(endD.getHours()).padStart(2, "0")}:${String(endD.getMinutes()).padStart(2, "0")}`);
      setAllDay(event?.all_day ?? false);
      setColor(event?.color ?? COLORS[0]);
      setLocation(event?.location ?? "");
      setDescription(event?.description ?? "");
    }
  }, [open, event, defaultDate]);

  async function save() {
    if (!title.trim()) return;
    const startAt = new Date(`${date}T${start || "09:00"}`);
    const endAt = new Date(`${date}T${end || start || "10:00"}`);
    const payload = {
      title: title.trim(),
      start_at: startAt.toISOString(),
      end_at: allDay ? null : endAt.toISOString(),
      all_day: allDay,
      color,
      location: location || null,
      description: description || null,
    };
    if (event) {
      await supabase.from("calendar_events").update(payload).eq("id", event.id);
    } else {
      await supabase.from("calendar_events").insert(payload);
    }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={event ? t.common.edit : t.calendar.addEvent}>
      <div className="space-y-4">
        <Field label={t.common.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ginásio, jantar…" autoFocus />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t.common.date}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t.common.time}>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={allDay} />
          </Field>
          <Field label="—">
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={allDay} />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5">
          <span className="text-sm text-zinc-300">{t.calendar.allDay}</span>
          <Switch checked={allDay} onChange={setAllDay} />
        </div>
        <Field label={t.calendar.location}>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Casa, escritório…" />
        </Field>
        <Field label={t.common.description}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
        <Field label={t.common.color}>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn("h-8 w-8 rounded-full transition", color === c && "ring-2 ring-white ring-offset-2 ring-offset-zinc-950")}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <Button className="w-full" onClick={save} disabled={!title.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function EventDetailsModal({
  event,
  onClose,
  onEdit,
  onDeleted,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (e: CalendarEvent) => void;
  onDeleted: () => void;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  if (!event) return null;
  const ev = event;

  const start = new Date(ev.start_at);

  async function remove() {
    await supabase.from("calendar_events").delete().eq("id", ev.id);
    onDeleted();
  }

  return (
    <Modal open={!!ev} onClose={onClose} title={ev.title}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl px-0 text-sm text-zinc-300">
          <span className="h-3 w-3 rounded-full" style={{ background: ev.color }} />
          <span className="capitalize">
            {start.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}
          </span>
          {!ev.all_day && (
            <span>
              · {start.getHours()}:{String(start.getMinutes()).padStart(2, "0")}
              {ev.end_at &&
                ` – ${new Date(ev.end_at).getHours()}:${String(new Date(ev.end_at).getMinutes()).padStart(2, "0")}`}
            </span>
          )}
        </div>
        {ev.location && (
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <MapPin className="h-4 w-4" /> {ev.location}
          </p>
        )}
        {ev.source === "google" && (
          <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
            🔗 {t.calendar.google} · {t.settings.googleConnected}
          </div>
        )}
        {ev.description && !ev.description.startsWith("🎂:") && (
          <p className="whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm leading-relaxed text-zinc-300">
            {event.description}
          </p>
        )}
        {(() => {
          const hints = dontForgetHints(ev.title, ev.location);
          return hints.length ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">🧳 Não te esqueças</p>
              <ul className="mt-1.5 space-y-1">
                {hints.map((h, i) => (
                  <li key={i} className="text-xs text-zinc-300">
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          ) : null;
        })()}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => onEdit(ev)}>
            <Pencil className="h-4 w-4" />
            {t.common.edit}
          </Button>
          <Button variant="danger" className="flex-1" onClick={remove}>
            <Trash2 className="h-4 w-4" />
            {t.common.delete}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[480px]" />
        </div>
      }
    >
      <CalendarPageInner />
    </Suspense>
  );
}
