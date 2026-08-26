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
import { ACCENTS, ACCENT_IDS } from "@/lib/colors";
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

const ACCENT_BY_COLOR: Record<string, string> = {
  "#6366f1": "indigo",
  "#8b5cf6": "violet",
  "#d946ef": "fuchsia",
  "#f43f5e": "rose",
  "#f97316": "amber",
  "#f59e0b": "amber",
  "#84cc16": "emerald",
  "#10b981": "emerald",
  "#0ea5e9": "sky",
  "#06b6d4": "teal",
  "#14b8a6": "teal",
  "#0d9488": "teal",
  "#2dd4bf": "teal",
};

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function hexToAccent(hex: string): string {
  const direct = ACCENT_BY_COLOR[hex.toLowerCase()];
  if (direct) return direct;
  // Any other color (custom/legacy data) maps to the nearest accent instead
  // of silently falling back to blue.
  const rgb = hexToRgb(hex);
  if (!rgb) return "indigo";
  let best = "indigo";
  let bestDist = Infinity;
  for (const a of ACCENTS) {
    const ar = hexToRgb(a.color);
    if (!ar) continue;
    const d = (rgb[0] - ar[0]) ** 2 + (rgb[1] - ar[1]) ** 2 + (rgb[2] - ar[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = a.id;
    }
  }
  return best;
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(13, 148, 136, ${alpha})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
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

  // accent theme (data-accent on <html>, resolved by globals.css) — the
  // accent IS the theme now: it's derived from the user's primary color.
  useEffect(() => {
    const root = document.documentElement;
    const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
    const saved = (prefs.theme ?? {}) as Record<string, string>;
    let cached: Record<string, string> | null = null;
    try {
      const raw = window.localStorage.getItem("lifeos:theme-custom");
      if (raw) cached = JSON.parse(raw);
    } catch {}
    // Resolve from the DB theme first, but fall back to the cached custom
    // theme so a slow profile load (or a wiped preferences object) never
    // snaps the accent back to blue while buttons stay the chosen color.
    const src = saved.primary ? saved : (cached ?? {});
    let accent = "teal";
    if (src.primary) accent = hexToAccent(src.primary);
    else {
      // fallback for accounts that set an accent before themes existed
      const dbAccent = prefs.accent as string | undefined;
      if (dbAccent && ACCENT_IDS.includes(dbAccent)) accent = dbAccent;
      else {
        try {
          const stored = window.localStorage.getItem("lifeos:accent");
          if (stored && ACCENT_IDS.includes(stored)) accent = stored;
        } catch {}
      }
    }
    root.setAttribute("data-accent", accent);
    try {
      window.localStorage.setItem("lifeos:accent", accent);
    } catch {}
  }, [profile?.preferences]);

  // custom theme: everything (background glow, logo, buttons) is derived from
  // the two chosen colors. Stored in profile.preferences.theme → syncs across
  // devices via the DB, with a localStorage cache for instant page loads.
  useEffect(() => {
    const root = document.documentElement;
    const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
    const saved = (prefs.theme ?? {}) as Record<string, string>;
    let cached: Record<string, string> | null = null;
    try {
      const raw = window.localStorage.getItem("lifeos:theme-custom");
      if (raw) cached = JSON.parse(raw);
    } catch {}
    const src = saved.primary ? saved : (cached ?? {});
    const primary = src.primary ?? "#0d9488";
    const secondary = src.secondary ?? "#2dd4bf";
    root.style.setProperty("--app-primary", primary);
    root.style.setProperty("--app-secondary", secondary);
    root.style.setProperty("--app-glow-a", hexToRgba(primary, 0.14));
    root.style.setProperty("--app-glow-b", hexToRgba(secondary, 0.13));
    try {
      if (saved.primary)
        window.localStorage.setItem("lifeos:theme-custom", JSON.stringify({ primary, secondary }));
    } catch {}
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
