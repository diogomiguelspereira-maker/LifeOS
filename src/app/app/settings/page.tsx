"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { currencies } from "@/lib/i18n";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import type { Currency, Lang } from "@/lib/types";

const TABLES = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "savings_goals",
  "subscriptions",
  "projects",
  "tasks",
  "habits",
  "habit_completions",
  "notes",
  "journal_entries",
  "calendar_events",
  "contacts",
  "notifications",
  "ai_conversations",
  "ai_messages",
];

export default function SettingsPage() {
  const { t, profile, updateProfile } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [income, setIncome] = useState("");
  const [savings, setSavings] = useState("");
  const [country, setCountry] = useState("");
  const [aiStatus, setAiStatus] = useState<boolean | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setIncome(String(profile.monthly_income ?? ""));
      setSavings(String(profile.savings ?? ""));
      setCountry(profile.country ?? "");
    }
    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d) => setAiStatus(Boolean(d.configured)))
      .catch(() => setAiStatus(false));
  }, [profile]);

  async function saveProfile() {
    await updateProfile({
      name,
      monthly_income: parseFloat(income.replace(",", ".")) || 0,
      savings: parseFloat(savings.replace(",", ".")) || 0,
      country,
    });
  }

  async function exportData() {
    const all: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const table of TABLES) {
      const { data } = await supabase.from(table).select("*");
      all[table] = data ?? [];
    }
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lifeos-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    setDeleting(true);
    for (const table of TABLES) {
      await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }
    await supabase.from("profiles").delete().eq("id", profile!.id);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!profile) return null;

  return (
    <div className="space-y-5">
      <PageHeader title={t.settings.title} />

      {/* Profile */}
      <Card>
        <CardHeader title={t.settings.profile} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.common.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t.settings.monthlyIncome}>
            <Input type="number" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
          </Field>
          <Field label={t.settings.savings}>
            <Input type="number" inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)} />
          </Field>
          <Field label={t.onboarding.country}>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Portugal" />
          </Field>
        </div>
        <div className="mt-4">
          <Button onClick={saveProfile}>{t.common.save}</Button>
        </div>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader title={t.settings.appearance} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.settings.theme}>
            <Segmented
              value={profile.theme}
              onChange={(v) => updateProfile({ theme: v as "dark" | "light" })}
              options={[
                { value: "dark", label: `🌙 ${t.settings.dark}` },
                { value: "light", label: `☀️ ${t.settings.light}` },
              ]}
            />
          </Field>
          <Field label={t.settings.language}>
            <Select value={profile.language} onChange={(e) => updateProfile({ language: e.target.value as Lang })}>
              <option value="pt">Português 🇵🇹</option>
              <option value="en">English 🇬🇧</option>
            </Select>
          </Field>
          <Field label={t.settings.currency}>
            <Select
              value={profile.currency}
              onChange={(e) => updateProfile({ currency: e.target.value as Currency })}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.settings.weekStart}>
            <Select value={profile.week_start} onChange={(e) => updateProfile({ week_start: e.target.value as "monday" | "sunday" })}>
              <option value="monday">{t.settings.monday}</option>
              <option value="sunday">{t.settings.sunday}</option>
            </Select>
          </Field>
        </div>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader title={t.settings.integrations} />
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-200">{t.settings.connectGoogle}</p>
              <p className="text-xs text-zinc-500">
                {t.settings.googleStatus}: <Badge color="amber">{t.settings.notConfigured}</Badge>
              </p>
            </div>
            <Button variant="outline" size="sm" disabled>
              {t.settings.connectGoogle}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-200">{t.settings.ai}</p>
              <p className="text-xs text-zinc-500">
                OpenAI ·{" "}
                {aiStatus === null ? "…" : aiStatus ? (
                  <Badge color="green">✓</Badge>
                ) : (
                  <Badge color="amber">{t.settings.notConfigured}</Badge>
                )}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader title={t.common.settings} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportData}>
            <Download className="h-4 w-4" />
            {t.settings.dataExport}
          </Button>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-500/20">
        <CardHeader title={t.settings.danger} />
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" />
          {t.settings.deleteAccount}
        </Button>
      </Card>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t.settings.deleteAccount}>
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">{t.settings.deleteConfirm}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" className="flex-1" onClick={deleteAccount} disabled={deleting}>
              {t.common.delete}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
