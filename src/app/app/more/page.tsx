"use client";

import Link from "next/link";
import {
  BarChart3,
  Flame,
  Settings,
  StickyNote,
  Target,
  Users,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Card } from "@/components/ui";
import type { Dict } from "@/lib/i18n";

const ITEMS: { href: string; icon: typeof Target; label: (t: Dict) => string }[] = [
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
