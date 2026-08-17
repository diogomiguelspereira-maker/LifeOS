"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin, Pencil, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
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

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#06b6d4", "#f59e0b", "#ef4444"];

type View = "day" | "week" | "month";

const HOUR_HEIGHT = 56;

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

  useEffect(() => {
    setLoading(true);
    load();
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

  const title =
    view === "day"
      ? cursor.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })
      : view === "week"
        ? `${cursor.toLocaleDateString("pt-PT", { month: "short" })} ${cursor.getFullYear()}`
        : cursor.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

  const dayEvents = useMemo(() => {
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const k = key(new Date(ev.start_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(ev);
    }
    for (const list of map.values()) list.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    return map;
  }, [events]);

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
          <Button onClick={() => { setEditing(null); setAddOpen(true); }}>
            <CalendarPlus className="h-4 w-4" />
            {t.calendar.addEvent}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())} className="capitalize">
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

      <Card className="border-indigo-500/15 bg-indigo-500/5">
        <p className="text-xs text-indigo-300">
          🔗 {t.calendar.google}: {t.calendar.googleNotConnected}
        </p>
      </Card>

      <EventModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        event={editing}
        defaultDate={cursor}
        onSaved={() => { load(); }}
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
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <Card className="p-2 sm:p-3">
      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((w) => (
          <div key={w} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const key = d.toISOString().slice(0, 10);
          const evs = dayEvents.get(key) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              onClick={() => onSelect(d)}
              className={cn(
                "flex min-h-16 flex-col items-stretch gap-0.5 rounded-lg border p-1 text-left transition sm:min-h-20",
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
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const key = d.toISOString().slice(0, 10);
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
  const key = cursor.toISOString().slice(0, 10);
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
      setDate(base.toISOString().slice(0, 10));
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
        {ev.description && (
          <p className="whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm leading-relaxed text-zinc-300">
            {event.description}
          </p>
        )}
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
