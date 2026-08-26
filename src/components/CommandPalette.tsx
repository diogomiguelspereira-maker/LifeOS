"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { parseCapture, type Capture } from "@/lib/parse";
import { Modal } from "@/components/ui";
import type { Dict } from "@/lib/i18n";

type Result = { type: string; title: string; sub: string; href: string };

const CAPTURE_LABEL: Record<string, string> = {
  expense: "💸",
  income: "💰",
  task: "✅",
  event: "📅",
  goal: "🎯",
  trip: "✈️",
  reminder: "⏰",
  unknown: "❓",
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTypeFilter("all");
      setSaved(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const capture: Capture | null = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return null;
    const parsed = parseCapture(q);
    return parsed.kind === "unknown" ? null : parsed;
  }, [query]);

  useEffect(() => {
    if (!open || capture) return;
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

      const filtered = typeFilter === "all" ? out : out.filter((r) => r.type === typeFilter);
      setResults(filtered.slice(0, 12));
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, supabase, capture, typeFilter]);

  const saveCapture = useCallback(async () => {
    if (!capture || saving) return;
    setSaving(true);
    try {
      if (capture.kind === "expense" || capture.kind === "income") {
        const amount = (capture.kind === "expense" ? -1 : 1) * Math.abs(capture.amount ?? 0);
        const type = capture.kind === "expense" ? "expense" : "income";
        let categoryId: string | null = null;
        if (capture.category) {
          const { data: cats } = await supabase.from("categories").select("*").eq("name", capture.category).eq("type", type).limit(1);
          if (cats?.length) categoryId = cats[0].id;
        }
        const { data: accs } = await supabase.from("accounts").select("*").limit(1);
        const acc = accs?.[0] ?? null;
        await supabase.from("transactions").insert({
          amount,
          description: capture.title,
          category_id: categoryId,
          account_id: acc?.id ?? null,
          date: new Date().toISOString().slice(0, 10),
        });
        if (acc) {
          await supabase.from("accounts").update({ balance: (acc.balance ?? 0) + amount }).eq("id", acc.id);
        }
      } else if (capture.kind === "task" || capture.kind === "reminder") {
        await supabase.from("tasks").insert({ title: capture.title, due_date: capture.due_date ?? null });
      } else if (capture.kind === "event") {
        const start = capture.start_at ? new Date(capture.start_at) : new Date(Date.now() + 3600000);
        await supabase.from("calendar_events").insert({
          title: capture.title,
          start_at: start.toISOString(),
          end_at: new Date(start.getTime() + 3600000).toISOString(),
        });
      } else if (capture.kind === "goal") {
        await supabase.from("savings_goals").insert({
          name: capture.title,
          target_amount: capture.target_amount ?? 500,
          current_amount: 0,
          icon: "🎯",
        });
      } else if (capture.kind === "trip") {
        await supabase.from("trips").insert({ destination: capture.destination ?? capture.title });
      }
      setSaved(true);
      setTimeout(() => {
        setQuery("");
        setSaved(false);
        setSaving(false);
      }, 1200);
    } catch {
      setSaving(false);
    }
  }, [capture, saving, supabase]);

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

  const typeLabels: Record<string, string> = {
    task: t.tasks.title,
    note: t.notes.title,
    event: t.calendar.title,
    tx: t.money.title,
    goal: t.goals.title,
    person: t.people.title,
    trip: t.travel.title,
    doc: t.digital.title,
    sub: t.subs.title,
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

  const showCapture = Boolean(capture);

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg" title={showCapture ? t.cmd.capture : t.cmd.quickActions}>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 shadow-input">
        <Search className="h-4 w-4 shrink-0 text-zinc-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && capture) saveCapture();
            else if (e.key === "Enter") submit();
          }}
          placeholder={t.cmd.placeholder}
          className="h-11 w-full bg-transparent text-sm text-zinc-800 placeholder:text-zinc-400 outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <CornerDownLeft className="h-4 w-4 shrink-0 text-zinc-600" />
      </div>

      {/* Instant capture */}
      {showCapture && capture && (
        <div className="mt-3 rounded-xl border border-indigo-500/25 bg-indigo-500/8 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
            {CAPTURE_LABEL[capture.kind]} {t.cmd.capture}
          </p>
          <div className="mt-1.5 space-y-0.5 text-sm text-zinc-600 dark:text-zinc-200">
            <p>
              {capture.kind === "expense" || capture.kind === "income" ? (
                <>
                  {capture.title} · <b>{capture.amount}€</b>
                  {capture.category ? ` · ${capture.category}` : ""}
                </>
              ) : capture.kind === "goal" ? (
                <>
                  {capture.title} · <b>{capture.target_amount}€</b>
                </>
              ) : capture.kind === "event" && capture.start_at ? (
                <>
                  {capture.title} · {new Date(capture.start_at).toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </>
              ) : capture.kind === "task" || capture.kind === "reminder" ? (
                <>
                  {capture.title}
                  {capture.due_date ? ` · ${capture.due_date}` : ""}
                </>
              ) : (
                capture.destination ?? capture.title
              )}
            </p>
          </div>
          <button
            onClick={saveCapture}
            disabled={saving}
            style={{ background: "var(--app-primary, #0d9488)" }}
            className="mt-3 w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {saved ? "✓ " + t.common.done : t.common.save}
          </button>
        </div>
      )}

      {/* Search results */}
      {!showCapture && query.trim().length >= 2 && (
        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          <div className="flex items-center gap-1.5 px-0.5 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{t.common.filter}</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-7 rounded-lg border border-zinc-200 bg-zinc-50 px-1.5 text-[11px] text-zinc-700 outline-none transition focus:border-indigo-500/60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 [&>option]:bg-white dark:[&>option]:bg-zinc-900"
            >
              <option value="all">{t.common.all}</option>
              {Object.keys(typeLabels).map((k) => (
                <option key={k} value={k}>
                  {typeLabels[k]}
                </option>
              ))}
            </select>
          </div>
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
                className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition hover:bg-zinc-100 dark:border-white/6 dark:bg-white/4 dark:hover:bg-white/10"
              >
                <Icon className="h-4 w-4 shrink-0 text-indigo-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{r.title}</p>
                  <p className="truncate text-[10px] text-zinc-500">{r.sub}</p>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-600">{r.type}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Quick actions */}
      {!showCapture && query.trim().length < 2 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.href}
              onClick={() => go(a.href)}
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-white/8 dark:bg-white/4 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              <a.icon className="h-4 w-4 text-indigo-400" />
              {a.label(t)}
            </button>
          ))}
          <button
            onClick={() => go("/app/nova")}
            className="col-span-2 flex items-center gap-2 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2.5 text-left text-xs font-medium text-indigo-600 dark:text-indigo-300 transition hover:bg-indigo-500/20"
          >
            <Sparkles className="h-4 w-4" />
            {t.cmd.askNova}
          </button>
        </div>
      )}
    </Modal>
  );
}
