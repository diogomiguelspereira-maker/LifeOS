"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { AppProvider, useApp, useSupabase } from "@/lib/app-context";
import { currencies } from "@/lib/i18n";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { pt } from "@/lib/i18n";
import type { Currency, Lang } from "@/lib/types";

const AGE_RANGES = ["18–20", "21–24", "25–30", "31–35", "36+"];
const GOAL_ICONS = [
  { name: "Fundo de emergência", icon: "🛡️" },
  { name: "PC novo", icon: "💻" },
  { name: "iPhone", icon: "📱" },
  { name: "Carro", icon: "🚗" },
  { name: "Mota", icon: "🏍️" },
  { name: "Férias", icon: "✈️" },
  { name: "Apartamento", icon: "🏠" },
  { name: "Educação", icon: "🎓" },
  { name: "Concerto", icon: "🎸" },
  { name: "Setup gaming", icon: "🕹️" },
];

function OnboardingInner() {
  const router = useRouter();
  const { profile, refreshProfile, updateProfile } = useApp();
  const supabase = useSupabase();
  const t = pt;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [country, setCountry] = useState("");
  const [income, setIncome] = useState("");
  const [expenses, setExpenses] = useState("");
  const [savings, setSavings] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [language, setLanguage] = useState<Lang>("pt");
  const [goalName, setGoalName] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [workSchedule, setWorkSchedule] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setCurrency(profile.currency);
      setLanguage(profile.language);
    }
  }, [profile]);

  // already finished onboarding → never show the wizard again
  useEffect(() => {
    if (profile?.onboarding_completed) {
      router.replace("/app");
    }
  }, [profile, router]);

  if (!profile) {
    return (
      <div className="app-bg flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  async function finish() {
    setSaving(true);
    const ok = await updateProfile({
      name,
      age_range: ageRange || null,
      country: country || null,
      monthly_income: parseFloat(income.replace(",", ".")) || 0,
      typical_expenses: parseFloat(expenses.replace(",", ".")) || 0,
      savings: parseFloat(savings.replace(",", ".")) || 0,
      work_schedule: workSchedule || null,
      currency: currency as Currency,
      language,
      onboarding_completed: true,
    });
    if (!ok) {
      setSaving(false);
      alert("Não foi possível guardar o teu perfil. Tenta novamente.");
      return;
    }
    if (goalName && goalAmount) {
      const { error } = await supabase.from("savings_goals").insert({
        name: goalName,
        icon: GOAL_ICONS.find((g) => g.name === goalName)?.icon ?? "🎯",
        target_amount: parseFloat(goalAmount.replace(",", ".")) || 0,
        current_amount: parseFloat(savings.replace(",", ".")) || 0,
      });
      if (error) console.error("Falha ao criar objetivo:", error.message);
    }
    await refreshProfile();
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="app-bg flex min-h-dvh flex-col items-center justify-center p-4">
      <div className="mb-6 flex items-center gap-2">
        <Logo />
        <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
          Life<span className="text-indigo-500">OS</span>
        </span>
      </div>

      <Card className="w-full max-w-md p-6">
        {/* progress */}
        <div className="mb-6 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${i <= step ? "bg-indigo-500" : "bg-zinc-200 dark:bg-white/10"}`}
            />
          ))}
        </div>

        <h1 className="mb-1 text-xl font-bold text-zinc-800 dark:text-zinc-100">{t.onboarding.welcome}</h1>
        <p className="mb-6 text-sm text-zinc-500">{t.onboarding.subtitle}</p>

        {step === 0 && (
          <div className="space-y-4 animate-slide-up">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">{t.onboarding.step1}</p>
            <Field label={t.onboarding.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="O teu nome" autoFocus />
            </Field>
            <Field label={t.onboarding.ageRange}>
              <div className="flex flex-wrap gap-2">
                {AGE_RANGES.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAgeRange(a)}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                      ageRange === a
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                        : "border-zinc-200 dark:border-white/10 text-zinc-500 hover:bg-zinc-50 dark:bg-white/5"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t.onboarding.country}>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Portugal" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 animate-slide-up">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">{t.onboarding.step2}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.settings.currency}>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} {c.symbol}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.settings.language}>
                <Select value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
                  <option value="pt">🇵🇹 PT</option>
                  <option value="en">🇬🇧 EN</option>
                </Select>
              </Field>
            </div>
            <Field label={t.onboarding.monthlyIncome}>
              <Input type="number" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="1500" />
            </Field>
            <Field label={t.onboarding.typicalExpenses}>
              <Input type="number" inputMode="decimal" value={expenses} onChange={(e) => setExpenses(e.target.value)} placeholder="900" />
            </Field>
            <Field label={t.onboarding.savings}>
              <Input type="number" inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)} placeholder="500" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-slide-up">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">{t.onboarding.step3}</p>
            <Field label={t.onboarding.mainGoal}>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_ICONS.map((g) => (
                  <button
                    key={g.name}
                    onClick={() => setGoalName(g.name)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                      goalName === g.name
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                        : "border-zinc-200 dark:border-white/10 text-zinc-500 hover:bg-zinc-50 dark:bg-white/5"
                    }`}
                  >
                    <span className="text-base">{g.icon}</span>
                    {g.name}
                  </button>
                ))}
              </div>
            </Field>
            {goalName && (
              <Field label={`${t.onboarding.createGoal} (${goalName})`}>
                <Input type="number" inputMode="decimal" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} placeholder="2000" />
              </Field>
            )}
            <Field label={t.onboarding.workSchedule} hint={t.common.optional}>
              <Input value={workSchedule} onChange={(e) => setWorkSchedule(e.target.value)} placeholder="Seg–Sex 9h–18h" />
            </Field>
          </div>
        )}

        <div className="mt-7 flex items-center justify-between gap-3">

          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4" />
              {t.common.back}
            </Button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !name.trim()}>
              {t.common.next}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving} className="min-w-32">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t.onboarding.start}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <AppProvider>
      <OnboardingInner />
    </AppProvider>
  );
}
