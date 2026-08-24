"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { useApp, useSupabase } from "@/lib/app-context";
import type { Notification } from "@/lib/types";

const typeIcons: Record<string, string> = {
  money: "💰",
  task: "✅",
  calendar: "📅",
  success: "✨",
  warning: "⚠️",
  info: "💡",
};

export function NotificationsBell() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as Notification[]) ?? []);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unread = items.filter((n) => !n.read).length;

  async function markAllRead() {
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/8 dark:hover:text-zinc-100"
        aria-label={t.notif.title}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-1 text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-zinc-200 bg-white p-3 shadow-modal backdrop-blur-xl animate-slide-up dark:border-white/10 dark:bg-zinc-950/95 dark:shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{t.notif.title}</p>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-600 dark:text-indigo-300"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {t.notif.markAllRead}
                </button>
              )}
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {items.length === 0 && (
                <p className="py-6 text-center text-xs text-zinc-500">{t.notif.empty}</p>
              )}
              {items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-2.5 rounded-xl px-2.5 py-2 transition",
                    !n.read && "bg-indigo-50/80 dark:bg-white/5"
                  )}
                >
                  <span className="text-base">{typeIcons[n.type] ?? "💡"}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{n.body}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
