"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckSquare, FileText, Gift, Sparkles, Wallet } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney } from "@/lib/format";
import type { Contact, Document, Subscription, Task } from "@/lib/types";

export default function LifeAdminPage() {
  const { t, currency } = useApp();
  const supabase = useSupabase();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const load = useCallback(async () => {
    const [ts, ss, ds, cs] = await Promise.all([
      api.tasks(supabase),
      api.subscriptions(supabase),
      api.documents(supabase),
      api.contacts(supabase),
    ]);
    setTasks(ts);
    setSubs(ss);
    setDocs(ds);
    setContacts(cs);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const days = (d: string) => Math.round((new Date(d).getTime() - Date.now()) / 86400000);

  const sections = useMemo(() => {
    const overdue = tasks
      .filter((x) => x.status !== "done" && x.due_date && x.due_date < todayKey)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
    const bills = subs
      .filter((s) => s.next_billing_date && days(s.next_billing_date) >= 0 && days(s.next_billing_date) <= 7)
      .sort((a, b) => (a.next_billing_date! < b.next_billing_date! ? -1 : 1));
    const expiring = docs
      .filter((d) => d.expiry_date && days(d.expiry_date) >= 0 && days(d.expiry_date) <= 30)
      .sort((a, b) => (a.expiry_date! < b.expiry_date! ? -1 : 1));
    const toCancel = subs.filter((s) => s.to_cancel);
    const birthdays = contacts
      .filter((c) => c.birthday)
      .map((c) => {
        const b = new Date(c.birthday!);
        const next = new Date(new Date().getFullYear(), b.getMonth(), b.getDate());
        if (next < new Date(todayKey)) next.setFullYear(next.getFullYear() + 1);
        return { c, inDays: Math.round((next.getTime() - Date.now()) / 86400000) };
      })
      .filter((x) => x.inDays >= 0 && x.inDays <= 14)
      .sort((a, b) => a.inDays - b.inDays);
    return { overdue, bills, expiring, toCancel, birthdays };
  }, [tasks, subs, docs, contacts, todayKey]);

  const total = sections.overdue.length + sections.bills.length + sections.expiring.length + sections.toCancel.length + sections.birthdays.length;

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
      <PageHeader title={t.lifeadmin.title} subtitle={t.lifeadmin.subtitle} />

      <Card className="flex items-center justify-between">
        <p className="text-sm text-zinc-300">{t.lifeadmin.thisMonth}</p>
        <p className="text-2xl font-bold text-zinc-100">{total}</p>
      </Card>

      {total === 0 && (
        <Card>
          <EmptyState icon="🧹" title={t.next.empty} />
        </Card>
      )}

      {sections.overdue.length > 0 && (
        <Card>
          <CardHeader
            title={t.lifeadmin.overdueTasks}
            action={<Link href="/app/tasks" className="text-xs font-medium text-indigo-400">→</Link>}
          />
          <div className="space-y-1">
            {sections.overdue.slice(0, 6).map((x) => (
              <div key={x.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                <span className="flex items-center gap-2 text-zinc-200">
                  <CheckSquare className="h-4 w-4 text-red-400" />
                  {x.title}
                </span>
                <Badge color="red">{x.due_date}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {sections.bills.length > 0 && (
        <Card>
          <CardHeader
            title={t.lifeadmin.billsDue}
            action={<Link href="/app/subscriptions" className="text-xs font-medium text-indigo-400">→</Link>}
          />
          <div className="space-y-1">
            {sections.bills.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                <span className="flex items-center gap-2 text-zinc-200">
                  <Wallet className="h-4 w-4 text-amber-400" />
                  {s.name}
                </span>
                <span className="text-xs text-zinc-400">
                  {formatMoney(s.amount, currency)} · {s.next_billing_date}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {sections.expiring.length > 0 && (
        <Card>
          <CardHeader
            title={t.lifeadmin.expiringDocs}
            action={<Link href="/app/digital" className="text-xs font-medium text-indigo-400">→</Link>}
          />
          <div className="space-y-1">
            {sections.expiring.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                <span className="flex items-center gap-2 text-zinc-200">
                  <FileText className="h-4 w-4 text-sky-400" />
                  {d.name}
                </span>
                <Badge color={days(d.expiry_date!) <= 7 ? "red" : "amber"}>{days(d.expiry_date!)}d</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {sections.toCancel.length > 0 && (
        <Card>
          <CardHeader title={t.lifeadmin.toCancel} />
          <div className="space-y-1">
            {sections.toCancel.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                <span className="flex items-center gap-2 text-zinc-200">
                  <Sparkles className="h-4 w-4 text-zinc-400" />
                  {s.name}
                </span>
                <span className="text-xs text-zinc-400">{formatMoney(s.amount, currency)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {sections.birthdays.length > 0 && (
        <Card>
          <CardHeader
            title={t.lifeadmin.birthdays}
            action={<Link href="/app/people" className="text-xs font-medium text-indigo-400">→</Link>}
          />
          <div className="space-y-1">
            {sections.birthdays.map(({ c, inDays }) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                <span className="flex items-center gap-2 text-zinc-200">
                  <Gift className="h-4 w-4 text-pink-400" />
                  {c.name}
                </span>
                <Badge color={inDays <= 3 ? "pink" : "zinc"}>{inDays}d</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
