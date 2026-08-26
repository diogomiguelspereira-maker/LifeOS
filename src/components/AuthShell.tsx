import { LogoMark, Wordmark } from "@/components/Logo";

/**
 * Shared auth layout: a dark brand panel (desktop) with the orbit motif and a
 * focused form card on the other side. On mobile the brand block condenses to
 * a compact header above the card.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-bg flex min-h-dvh">
      {/* Brand panel — desktop */}
      <aside className="relative hidden w-[44%] flex-col justify-between overflow-hidden border-r border-line bg-surface p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(560px 420px at 18% 12%, var(--app-glow-a, rgba(20,184,166,0.16)), transparent 70%)",
          }}
        />
        {/* faint orbit motif */}
        <div
          className="pointer-events-none absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full border border-white/[0.05]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-20 -right-20 h-[360px] w-[360px] rounded-full border border-white/[0.07]"
          aria-hidden="true"
        />
        <Wordmark className="relative" />

        <div className="relative">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg ring-1 ring-white/15 ring-inset"
            style={{ background: "var(--app-primary, #0d9488)" }}
          >
            <LogoMark className="h-9 w-9 text-white" />
          </div>
          <h2 className="font-display max-w-sm text-3xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
            O teu centro de comando pessoal.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            Dinheiro, tarefas, hábitos, objetivos e calendário num só lugar — com
            a Nova, a tua assistente pessoal com IA.
          </p>
        </div>

        <p className="relative text-xs text-zinc-500 dark:text-zinc-500">
          Privado por defeito · Os teus dados são teus
        </p>
      </aside>

      {/* Form side */}
      <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm ring-1 ring-white/10 ring-inset"
              style={{ background: "var(--app-primary, #0d9488)" }}
            >
              <LogoMark className="h-8 w-8 text-white" />
            </div>
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {title}
              </h1>
              {subtitle && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <div className="mb-5 hidden lg:block">
              <h1 className="font-display text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {title}
              </h1>
              {subtitle && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
