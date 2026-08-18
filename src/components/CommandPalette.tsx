"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarPlus,
  CheckSquare,
  CornerDownLeft,
  FileText,
  Plane,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui";
import type { Dict } from "@/lib/i18n";

type Result = { type: string; title: string; sub: string; href: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const out: Result[] = [];
      const contains = (...parts: (string | null | undefined)[]) => parts.some((p) => p?.toLowerCase().includes(q));

      const [tasks, notes, events, tx, goals, people, trips, docs, subs] = await Promise.all([
        api.tasks(supabase),
        api.notes(supabase),
        api.events(supabase, "0000-01-01", "9999-12-31"),
        api.allTransactions(supabase, 200),
        api.goals(supabase),
        api.contacts(supabase),
        api.trips(supabase),
        api.documents(supabase),
        api.subscriptions(supabase),
      ]);

      if (cancelled) return;
      for (const x of tasks) if (contains(x.title, x.notes)) out.push({ type: "task", title: x.title, sub: x.due_date ?? "", href: "/app/tasks" });
      for (const x of notes) if (contains(x.title, x.content)) out.push({ type: "note", title: x.title, sub: x.content.slice(0, 60), href: "/app/notes" });
      for (const x of events) if (contains(x.title, x.description)) out.push({ type: "event", title: x.title, sub: x.start_at, href: "/app/calendar" });
      for (const x of tx) if (contains(x.description, x.merchant)) out.push({ type: "tx", title: x.description, sub: `${x.amount}€ · ${x.date}`, href: "/app/money" });
      for (const x of goals) if (contains(x.name)) out.push({ type: "goal", title: x.name, sub: `${x.current_amount}/${x.target_amount}€`, href: "/app/goals" });
      for (const x of people) if (contains(x.name)) out.push({ type: "person", title: x.name, sub: x.relationship ?? "", href: "/app/people" });
      for (const x of trips) if (contains(x.destination)) out.push({ type: "trip", title: x.destination, sub: `${x.start_date ?? ""} → ${x.end_date ?? ""}`, href: "/app/travel" });
      for (const x of docs) if (contains(x.name)) out.push({ type: "doc", title: x.name, sub: x.expiry_date ?? "", href: "/app/digital" });
      for (const x of subs) if (contains(x.name)) out.push({ type: "sub", title: x.name, sub: `${x.amount}€/${x.billing_cycle}`, href: "/app/subscriptions" });

      setResults(out.slice(0, 12));
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, supabase]);

  const QUICK_ACTIONS: { icon: typeof Wallet; href: string; label: (t: Dict) => string }[] = [
    { icon: Wallet, href: "/app/money?new=1", label: (t) => t.money.addTransaction },
    { icon: Plus, href: "/app/tasks?new=1", label: (t) => t.tasks.addTask },
    { icon: CalendarPlus, href: "/app/calendar?new=1", label: (t) => t.calendar.addEvent },
    { icon: Target, href: "/app/goals?new=1", label: (t) => t.goals.addGoal },
  ];

  const typeIcon: Record<string, typeof Search> = {
    task: CheckSquare,
    note: StickyNote,
    event: CalendarDays,
    tx: Wallet,
    goal: Target,
    person: Users,
    trip: Plane,
    doc: FileText,
    sub: Sparkles,
  };

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function submit() {
    const q = query.trim();
    if (!q) return;
    onClose();
    router.push(`/app/nova?q=${encodeURIComponent(q)}`);
  }

  const showSearch = query.trim().length >= 2;

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg" title={t.cmd.quickActions}>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
        <Search className="h-4 w-4 shrink-0 text-zinc-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t.cmd.placeholder}
          className="h-11 w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
        />
        <CornerDownLeft className="h-4 w-4 shrink-0 text-zinc-600" />
      </div>

      {showSearch && (
        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {searching && <p className="px-1 py-2 text-xs text-zinc-500">{t.common.loading}</p>}
          {!searching && results.length === 0 && (
            <p className="px-1 py-2 text-xs text-zinc-500">{t.cmd.searchResults}: 0</p>
          )}
          {results.map((r, i) => {
            const Icon = typeIcon[r.type] ?? Search;
            return (
              <button
                key={`${r.type}-${i}`}
                onClick={() => go(r.href)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-white/6 bg-white/4 px-3 py-2 text-left transition hover:bg-white/10"
              >
                <Icon className="h-4 w-4 shrink-0 text-indigo-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-zinc-200">{r.title}</p>
                  <p className="truncate text-[10px] text-zinc-500">{r.sub}</p>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-600">{r.type}</span>
              </button>
            );
          })}
        </div>
      )}

      {!showSearch && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.href}
              onClick={() => go(a.href)}
              className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-left text-xs font-medium text-zinc-300 transition hover:bg-white/10"
            >
              <a.icon className="h-4 w-4 text-indigo-400" />
              {a.label(t)}
            </button>
          ))}
          <button
            onClick={() => go("/app/nova")}
            className="col-span-2 flex items-center gap-2 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2.5 text-left text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/20"
          >
            <Sparkles className="h-4 w-4" />
            {t.cmd.askNova}
          </button>
        </div>
      )}
    </Modal>
  );
}
