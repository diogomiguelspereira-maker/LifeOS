"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { currencies } from "@/lib/i18n";import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Switch,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/cn";
import type { Account, BankLink, Currency, IntegrationToken, Lang, Profile } from "@/lib/types";

const THEME_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#0ea5e9",
  "#06b6d4",
  "#14b8a6",
  "#0d9488",
  "#2dd4bf",
];

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
  "net_worth_snapshots",
  "income_schedule",
  "financial_challenges",
  "shopping_lists",
  "shopping_items",
  "wishlist_items",
  "focus_sessions",
  "routines",
  "sleep_logs",
  "water_logs",
  "exercise_logs",
  "wellness_logs",
  "career_goals",
  "skills",
  "job_applications",
  "books",
  "courses",
  "study_sessions",
  "trips",
  "trip_items",
  "shared_expenses",
  "digital_assets",
  "documents",
  "ai_memory",
  "bank_links",
  "integration_tokens",
];

function SettingsPageInner() {
  const { t, profile, updateProfile } = useApp();
  const params = useSearchParams();
  const googleErr = params.get("google");
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [income, setIncome] = useState("");
  const [savings, setSavings] = useState("");
  const [country, setCountry] = useState("");
  const [aiStatus, setAiStatus] = useState<boolean | null>(null);
  const [googleStatus, setGoogleStatus] = useState<{ configured: boolean; connected: boolean; email: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [bankStatus, setBankStatus] = useState<{ configured: boolean; links: BankLink[] } | null>(null);
  const [diag, setDiag] = useState<{ ok: boolean; checks: { name: string; ok: boolean }[] } | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankCountry, setBankCountry] = useState("pt");
  const [bankQuery, setBankQuery] = useState("");
  const [institutions, setInstitutions] = useState<{ id: string; name: string; logo: string | null }[] | null>(null);
  const [bankSyncing, setBankSyncing] = useState(false);
  const [bankMsg, setBankMsg] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tokens, setTokens] = useState<IntegrationToken[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [integMsg, setIntegMsg] = useState<string | null>(null);
  const [customTheme, setCustomTheme] = useState<{ primary: string; secondary: string }>({
    primary: "#0d9488",
    secondary: "#2dd4bf",
  });

  async function persist(patch: Partial<Profile>) {
    const ok = await updateProfile(patch);
    setSaveMsg(ok ? "✓" : "⚠");
    setTimeout(() => setSaveMsg(null), 1800);
  }

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setIncome(String(profile.monthly_income ?? ""));
      setSavings(String(profile.savings ?? ""));
      setCountry(profile.country ?? "");
      const t = ((profile.preferences as Record<string, unknown>)?.theme ?? {}) as Record<string, string>;
      if (t.primary)
        setCustomTheme({
          primary: t.primary ?? "#6366f1",
          secondary: t.secondary ?? "#8b5cf6",
        });
    }
    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d) => setAiStatus(Boolean(d.configured)))
      .catch(() => setAiStatus(false));
    fetch("/api/google/status")
      .then((r) => r.json())
      .then((d) => setGoogleStatus(d))
      .catch(() => setGoogleStatus({ configured: false, connected: false, email: null }));
    fetch("/api/bank/status")
      .then((r) => r.json())
      .then((d) => setBankStatus(d))
      .catch(() => setBankStatus({ configured: false, links: [] }));
    fetch("/api/diagnostics")
      .then((r) => r.json())
      .then((d) => setDiag(d))
      .catch(() => setDiag({ ok: false, checks: [] }));
    supabase
      .from("accounts")
      .select("id, name")
      .eq("is_archived", false)
      .order("created_at")
      .then(({ data }) => setAccounts((data as Account[]) ?? []));
    supabase
      .from("integration_tokens")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setTokens((data as IntegrationToken[]) ?? []));
  }, [profile, supabase]);

  async function loadBank() {
    const d = (await fetch("/api/bank/status").then((r) => r.json())) as { configured: boolean; links: BankLink[] };
    setBankStatus(d);
  }

  async function openBankModal() {
    setBankOpen(true);
    setBankQuery("");
    setInstitutions(null);
    loadInstitutions("pt");
  }

  async function loadInstitutions(country: string) {
    setInstitutions(null);
    try {
      const d = (await fetch(`/api/bank/institutions?country=${country}`).then((r) => r.json())) as {
        institutions: { id: string; name: string; logo: string | null }[];
      };
      setInstitutions(d.institutions ?? []);
    } catch {
      setInstitutions([]);
    }
  }

  async function connectBank(i: { id: string; name: string }) {
    try {
      const res = await fetch("/api/bank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution_id: i.id, institution_name: i.name }),
      });
      const d = (await res.json()) as { link?: string };
      if (d.link) window.location.href = d.link;
    } catch {
      /* stay on page */
    }
  }

  async function syncBank(linkId?: string) {
    setBankSyncing(true);
    setBankMsg(null);
    try {
      const res = await fetch("/api/bank/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link_id: linkId }),
      });
      const d = (await res.json()) as { ok?: boolean; created?: number };
      if (d.ok) setBankMsg(t.settings.bankSyncResult.replace("{n}", String(d.created ?? 0)));
    } catch {
      setBankMsg(null);
    }
    setBankSyncing(false);
    loadBank();
  }

  async function unlinkBank(linkId: string) {
    await fetch("/api/bank/unlink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link_id: linkId }),
    });
    loadBank();
  }

  async function setBankAccount(linkId: string, accountId: string) {
    await supabase.from("bank_links").update({ lifeos_account_id: accountId || null }).eq("id", linkId);
    loadBank();
  }

  async function createToken() {
    setTokenBusy(true);
    setIntegMsg(null);
    try {
      const res = await fetch("/api/integrations/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "n8n" }),
      });
      const d = (await res.json()) as { ok?: boolean; token?: string; detail?: string };
      if (d.ok && d.token) {
        setNewToken(d.token);
        const { data } = await supabase
          .from("integration_tokens")
          .select("*")
          .order("created_at", { ascending: false });
        setTokens((data as IntegrationToken[]) ?? []);
      } else if (d.detail) {
        setIntegMsg(d.detail);
      } else {
        setIntegMsg(t.settings.integrationsFailed);
      }
    } catch {
      setIntegMsg(t.settings.integrationsFailed);
    }
    setTokenBusy(false);
  }

  async function revokeToken(id: string) {
    await fetch("/api/integrations/token", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTokens((prev) => prev.filter((x) => x.id !== id));
    if (newToken) setNewToken(null);
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopiedKey(value);
    setTimeout(() => setCopiedKey((c) => (c === value ? null : c)), 1500);
  }

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

      {googleErr && googleErr !== "connected" && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {googleErr === "not-configured"
            ? t.settings.googleSetupHint
            : t.settings.googleConnectFailed}
        </p>
      )}

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
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white/4 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">🐷 {t.settings.saveMode}</p>
            <p className="text-[11px] text-zinc-500">{t.settings.saveModeHint}</p>
          </div>
          <Switch
            checked={((profile.preferences ?? {}) as Record<string, unknown>).save_mode === true}
            onChange={(v) => updateProfile({ preferences: { ...(profile.preferences as Record<string, unknown>), save_mode: v } })}
          />
        </div>
        <div className="mt-4">
          <Button onClick={saveProfile}>{t.common.save}</Button>
        </div>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader title={t.settings.appearance} action={saveMsg ? <span className="text-xs text-emerald-400">{saveMsg}</span> : undefined} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.settings.theme}>
            <Segmented
              value={profile.theme}
              onChange={(v) => persist({ theme: v as "dark" | "light" | "system" })}
              options={[
                { value: "dark", label: `🌙 ${t.settings.dark}` },
                { value: "light", label: `☀️ ${t.settings.light}` },
                { value: "system", label: `🖥️ ${t.settings.system}` },
              ]}
            />
          </Field>

          <Field label={t.settings.language}>
            <Select value={profile.language} onChange={(e) => updateProfile({ language: e.target.value as Lang })}>
              <option value="pt">Português 🇵🇹</option>
              <option value="en">English 🇬🇧</option>
              <option value="es">Español 🇪🇸</option>
              <option value="fr">Français 🇫🇷</option>
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

      {/* Custom theme: background + primary/secondary colors */}
      <Card className="border-indigo-500/15">
        <CardHeader title={t.settings.themeTitle} />
        <p className="mb-4 text-xs text-zinc-500">{t.settings.themeSync}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.settings.themePrimary}>
            <div className="flex flex-wrap gap-2.5">
              {THEME_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCustomTheme((s) => ({ ...s, primary: c }))}
                  className={cn(
                    "h-8 w-8 rounded-full transition",
                    customTheme.primary === c && "ring-2 ring-white ring-offset-2 ring-offset-zinc-100 dark:ring-offset-zinc-950"
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
          <Field label={t.settings.themeSecondary}>
            <div className="flex flex-wrap gap-2.5">
              {THEME_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCustomTheme((s) => ({ ...s, secondary: c }))}
                  className={cn(
                    "h-8 w-8 rounded-full transition",
                    customTheme.secondary === c && "ring-2 ring-white ring-offset-2 ring-offset-zinc-100 dark:ring-offset-zinc-950"
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setCustomTheme({ primary: "#0d9488", secondary: "#2dd4bf" })}
          >
            {t.common.reset}
          </Button>
          <Button
            className="flex-1"
            onClick={() =>
              persist({
                preferences: {
                  ...((profile.preferences as Record<string, unknown>) ?? {}),
                  theme: customTheme,
                },
              })
            }
          >
            {t.common.save}
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">{t.settings.themePreview}</p>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader title={t.settings.integrations} />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/4 px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{t.settings.connectGoogle}</p>
              <p className="break-words text-xs text-zinc-500">
                {t.settings.googleStatus}:{" "}
                {!googleStatus ? (
                  <Badge color="zinc">…</Badge>
                ) : googleStatus.connected ? (
                  <Badge color="green" className="max-w-[60vw] truncate">✓ {googleStatus.email ?? t.settings.googleConnected}</Badge>
                ) : googleStatus.configured ? (
                  <Badge color="amber">{t.settings.googleNotConnected}</Badge>
                ) : (
                  <Badge color="amber">{t.settings.notConfigured}</Badge>
                )}
              </p>
            </div>
            {!googleStatus ? null : googleStatus.connected ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    await fetch("/api/google/sync", { method: "POST" });
                    setSyncing(false);
                  }}
                >
                  {syncing ? t.common.loading : t.settings.googleSync}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    await fetch("/api/google/disconnect", { method: "POST" });
                    setGoogleStatus((s) => (s ? { ...s, connected: false, email: null } : s));
                  }}
                >
                  {t.settings.googleDisconnect}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = "/api/google/connect";
                }}
              >
                {t.settings.connectGoogle}
              </Button>
            )}
          </div>
          {googleStatus && !googleStatus.configured && (
            <p className="rounded-xl bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400">
              {t.settings.googleSetupHint}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/4 px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">🏦 {t.settings.bank}</p>
              <p className="break-words text-xs text-zinc-500">
                {t.settings.bankHint}{" "}
                {!bankStatus ? (
                  <Badge color="zinc">…</Badge>
                ) : bankStatus.configured ? (
                  bankStatus.links.length > 0 ? (
                    <Badge color="green" className="mt-1">
                      ✓ {bankStatus.links.length} {t.settings.bankLinked.toLowerCase()}
                    </Badge>
                  ) : (
                    <Badge color="amber" className="mt-1">{t.settings.bankEmpty}</Badge>
                  )
                ) : (
                  <Badge color="amber" className="mt-1">{t.settings.notConfigured}</Badge>
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={openBankModal} disabled={!bankStatus?.configured}>
              {t.settings.bankConnect}
            </Button>
          </div>
          {bankStatus && !bankStatus.configured && (
            <p className="rounded-xl bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400">
              {t.settings.bankNotConfigured}
            </p>
          )}
          {bankMsg && <p className="rounded-xl bg-emerald-500/8 px-3 py-2 text-xs text-emerald-400">{bankMsg}</p>}
          {params.get("bank") === "connected" && !bankMsg && (
            <p className="rounded-xl bg-emerald-500/8 px-3 py-2 text-xs text-emerald-400">{t.settings.bankConnected}</p>
          )}
          {params.get("bank") === "error" && (
            <p className="rounded-xl bg-red-500/8 px-3 py-2 text-xs text-red-400">{t.settings.bankError}</p>
          )}
          {bankStatus && bankStatus.links.length > 0 && (
            <div className="space-y-2">
              {bankStatus.links.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/4 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">🏦 {l.institution_name}</p>
                    <p className="text-[11px] text-zinc-500">
                      {l.status === "linked" ? (
                        <span className="text-emerald-400">✓ {t.settings.bankLinked}</span>
                      ) : l.status === "pending" ? (
                        <span className="text-amber-400">{t.settings.bankPending}</span>
                      ) : (
                        <span className="text-red-400">{t.settings.bankFailed}</span>
                      )}
                      {l.status === "linked" && l.accounts.length > 0 && ` · ${l.accounts.length} conta(s)`}
                    </p>
                  </div>
                  {l.status === "linked" && (
                    <>
                      <Select
                        value={l.lifeos_account_id ?? ""}
                        onChange={(e) => setBankAccount(l.id, e.target.value)}
                        className="h-8 w-44 text-xs"
                        title={t.settings.bankChooseAccount}
                      >
                        <option value="">{t.settings.bankNoAccount}</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                      <Button variant="outline" size="sm" disabled={bankSyncing} onClick={() => syncBank(l.id)}>
                        {bankSyncing ? t.common.loading : t.settings.bankSync}
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => unlinkBank(l.id)}>
                    {t.settings.bankUnlink}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl bg-white/4 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">🔌 {t.settings.integrationsTitle}</p>
                <p className="text-xs text-zinc-500">{t.settings.integrationsHint}</p>
              </div>
              <Button variant="outline" size="sm" disabled={tokenBusy} onClick={createToken}>
                {t.settings.integrationsCreate}
              </Button>
            </div>
            {integMsg && (
              <p className="mt-3 rounded-xl bg-red-500/8 px-3 py-2 text-xs leading-relaxed text-red-400">
                {integMsg}
              </p>
            )}
            {newToken && (
              <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  {t.settings.integrationsNew}
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg bg-zinc-100 px-2.5 py-2 text-[11px] text-emerald-700 dark:bg-black/30 dark:text-emerald-200">
                    {newToken}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copyText(newToken)}>
                    {copiedKey === newToken ? t.settings.integrationsCopied : t.settings.integrationsCopy}
                  </Button>
                </div>
                <div className="mt-3 space-y-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  <p>
                    · {t.settings.integrationsWebhookUrl}:{" "}
                    <code className="text-zinc-600 dark:text-zinc-300">POST {typeof window !== "undefined" ? window.location.origin : ""}/api/integrations/webhook</code>
                  </p>
                  <p>
                    · {t.settings.integrationsExportUrl}:{" "}
                    <code className="text-zinc-600 dark:text-zinc-300">GET {typeof window !== "undefined" ? window.location.origin : ""}/api/integrations/export?type=tasks</code>
                  </p>
                </div>
              </div>
            )}
            <div className="mt-3 space-y-1.5">
              {tokens.length === 0 ? (
                <p className="text-xs text-zinc-600">{t.settings.integrationsEmpty}</p>
              ) : (
                tokens.map((tk) => (
                  <div key={tk.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/4 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">🔑 {tk.name ?? "n8n"}</p>
                      <p className="text-[11px] text-zinc-500">
                        {tk.token.slice(0, 12)}… · {t.settings.integrationsLastUsed}:{" "}
                        {tk.last_used_at ? new Date(tk.last_used_at).toLocaleDateString("pt-PT") : "—"}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => revokeToken(tk.id)}>
                      {t.settings.integrationsRevoke}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{t.settings.ai}</p>
              <p className="text-xs text-zinc-500">
                {t.settings.ai} · API OpenAI-compatível ·{" "}
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

      {/* Diagnostics */}
      <Card>
        <CardHeader title={t.settings.diagnostics} />
        {diag === null ? (
          <p className="text-xs text-zinc-500">{t.common.loading}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">{t.settings.diagnosticsHint}</p>
            {diag.checks.map((c) => (
              <div
                key={c.name}
                className="flex items-center justify-between gap-2 rounded-xl bg-white/4 px-3 py-2"
              >
                <span className="min-w-0 truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">{c.name}</span>
                {c.ok ? (
                  <Badge color="green" className="shrink-0">✓ {t.settings.diagOk}</Badge>
                ) : (
                  <Badge color="red" className="shrink-0">✗ {t.settings.diagMissing}</Badge>
                )}
              </div>
            ))}
            {diag.ok ? (
              <p className="rounded-xl bg-emerald-500/8 px-3 py-2 text-xs text-emerald-400">
                {t.settings.diagAllOk}
              </p>
            ) : (
              <p className="rounded-xl bg-amber-500/8 px-3 py-2 text-xs text-amber-400">
                {t.settings.diagAllMissing}
              </p>
            )}
          </div>
        )}
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
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{t.settings.deleteConfirm}</p>
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

      {/* Connect bank */}
      <Modal open={bankOpen} onClose={() => setBankOpen(false)} title={t.settings.bankModalTitle} maxWidth="max-w-lg">
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {t.settings.bankHint}{" "}
            {t.settings.bankCallbackHint.replace("{url}", `${typeof window !== "undefined" ? window.location.origin : ""}/api/bank/callback`)}
          </p>
          <Field label={t.settings.bankCountry}>
            <Select
              value={bankCountry}
              onChange={(e) => {
                setBankCountry(e.target.value);
                loadInstitutions(e.target.value);
              }}
            >
              <option value="pt">Portugal 🇵🇹</option>
              <option value="es">Espanha 🇪🇸</option>
              <option value="fr">França 🇫🇷</option>
              <option value="gb">Reino Unido 🇬🇧</option>
            </Select>
          </Field>
          <Input value={bankQuery} onChange={(e) => setBankQuery(e.target.value)} placeholder={t.settings.bankSearch} />
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {!institutions ? (
              <p className="py-6 text-center text-xs text-zinc-500">{t.common.loading}</p>
            ) : institutions.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-500">{t.settings.bankNoInstitutions}</p>
            ) : (
              institutions
                .filter((i) => i.name.toLowerCase().includes(bankQuery.trim().toLowerCase()))
                .slice(0, 40)
                .map((i) => (
                  <button
                    key={i.id}
                    onClick={() => connectBank(i)}
                    className="flex w-full items-center gap-3 rounded-xl bg-white/4 px-3 py-2.5 text-left transition hover:bg-zinc-100 dark:bg-white/8"
                  >
                    {i.logo ? (
                      <img src={i.logo} alt="" className="h-6 w-6 shrink-0 rounded" />
                    ) : (
                      <span className="text-lg">🏦</span>
                    )}
                    <span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">{i.name}</span>
                  </button>
                ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}
