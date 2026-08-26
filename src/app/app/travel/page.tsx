"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Progress,
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { packingList } from "@/lib/dontforget";
import type { Trip, TripItem } from "@/lib/types";
import { cn } from "@/lib/cn";

type TripView = "upcoming" | "past";

export default function TravelPage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [items, setItems] = useState<Record<string, TripItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [tripOpen, setTripOpen] = useState(false);
  const [itemOpenFor, setItemOpenFor] = useState<string | null>(null);
  const [view, setView] = useState<TripView>("upcoming");

  const load = useCallback(async () => {
    const ts = await api.trips(supabase);
    setTrips(ts);
    const map: Record<string, TripItem[]> = {};
    await Promise.all(
      ts.map(async (tr) => {
        map[tr.id] = await api.tripItems(supabase, tr.id);
      })
    );
    setItems(map);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const visible = trips.filter((tr) =>
    view === "upcoming" ? (tr.end_date ?? tr.start_date ?? "9999") >= today : (tr.end_date ?? tr.start_date ?? "") < today
  );

  const spentFor = (id: string) =>
    (items[id] ?? []).filter((i) => i.type !== "packing" && i.cost).reduce((s, i) => s + (i.cost ?? 0), 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.travel.title}
        action={
          <Button onClick={() => setTripOpen(true)}>
            <Plus className="h-4 w-4" />
            {t.travel.addTrip}
          </Button>
        }
      />

      <Segmented<TripView>
        value={view}
        onChange={setView}
        options={[
          { value: "upcoming", label: "✈️" },
          { value: "past", label: "🗂️" },
        ]}
      />

      {visible.length === 0 && (
        <Card>
          <EmptyState icon="✈️" title={t.travel.noTrips} />
        </Card>
      )}

      {visible.map((tr) => {
        const spent = spentFor(tr.id);
        const pct = tr.budget && tr.budget > 0 ? (spent / tr.budget) * 100 : 0;
        const days = tr.start_date && tr.end_date
          ? Math.max(1, Math.round((new Date(tr.end_date).getTime() - new Date(tr.start_date).getTime()) / 86400000) + 1)
          : 1;
        return (
          <Card key={tr.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-zinc-800 dark:text-zinc-100">{tr.destination}</p>
                <p className="text-xs text-zinc-500">
                  {tr.start_date ?? "—"} → {tr.end_date ?? "—"} · {days} {t.travel.days}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={tr.status === "booked" ? "blue" : tr.status === "completed" ? "green" : "zinc"}>
                  {t.travel[tr.status]}
                </Badge>
                <button
                  onClick={async () => {
                    await supabase.from("trips").delete().eq("id", tr.id);
                    load();
                  }}
                  className="rounded-lg p-1 text-zinc-600 transition hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {tr.budget != null && tr.budget > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-zinc-500">
                    {t.travel.spent}: {Math.round(spent)}€ / {tr.budget}€
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">{Math.round(pct)}%</span>
                </div>
                <Progress value={pct} color={pct > 100 ? "bg-red-500" : "bg-emerald-500"} />
              </div>
            )}

            <div className="mt-3 space-y-1">
              {(items[tr.id] ?? [])
                .filter((i) => i.type !== "packing")
                .map((i) => (
                  <div key={i.id} className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500">{i.datetime ? i.datetime.slice(0, 10) : "—"}</span>
                    <Badge color={i.type === "flight" ? "blue" : i.type === "hotel" ? "violet" : i.type === "restaurant" ? "amber" : "zinc"}>
                      {(t.travel as Record<string, string>)[i.type] ?? t.common.other}
                    </Badge>
                    <span className="text-zinc-700 dark:text-zinc-200">{i.title}</span>
                    {i.cost != null && <span className="ml-auto text-xs text-zinc-500">{i.cost}€</span>}
                    <button
                      onClick={async () => {
                        await supabase.from("trip_items").delete().eq("id", i.id);
                        load();
                      }}
                      className="rounded p-0.5 text-zinc-600 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
            </div>

            {(items[tr.id] ?? []).filter((i) => i.type === "packing").length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(items[tr.id] ?? [])
                  .filter((i) => i.type === "packing")
                  .map((i) => (
                    <button
                      key={i.id}
                      onClick={async () => {
                        await supabase.from("trip_items").update({ checked: !i.checked }).eq("id", i.id);
                        load();
                      }}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] transition",
                        i.checked
                          ? "border-emerald-600 bg-emerald-600 text-white shadow-sm line-through"
                          : "border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:bg-white/5"
                      )}
                    >
                      {i.title}
                    </button>
                  ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Select
                value={tr.status}
                onChange={async (e) => {
                  await supabase.from("trips").update({ status: e.target.value }).eq("id", tr.id);
                  load();
                }}
                className="h-8 w-auto px-2 text-xs"
              >
                <option value="planned">{t.travel.planned}</option>
                <option value="booked">{t.travel.booked}</option>
                <option value="completed">{t.travel.completed}</option>
              </Select>
              <Button size="sm" variant="secondary" onClick={() => setItemOpenFor(tr.id)}>
                <Plus className="h-3.5 w-3.5" />
                {t.travel.addItem}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={(items[tr.id] ?? []).some((i) => i.type === "packing")}
                onClick={async () => {
                  await supabase.from("trip_items").insert(
                    packingList(days).map((title) => ({ trip_id: tr.id, type: "packing", title, checked: false }))
                  );
                  load();
                }}
              >
                🎒 {t.travel.packing}
              </Button>
            </div>
          </Card>
        );
      })}

      <TripModal open={tripOpen} onClose={() => setTripOpen(false)} onSaved={load} />
      <ItemModal
        open={!!itemOpenFor}
        tripId={itemOpenFor}
        onClose={() => setItemOpenFor(null)}
        onSaved={load}
      />
    </div>
  );
}

function TripModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [budget, setBudget] = useState("");

  useEffect(() => {
    if (open) {
      setDestination("");
      setStart("");
      setEnd("");
      setBudget("");
    }
  }, [open]);

  async function save() {
    if (!destination.trim()) return;
    await supabase.from("trips").insert({
      destination: destination.trim(),
      start_date: start || null,
      end_date: end || null,
      budget: parseFloat(budget) || null,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.travel.addTrip}>
      <div className="space-y-4">
        <Field label={t.travel.destination}>
          <Input value={destination} onChange={(e) => setDestination(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.date}>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={t.common.date}>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label={`${t.travel.budget} (€)`}>
          <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        <Button className="w-full" onClick={save} disabled={!destination.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function ItemModal({
  open,
  tripId,
  onClose,
  onSaved,
}: {
  open: boolean;
  tripId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [type, setType] = useState("activity");
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (open) {
      setType("activity");
      setTitle("");
      setCost("");
      setDate("");
    }
  }, [open]);

  async function save() {
    if (!title.trim() || !tripId) return;
    await supabase.from("trip_items").insert({
      trip_id: tripId,
      type,
      title: title.trim(),
      cost: parseFloat(cost) || null,
      datetime: date ? new Date(date).toISOString() : null,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.travel.addItem}>
      <div className="space-y-4">
        <Field label={t.common.category}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="flight">{t.travel.flight}</option>
            <option value="hotel">{t.travel.hotel}</option>
            <option value="activity">{t.travel.activity}</option>
            <option value="restaurant">{t.travel.restaurant}</option>
            <option value="packing">{t.travel.packing}</option>
            <option value="other">{t.common.other}</option>
          </Select>
        </Field>
        <Field label={t.common.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t.travel.budget} (€)`}>
            <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label={t.common.date}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Button className="w-full" onClick={save} disabled={!title.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
