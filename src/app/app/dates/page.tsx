"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, PartyPopper } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney } from "@/lib/format";
import type { Contact, Document, SavingsGoal, Subscription, Trip } from "@/lib/types";
import { cn } from "@/lib/cn";

type DateItem = {
  key: string;
  date: string; // YYYY-MM-DD
  type: "bill" | "birthday" | "expiry" | "deadline" | "trip";
  title: string;
  sub: string;
};

const TYPE_ICON: Record<DateItem["type"], string> = {
  bill: "🧾",
  birthday: "🎂",
  expiry: "📄",
  deadline: "🎯",
  trip: "✈️",
};

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Next occurrence of a MM-DD (this year, or next year if already past). */
function nextOccurrence(month: number, day: number, now = new Date()): Date {
  const thisYear = new Date(now.getFullYear(), month - 1, day, 12, 0, 0, 0);
  if (thisYear.getTime() >= now.getTime()) return thisYear;
  return new Date(now.getFullYear() + 1, month - 1, day, 12, 0, 0, 0);
}

export default function DatesPage() {
  const { t, currency } = useApp();
  const supabase = useSupabase();
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);

  const load = useCallback(async () => {
    const [s, c, d, g, tr] = await Promise.all([
      api.subscriptions(supabase),
      api.contacts(supabase),
      api.documents(supabase),
      api.goals(supabase),
      api.trips(supabase),
    ]);
    setSubs(s);
    setContacts(c);
    setDocs(d);
    setGoals(g);
    setTrips(tr);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today.getTime() + 90 * 86400000);
    const todayKey = localKey(today);
    const out: DateItem[] = [];

    for (const s of subs) {
      if (s.next_billing_date && s.next_billing_date >= todayKey && s.next_billing_date <= localKey(horizon)) {
        out.push({
          key: `bill-${s.id}`,
          date: s.next_billing_date,
          type: "bill",
          title: s.name,
          sub: `${formatMoney(s.amount, currency)} · ${t.dates.bill}`,
        });
      }
    }
    for (const c of contacts) {
      if (!c.birthday) continue;
      const [, m, d] = c.birthday.split("-").map(Number);
      if (!m || !d) continue;
      const occ = nextOccurrence(m, d);
      const k = localKey(occ);
      if (k >= todayKey && k <= localKey(horizon)) {
        out.push({
          key: `birthday-${c.id}`,
          date: k,
          type: "birthday",
          title: c.name,
          sub: t.dates.birthday,
        });
      }
    }
    for (const d of docs) {
      if (d.expiry_date && d.expiry_date >= todayKey && d.expiry_date <= localKey(horizon)) {
        out.push({
          key: `expiry-${d.id}`,
          date: d.expiry_date,
          type: "expiry",
          title: d.name,
          sub: t.dates.expiry,
        });
      }
    }
    for (const g of goals) {
      if (g.deadline && g.deadline >= todayKey && g.deadline <= localKey(horizon)) {
        out.push({
          key: `goal-${g.id}`,
          date: g.deadline,
          type: "deadline",
          title: g.name,
          sub: t.dates.deadline,
        });
      }
    }
    for (const tr of trips) {
      if (tr.start_date && tr.start_date >= todayKey && tr.start_date <= localKey(horizon)) {
        out.push({
          key: `trip-${tr.id}`,
          date: tr.start_date,
          type: "trip",
          title: tr.destination,
          sub: t.dates.trip,
        });
      }
    }

    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [subs, contacts, docs, goals, trips, t, currency]);

  const relLabel = (date: string): string => {
    const diff = Math.round(
      (new Date(`${date}T00:00:00`).getTime() - new Date(`${localKey(new Date())}T00:00:00`).getTime()) / 86400000
    );
    if (diff === 0) return t.dates.today;
    if (diff === 1) return t.dates.tomorrow;
    return t.dates.inDays.replace("{n}", String(diff));
  };

  const inPast = items.some((i) => i.date < localKey(new Date()));

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
      <PageHeader title={t.dates.title} subtitle={t.dates.subtitle} />

      {items.length === 0 && !inPast ? (
        <Card>
          <EmptyState icon="🗓️" title={t.dates.empty} />
        </Card>
      ) : (
        <Card>
          <div className="space-y-1">
            {items.map((item) => {
              const overdue = item.date < localKey(new Date());
              return (
                <div
                  key={item.key}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/4",
                    overdue && "opacity-60"
                  )}
                >
                  <span className="text-xl">{TYPE_ICON[item.type]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{item.title}</p>
                    <p className="truncate text-[11px] text-zinc-500">{item.sub}</p>
                  </div>
                  <Badge color={overdue ? "red" : item.type === "birthday" ? "pink" : item.type === "bill" ? "amber" : "blue"}>
                    {overdue ? t.dates.overdue : relLabel(item.date)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const bday = contacts.find((c) => c.birthday);
            window.location.href = bday ? "/app/people" : "/app/calendar";
          }}
        >
          <PartyPopper className="h-4 w-4" />
          {t.dates.manage}
        </Button>
        <Button variant="outline" size="sm" onClick={() => (window.location.href = "/app/lifeadmin")}>
          <CheckCircle2 className="h-4 w-4" />
          {t.dates.lifeAdmin}
        </Button>
        <Button variant="outline" size="sm" onClick={() => (window.location.href = "/app/calendar")}>
          <CalendarClock className="h-4 w-4" />
          {t.calendar.title}
        </Button>
      </div>
    </div>
  );
}
