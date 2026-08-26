import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Brain,
  CalendarDays,
  CheckCircle2,
  Flame,
  Lock,
  ShieldCheck,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LogoMark } from "@/components/Logo";

const FEATURES = [
  { icon: Wallet, title: "Dinheiro", text: "Contas, movimentos, subscrições e a resposta a \"para onde foi o meu dinheiro?\"." },
  { icon: CheckCircle2, title: "Tarefas", text: "Quick-add com linguagem natural, prioridades, projetos e foco." },
  { icon: CalendarDays, title: "Calendário", text: "Vista dia/semana/mês com deteção de conflitos e tempo livre." },
  { icon: Flame, title: "Hábitos", text: "Streaks, consistência e alvos semanais — sem esqueceres o essencial." },
  { icon: Target, title: "Objetivos", text: "Metas de poupança com progresso, prazo e contribuição sugerida." },
  { icon: Brain, title: "Nova", text: "A tua assistente com IA, com contexto real sobre a tua vida." },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/app");

  return (
    <div className="app-bg flex min-h-dvh flex-col">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-6 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-white/10 ring-inset"
            style={{
              background:
                "linear-gradient(135deg, var(--app-primary, #0d9488), var(--app-secondary, #2dd4bf))",
            }}
          >
            <LogoMark className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-ink">
            Life<span className="text-indigo-500">OS</span>
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/6 dark:hover:text-zinc-100"
          >
            Entrar
          </Link>
          <Link
            href="/signup"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
            style={{ background: "var(--app-primary, #0d9488)" }}
          >
            Criar conta
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px]"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(640px 320px at 50% 0%, var(--app-glow-a, rgba(20,184,166,0.14)), transparent 70%)",
          }}
        />
        <div
          className="mb-7 flex h-20 w-20 items-center justify-center rounded-[1.4rem] text-white shadow-lg ring-1 ring-white/15 ring-inset"
          style={{
            background:
              "linear-gradient(135deg, var(--app-primary, #0d9488), var(--app-secondary, #2dd4bf))",
          }}
        >
          <LogoMark className="h-11 w-11 text-white" />
        </div>
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-ink-2">
          <Sparkles className="h-3.5 w-3.5 text-gold-400" />
          O teu centro de comando pessoal
        </p>
        <h1 className="font-display max-w-2xl text-4xl font-bold leading-[1.08] tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
          A tua vida, num só{" "}
          <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
            painel
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-lg">
          Dinheiro, tarefas, hábitos, objetivos e calendário num só lugar — com a
          Nova, a tua assistente pessoal com IA. Privado, rápido e só teu.
        </p>
        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-base font-medium text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, var(--app-primary, #0d9488), var(--app-secondary, #2dd4bf))",
            }}
          >
            Criar conta grátis
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-6 text-base font-medium text-zinc-700 shadow-xs transition hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/6"
          >
            Já tenho conta
          </Link>
        </div>

        {/* Feature grid */}
        <div className="mt-20 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition-transform hover:-translate-y-0.5"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:bg-white/8 dark:text-indigo-300">
                <f.icon className="h-[18px] w-[18px]" />
              </div>
              <p className="font-display text-sm font-semibold text-zinc-800 dark:text-zinc-100">{f.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{f.text}</p>
            </div>
          ))}
        </div>

        {/* Privacy strip */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-gold-400" /> Dados encriptados
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-gold-400" /> Row Level Security
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-gold-400" /> IA opcional
          </span>
        </div>
      </main>

      <footer className="border-t border-line py-8">
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          LifeOS · O teu centro de comando pessoal
        </p>
      </footer>
    </div>
  );
}
