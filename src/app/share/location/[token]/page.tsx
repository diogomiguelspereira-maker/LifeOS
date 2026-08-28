"use client";

import { use, useEffect, useState } from "react";
import { Lock, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { pt, en, es, fr, type Dict } from "@/lib/i18n";

type Location = { lat: number; lon: number; accuracy: number | null; updated_at: string | null; expires_at: string; owner_name: string | null };
function dict(): Dict { try { const l = navigator.language.toLowerCase(); if (l.startsWith("en")) return en; if (l.startsWith("es")) return es; if (l.startsWith("fr")) return fr; } catch {} return pt; }

export default function SharedLocationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [location, setLocation] = useState<Location | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [t] = useState<Dict>(() => dict());
  useEffect(() => {
    let cancelled = false;
    const client = createClient();
    const load = async () => {
      const { data, error } = await client.rpc("get_shared_location", { p_token: token });
      if (cancelled) return;
      if (error || !data?.[0]) setInvalid(true); else { setLocation(data[0] as Location); setInvalid(false); }
    };
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [token]);
  const map = location ? `https://www.openstreetmap.org/export/embed.html?bbox=${location.lon - 0.01}%2C${location.lat - 0.01}%2C${location.lon + 0.01}%2C${location.lat + 0.01}&layer=mapnik&marker=${location.lat}%2C${location.lon}` : "";
  return <main className="mx-auto min-h-dvh max-w-3xl px-4 py-8"><header className="mb-6 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 text-white"><MapPin className="h-5 w-5" /></div><div><h1 className="text-lg font-bold text-ink">{t.location.sharedTitle}</h1><p className="text-xs text-ink-3">{location?.owner_name ?? "LifeOS"}</p></div></header>{invalid ? <div className="flex flex-col items-center gap-3 rounded-2xl border border-line p-12 text-center"><Lock className="h-7 w-7 text-red-400" /><p className="font-semibold text-ink">{t.location.unavailable}</p></div> : location ? <div className="space-y-3"><div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card"><iframe title={t.location.map} src={map} className="h-[min(65vh,520px)] w-full border-0" loading="lazy" /></div><p className="text-xs text-ink-3">{t.location.live} · {location.updated_at ? new Date(location.updated_at).toLocaleTimeString() : t.common.loading}{location.accuracy ? ` · ±${Math.round(location.accuracy)} m` : ""}</p></div> : <p className="py-20 text-center text-sm text-ink-3">{t.common.loading}</p>}<footer className="mt-8 text-center text-[11px] text-ink-3">{t.location.openStreetMap}</footer></main>;
}
