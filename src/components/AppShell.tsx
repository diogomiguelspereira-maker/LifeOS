"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CheckSquare,
  Command,
  Flame,
  Gift,
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
import { KeyboardManager } from "@/components/KeyboardManager";
import { NotificationsBell } from "@/components/NotificationsBell";
import { initials } from "@/lib/format";
import { getModuleUsage, incrementUsage, moduleHref } from "@/lib/module-usage";

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
  { href: "/app/wishlist", labelKey: "wishlist", icon: Gift },
  { href: "/app/stats", labelKey: "stats", icon: BarChart3 },
  { href: "/app/monitor", labelKey: "monitor", icon: Activity },
  { href: "/app/more", labelKey: "more", icon: LayoutGrid },
  { href: "/app/settings", labelKey: "settings", icon: Settings },
] as const;

// Odd count so Nova sits exactly in the center of the 5-slot bar.
const MOBILE_MAIN = ["/app", "/app/money", "/app/nova", "/app/wishlist"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, t, signOut, updateProfile } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    const onOpen = () => setCommandOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("lifeos:open-command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("lifeos:open-command", onOpen);
    };
  }, []);

  // Track how often each module is opened so the "Mais" grid can
  // reorder itself by usage. Usage lives in the profile so it syncs
  // across devices; writes are debounced to avoid hammering the DB.
  const usageRef = useRef<Record<string, number>>({});
  const prefsRef = useRef<Record<string, unknown>>({});
  const updateProfileRef = useRef(updateProfile);

  useEffect(() => {
    updateProfileRef.current = updateProfile;
  }, [updateProfile]);

  useEffect(() => {
    const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
    prefsRef.current = prefs;
    usageRef.current = getModuleUsage(prefs);
  }, [profile?.preferences]);

  useEffect(() => {
    const href = moduleHref(pathname);
    // Only track once the profile has loaded; otherwise prefsRef is still {}
    // and the write below would wipe the user's preferences (including the
    // custom theme, which then falls back to blue).
    if (!href || !profile?.id) return;
    usageRef.current = incrementUsage(usageRef.current, href);
    const timer = setTimeout(() => {
      updateProfileRef.current({
        preferences: { ...prefsRef.current, moduleUsage: usageRef.current },
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [pathname, profile?.id]);

  const label = (key: string) => (t.nav as unknown as Record<string, string>)[key] ?? key;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const desktopNav = NAV;

  const mobileVisible = MOBILE_MAIN.map((href) => NAV.find((n) => n.href === href)!);

  return (
    <div className="app-bg min-h-dvh">
      <KeyboardManager />
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-zinc-200/70 bg-white/70 p-4 backdrop-blur-xl shadow-sm lg:flex dark:border-white/6 dark:bg-black/30 dark:shadow-none">
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
                  ? "bg-indigo-50 text-indigo-700 dark:bg-gradient-to-r dark:from-indigo-500/15 dark:to-violet-500/10 dark:text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-200"
              )}
            >
              <n.icon className={cn("h-[18px] w-[18px]", isActive(n.href) && "text-indigo-400")} />
              {label(n.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="mt-4 space-y-1 border-t border-zinc-200 pt-3 dark:border-white/6">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-white/5 dark:hover:text-red-400"
          >
            <LogOut className="h-[18px] w-[18px]" />
            {t.common.logout}
          </button>
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
              {initials(profile?.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{profile?.name ?? "—"}</p>
              <p className="truncate text-[11px] text-zinc-500">{profile?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200/70 bg-white/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl shadow-sm lg:hidden dark:border-white/6 dark:bg-black/40 dark:shadow-none">
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
        <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">
          <div key={pathname} className="animate-page-in">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile bottom nav — raised above the Android keyboard when it opens */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/70 bg-white/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl shadow-[0_-1px_8px_rgba(0,0,0,0.04)] lg:hidden dark:border-white/8 dark:bg-black/60 dark:shadow-none"
        style={{ bottom: "var(--keyboard-inset, 0px)" }}
      >
        <div className="mx-auto flex max-w-md items-center justify-around px-1.5 py-2 sm:px-2">
          {mobileVisible.map((n) => {
            const active = isActive(n.href);
            const isNova = n.href === "/app/nova";
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-label={isNova ? label(n.labelKey) : undefined}
                style={
                  isNova
                    ? {
                        background: "linear-gradient(135deg, var(--app-primary, #6366f1), var(--app-secondary, #8b5cf6))",
                        boxShadow: "0 8px 24px -10px var(--app-primary, #6366f1)",
                      }
                    : undefined
                }
                className={cn(
                  "flex flex-col items-center justify-end gap-0.5 rounded-xl px-2.5 py-1.5 transition-all sm:px-3",
                  isNova && "-mt-7 rounded-full border border-white/20 p-3.5 animate-nova-glow"
                )}
              >
                <n.icon
                  className={cn(
                    "h-[20px] w-[20px]",
                    isNova ? "h-[22px] w-[22px] text-white" : active ? "text-indigo-400" : "text-zinc-500"
                  )}
                />
                {!isNova && (
                  <span
                    className={cn(
                      "whitespace-nowrap text-[10px] font-medium",
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
            className="flex flex-col items-center justify-end gap-0.5 rounded-xl px-2.5 py-1.5 sm:px-3"
          >
            <LayoutGrid
              className={cn("h-[20px] w-[20px]", isActive("/app/more") ? "text-indigo-400" : "text-zinc-500")}
            />
            <span
              className={cn(
                "whitespace-nowrap text-[10px] font-medium",
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
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition active:scale-95 lg:hidden"
        style={{
          bottom: "calc(6rem + var(--keyboard-inset, 0px))",
          background: "linear-gradient(135deg, var(--app-primary, #6366f1), var(--app-secondary, #8b5cf6))",
          boxShadow: "0 12px 32px -12px var(--app-primary, #6366f1)",
        }}
      >
        <Command className="h-6 w-6" />
      </button>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

      {/* Back to top */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Voltar ao topo"            className="raise-for-keyboard fixed left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200/70 bg-white/80 text-zinc-400 shadow-lg backdrop-blur transition hover:text-zinc-700 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:text-white lg:left-auto lg:right-8"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
