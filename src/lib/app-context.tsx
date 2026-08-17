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
import { pt, en, type Dict } from "@/lib/i18n";
import type { Currency, Lang, Profile } from "@/lib/types";

interface AppContextValue {
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
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
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
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

  // theme
  useEffect(() => {
    const theme = profile?.theme ?? "dark";
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
  }, [profile?.theme]);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!profile) return;
      setProfile((p) => (p ? { ...p, ...patch } : p));
      await supabase.from("profiles").update(patch).eq("id", profile.id);
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
  const t: Dict = lang === "pt" ? pt : en;

  const value = useMemo(
    () => ({ profile, refreshProfile, updateProfile, lang, t, currency, signOut }),
    [profile, refreshProfile, updateProfile, lang, t, currency, signOut]
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
