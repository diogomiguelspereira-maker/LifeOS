"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { pt, en, es, fr, type Dict } from "@/lib/i18n";
import { ACCENT_IDS } from "@/lib/colors";
import type { Currency, Lang, Profile } from "@/lib/types";

interface AppContextValue {
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<boolean>;
  setProfile: (p: Profile | null) => void;
  lang: Lang;
  t: Dict;
  currency: Currency;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);

  const refreshProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      return;
    }
    let { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    // Self-heal: accounts created before the schema was applied have no
    // profile row yet — seed it (profile + accounts + categories) on the fly.
    if (!data) {
      await supabase.rpc("seed_new_user", { uid: user.id });
      const retry = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      data = retry.data;
    }
    if (data) setProfile(data as Profile);
  }, [supabase]);

  useEffect(() => {
    refreshProfile();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        refreshProfile();
      }
      if (event === "SIGNED_OUT") setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, [supabase, refreshProfile]);

  // localStorage cache so the chosen look applies instantly on page load
  // (the DB profile is still the source of truth and wins when it arrives).
  useEffect(() => {
    try {
      const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
      const dbAccent = prefs.accent as string | undefined;
      if (dbAccent && ACCENT_IDS.includes(dbAccent)) {
        window.localStorage.setItem("lifeos:accent", dbAccent);
      }
      const dbTheme = profile?.theme;
      if (dbTheme) window.localStorage.setItem("lifeos:theme", dbTheme);
    } catch {}
  }, [profile?.preferences, profile?.theme]);

  // accent theme (data-accent on <html>, resolved by globals.css)
  useEffect(() => {
    const root = document.documentElement;
    let accent = "indigo";
    const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
    const dbAccent = prefs.accent as string | undefined;
    if (dbAccent && ACCENT_IDS.includes(dbAccent)) accent = dbAccent;
    else {
      try {
        const stored = window.localStorage.getItem("lifeos:accent");
        if (stored && ACCENT_IDS.includes(stored)) accent = stored;
      } catch {}
    }
    root.setAttribute("data-accent", accent);
  }, [profile?.preferences]);

  // dark / light / system
  useEffect(() => {
    const root = document.documentElement;
    const apply = (theme: string) => {
      root.classList.remove("dark", "light");
      root.classList.add(theme);
    };
    let theme: string = profile?.theme ?? "dark";
    if (!profile?.theme) {
      try {
        theme = window.localStorage.getItem("lifeos:theme") ?? "dark";
      } catch {}
    }
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      apply(mq.matches ? "light" : "dark");
      const onChange = (e: MediaQueryListEvent) => apply(e.matches ? "light" : "dark");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    apply(theme);
  }, [profile?.theme]);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      const uid = profile?.id ?? (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return false;
      setProfile((p) => (p ? { ...p, ...patch } : p));
      const { error } = await supabase.from("profiles").update(patch).eq("id", uid);
      if (error) {
        console.error("Falha ao atualizar perfil:", error.message);
        return false;
      }
      return true;
    },
    [profile, supabase]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [supabase, router]);

  const lang: Lang = profile?.language ?? "pt";
  const currency: Currency = profile?.currency ?? "EUR";
  const dicts: Record<string, Dict> = { pt, en, es, fr };
  const t: Dict = dicts[lang] ?? pt;

  const value = useMemo(
    () => ({ profile, refreshProfile, updateProfile, setProfile, lang, t, currency, signOut }),
    [profile, refreshProfile, updateProfile, setProfile, lang, t, currency, signOut]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function useSupabase() {
  const supabase = useMemo(() => createClient(), []);
  return supabase;
}
