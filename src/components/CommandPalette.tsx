"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  CornerDownLeft,
  Plus,
  Search,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Modal } from "@/components/ui";
import type { Dict } from "@/lib/i18n";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const QUICK_ACTIONS: { icon: typeof Wallet; href: string; label: (t: Dict) => string }[] = [
    { icon: Wallet, href: "/app/money?new=1", label: (t) => t.money.addTransaction },
    { icon: Plus, href: "/app/tasks?new=1", label: (t) => t.tasks.addTask },
    { icon: CalendarPlus, href: "/app/calendar?new=1", label: (t) => t.calendar.addEvent },
    { icon: Target, href: "/app/goals?new=1", label: (t) => t.goals.addGoal },
  ];

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
    </Modal>
  );
}
