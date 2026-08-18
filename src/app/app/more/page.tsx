"use client";

import Link from "next/link";
import {
  BarChart3,
  Brain,
  Briefcase,
  CalendarClock,
  ClipboardList,
  Flame,
  FolderKanban,
  FolderOpen,
  GraduationCap,
  HeartPulse,
  Plane,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  StickyNote,
  Target,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Card } from "@/components/ui";
import type { Dict } from "@/lib/i18n";

const ITEMS: { href: string; icon: typeof Target; label: (t: Dict) => string }[] = [
  { href: "/app/finance", icon: Wallet, label: (t) => t.finance.title },
  { href: "/app/subscriptions", icon: Sparkles, label: (t) => t.subs.title },
  { href: "/app/shopping", icon: ShoppingBag, label: (t) => t.shopping.title },
  { href: "/app/focus", icon: Timer, label: (t) => t.focus.title },
  { href: "/app/wellness", icon: HeartPulse, label: (t) => t.wellness.title },
  { href: "/app/learning", icon: GraduationCap, label: (t) => t.learning.title },
  { href: "/app/career", icon: Briefcase, label: (t) => t.career.title },
  { href: "/app/travel", icon: Plane, label: (t) => t.travel.title },
  { href: "/app/social", icon: Users, label: (t) => t.social.title },
  { href: "/app/digital", icon: FolderOpen, label: (t) => t.digital.title },
  { href: "/app/aimemory", icon: Brain, label: (t) => t.aimemory.title },
  { href: "/app/lifeadmin", icon: ClipboardList, label: (t) => t.lifeadmin.title },
  { href: "/app/projects", icon: FolderKanban, label: (t) => t.projects.title },
  { href: "/app/review", icon: CalendarClock, label: (t) => t.reviews.title },
  { href: "/app/audit", icon: ShieldCheck, label: (t) => t.audit.title },
  { href: "/app/goals", icon: Target, label: (t) => t.goals.title },
  { href: "/app/habits", icon: Flame, label: (t) => t.habits.title },
  { href: "/app/notes", icon: StickyNote, label: (t) => t.notes.title },
  { href: "/app/people", icon: Users, label: (t) => t.people.title },
  { href: "/app/stats", icon: BarChart3, label: (t) => t.stats.title },
  { href: "/app/settings", icon: Settings, label: (t) => t.settings.title },
];

export default function MorePage() {
  const { t } = useApp();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-100">{t.nav.more}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href}>
            <Card className="flex flex-col items-center gap-2 py-6 transition hover:bg-white/8">
              <i.icon className="h-6 w-6 text-indigo-400" />
              <span className="text-sm font-medium text-zinc-200">{i.label(t)}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
