"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";
import { useSupabase } from "@/lib/app-context";
import { pt } from "@/lib/i18n";

export default function SignupPage() {
  const router = useRouter();
  const supabase = useSupabase();
  const t = pt;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (password.length < 6) {
      setError(t.auth.passwordHint);
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  return (
    <AuthShell title={t.auth.signupTitle} subtitle={t.auth.signupSubtitle}>
        <form onSubmit={handleSignup} className="space-y-4">
          <Field label={t.common.name}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="O teu nome"
              autoComplete="name"
            />
          </Field>
          <Field label={t.auth.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              required
            />
          </Field>
          <Field label={t.auth.password} hint={t.auth.passwordHint}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.auth.signup}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-100 dark:bg-white/8" />
          <span className="text-[11px] uppercase tracking-wider text-zinc-600">ou</span>
          <div className="h-px flex-1 bg-zinc-100 dark:bg-white/8" />
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={googleLoading}>
          {googleLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
          )}
          {t.auth.google}
        </Button>

        <p className="mt-5 text-center text-xs text-zinc-500">
          {t.auth.haveAccount}{" "}
          <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-600 dark:text-indigo-300">
            {t.auth.login}
          </Link>
        </p>
    </AuthShell>
  );
}
