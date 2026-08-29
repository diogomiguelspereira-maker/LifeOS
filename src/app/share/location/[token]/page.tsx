"use client";

import { use, useEffect, useState } from "react";
import { Clock, Lock, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { pt, en, es, fr, type Dict } from "@/lib/i18n";

type Location = { lat: number | null; lon: number | null; accuracy: number | null; updated_at: string | null; expires_at: string; owner_name: string | null };
function dict(): Dict { try { const l = navigator.language.toLowerCase(); if (l.startsWith("en")) return en; if (l.startsWith("es")) return es; if (l.startsWith("fr")) return fr; } catch {} return pt; }

const POLL_FAST_MS = 2000; // before the first fix arrives, get it on screen fast
const POLL_IDLE_MS = 6000; // once it's live, a gentler cadence is enough

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

export default function SharedLocationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [location, setLocation] = useState<Location | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [valid, setValid] = useState(false);
  const [t] = useState<Dict>(() => dict());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let cancelled = false;
    let timerId: number | null = null;
    const client = createClient();

    const schedule = (ms: number) => {
      // setTimeout-chained (not setInterval) so a slow request never stacks a
      // new one on top of the previous in-flight call.
      timerId = window.setTimeout(() => void poll(), ms);
    };
    const poll = async () => {
      const { data, error } = await client.rpc("get_shared_location", { p_token: token });
      if (cancelled) return;
      if (error || !data?.[0]) {
        // Share stopped or expired (or a bad token) — nothing more to fetch.
        setInvalid(true);
        setValid(false);
        timerId = null;
        return;
      }
      const row = data[0] as Location;
      setInvalid(false);
      setValid(true);
      // Skip re-renders (and a rebuilt iframe src) when the fix hasn't moved.
      setLocation((prev) => (prev && prev.updated_at === row.updated_at ? prev : row));
      const hasFix = row.lat !== null && row.lon !== null && !!row.updated_at;
      schedule(hasFix ? POLL_IDLE_MS : POLL_FAST_MS);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timerId !== null) { window.clearTimeout(timerId); timerId = null; }
        return;
      }
      // Resume polling as soon as the tab is visible again.
      if (timerId === null) void poll();
    };

    void poll();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token]);

  // Let the sharer see who has the link open: while the share is valid this tab
  // pings periodically, and the owner's viewer count drops them off automatically
  // ~15s after the last ping (or immediately when they close/behind a tab).
  useEffect(() => {
    if (!valid) return undefined;
    let cancelled = false;
    let timerId: number | null = null;
    const client = createClient();
    const viewerId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ping = async () => {
      if (document.hidden) return; // backgrounded tabs should not inflate the count
      try {
        await client.rpc("ping_share_viewer", { p_token: token, p_viewer_id: viewerId });
      } catch {
        // heartbeat is best-effort; stale rows are cleaned up by TTL
      }
    };
    const schedule = () => {
      timerId = window.setTimeout(() => {
        if (!cancelled) {
          void ping();
          schedule();
        }
      }, 5000);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timerId !== null) {
          window.clearTimeout(timerId);
          timerId = null;
        }
      } else if (timerId === null) {
        void ping();
        schedule();
      }
    };
    void ping();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [valid, token]);

  // Live 1s ticker so the "expires in" countdown moves even between polls.
  useEffect(() => {
    if (!location || invalid) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [location, invalid]);

  const hasFix = location?.lat !== null && location?.lon !== null; // shared but waiting for sharer's first fix
  const map =
    location && hasFix
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${location.lon! - 0.01}%2C${location.lat! - 0.01}%2C${location.lon! + 0.01}%2C${location.lat! + 0.01}&layer=mapnik&marker=${location.lat}%2C${location.lon}`
      : "";
  return <main className="mx-auto min-h-dvh max-w-3xl px-4 py-8"><header className="mb-6 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 text-white"><MapPin className="h-5 w-5" /></div><div><h1 className="text-lg font-bold text-ink">{t.location.sharedTitle}</h1><p className="text-xs text-ink-3">{location?.owner_name ?? "LifeOS"}</p></div></header>{invalid ? <div className="flex flex-col items-center gap-3 rounded-2xl border border-line p-12 text-center"><Lock className="h-7 w-7 text-red-400" /><p className="font-semibold text-ink">{t.location.unavailable}</p></div> : location ? <div className="space-y-3"><div className="flex h-[min(65vh,520px)] w-full items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface shadow-card">{hasFix ? <iframe title={t.location.map} src={map} className="h-full w-full border-0" loading="lazy" /> : <p className="px-4 text-center text-sm text-ink-3">{t.location.waitingFix}</p>}</div><p className="text-xs text-ink-3">{t.location.live} · {location.updated_at ? new Date(location.updated_at).toLocaleTimeString() : t.common.loading}{location.accuracy ? ` · ±${Math.round(location.accuracy)} m` : ""}</p>{(() => { const remaining = new Date(location.expires_at).getTime() - now; return remaining > 0 ? <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3"><Clock className="h-3 w-3" />{t.location.expiresIn} {fmtCountdown(remaining)} · {t.location.expiresAt} {new Date(location.expires_at).toLocaleTimeString()}</p> : <p className="mt-0.5 text-[11px] text-red-400">{t.location.expired}</p>; })()}</div> : <p className="py-20 text-center text-sm text-ink-3">{t.common.loading}</p>}<footer className="mt-8 text-center text-[11px] text-ink-3">{t.location.openStreetMap}</footer></main>;
}
