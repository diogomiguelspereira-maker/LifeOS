"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  Command,
  Flame,
  Home,
  LayoutGrid,
  LogOut,
  Settings,
  Sparkles,
  StickyNote,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/app-context";
import { Button } from "@/components/ui";
import { Wordmark } from "@/components/Logo";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationsBell } from "@/components/NotificationsBell";
import { initials } from "@/lib/format";

const NAV = [
  { href: "/app", labelKey: "home", icon: Home },
  { href: "/app/money", labelKey: "money", icon: Wallet },
  { href: "/app/calendar", labelKey: "calendar", icon: CalendarDays },
  { href: "/app/tasks", labelKey: "tasks", icon: CheckSquare },
  { href: "/app/goals", labelKey: "goals", icon: Target },
  { href: "/app/habits", labelKey: "habits", icon: Flame },
  { href: "/app/nova", labelKey: "ai", icon: Sparkles },
  { href: "/app/notes", labelKey: "notes", icon: StickyNote },
  { href: "/app/people", labelKey: "people", icon: Users },
  { href: "/app/stats", labelKey: "stats", icon: BarChart3 },
  { href: "/app/settings", labelKey: "settings", icon: Settings },
] as const;

const MOBILE_MAIN = ["/app", "/app/money", "/app/calendar", "/app/nova", "/app/tasks"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, t, signOut } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const label = (key: string) => (t.nav as unknown as Record<string, string>)[key] ?? key;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const desktopNav = NAV;

  const mobileVisible = MOBILE_MAIN.map((href) => NAV.find((n) => n.href === href)!);

  return (
    <div className="app-bg min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/6 bg-black/30 p-4 backdrop-blur-xl lg:flex dark:border-white/6 dark:bg-black/30">
        <Link href="/app" className="mb-6 px-2 pt-1">
          <Wordmark />
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {desktopNav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                isActive(n.href)
                  ? "bg-gradient-to-r from-indigo-500/15 to-violet-500/10 text-zinc-100"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200 dark:text-zinc-500 dark:hover:text-zinc-200"
              )}
            >
              <n.icon className={cn("h-[18px] w-[18px]", isActive(n.href) && "text-indigo-400")} />
              {label(n.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="mt-4 space-y-1 border-t border-white/6 pt-3 dark:border-white/6">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-white/5 hover:text-red-400"
          >
            <LogOut className="h-[18px] w-[18px]" />
            {t.common.logout}
          </button>
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
              {initials(profile?.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-200">{profile?.name ?? "—"}</p>
              <p className="truncate text-[11px] text-zinc-500">{profile?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/6 bg-black/40 px-4 py-3 backdrop-blur-xl lg:hidden dark:border-white/6 dark:bg-black/40">
        <Link href="/app" onClick={() => router.push("/app")}>
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Comandos"
            onClick={() => setCommandOpen(true)}
          >
            <Command className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="lg:pl-60">
        <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-black/60 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden dark:border-white/8 dark:bg-black/60">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
          {mobileVisible.map((n) => {
            const active = isActive(n.href);
            const isNova = n.href === "/app/nova";
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-all",
                  isNova && "-mt-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 p-3 shadow-lg shadow-indigo-500/40"
                )}
              >
                <n.icon
                  className={cn(
                    "h-[20px] w-[20px]",
                    isNova ? "text-white" : active ? "text-indigo-400" : "text-zinc-500"
                  )}
                />
                {!isNova && (
                  <span
                    className={cn(
                      "text-[10px] font-medium",
                      active ? "text-indigo-400" : "text-zinc-500"
                    )}
                  >
                    {label(n.labelKey)}
                  </span>
                )}
              </Link>
            );
          })}
          <Link
            href="/app/more"
            className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5"
          >
            <LayoutGrid
              className={cn("h-[20px] w-[20px]", isActive("/app/more") ? "text-indigo-400" : "text-zinc-500")}
            />
            <span
              className={cn(
                "text-[10px] font-medium",
                isActive("/app/more") ? "text-indigo-400" : "text-zinc-500"
              )}
            >
              {t.nav.more}
            </span>
          </Link>
        </div>
      </nav>

      {/* Mobile quick-capture FAB */}
      <button
        onClick={() => setCommandOpen(true)}
        aria-label="Captura rápida"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-xl shadow-indigo-500/40 transition active:scale-95 lg:hidden"
      >
        <Command className="h-6 w-6" />
      </button>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
