"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Radio, Square } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { Button, Card, Select } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";

const DURATIONS = [15, 30, 60, 180];

type Point = { lat: number; lon: number; accuracy: number; updatedAt: string };

export default function LocationPage() {
  const { t, profile } = useApp();
  const supabase = useSupabase();
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [point, setPoint] = useState<Point | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const watchRef = useRef<number | null>(null);
  const expiresRef = useRef<number | null>(null);

  const stopSharing = useCallback(() => {
    if (watchRef.current !== null && "geolocation" in navigator) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    if (token) void supabase.rpc("stop_location_share", { p_token: token });
    if (channelRef.current) void supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    if (expiresRef.current !== null) window.clearTimeout(expiresRef.current);
    expiresRef.current = null;
    setSharing(false);
  }, [supabase]);

  const startSharing = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setError(t.location.unsupported);
      return;
    }
    setError(null);
    const { data: created, error: createError } = await supabase.rpc("create_location_share", { p_minutes: minutes });
    if (createError || !created) { setError(t.location.failed); return; }
    const shareToken = String(created);
    setToken(shareToken);
    setShareUrl(`${window.location.origin}/share/location/${shareToken}`);
    const channel = supabase.channel(`lifeos-location:${profile?.id ?? "anonymous"}`);
    channelRef.current = channel;
    await channel.subscribe();
    setSharing(true);
    const send = (position: GeolocationPosition) => {
      const next = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        updatedAt: new Date().toISOString(),
      } satisfies Point;
      setPoint(next);
      setError(null);
      void supabase.rpc("update_location_share", { p_token: shareToken, p_lat: next.lat, p_lon: next.lon, p_accuracy: next.accuracy });
      void channel.send({ type: "broadcast", event: "location", payload: next });
    };
    // Transient GPS failures (no signal / slow fix) must not kill the share:
    // keep the link live, tell the user what's happening, and retry once with
    // lower accuracy (fixes are often available without high-accuracy mode).
    let downgraded = false;
    const onError = (geoError: GeolocationPositionError) => {
      if (geoError.code === geoError.PERMISSION_DENIED) {
        setError(t.location.denied);
        stopSharing();
        return;
      }
      setError(geoError.code === geoError.TIMEOUT ? t.location.timeout : t.location.signal);
      if (!downgraded && watchRef.current !== null) {
        downgraded = true;
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = navigator.geolocation.watchPosition(send, onError, { enableHighAccuracy: false, maximumAge: 30000, timeout: 30000 });
      }
    };
    watchRef.current = navigator.geolocation.watchPosition(send, onError, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    if (watchRef.current === null) setError(t.location.failed);
    expiresRef.current = window.setTimeout(stopSharing, minutes * 60_000);
  }, [minutes, profile?.id, stopSharing, supabase, t.location]);

  useEffect(() => () => stopSharing(), [stopSharing]);

  // Android Chrome fails silently (no permission prompt) when the OS location
  // toggle is off or the site permission was blocked before — surface that
  // up front instead of waiting for a failed fix.
  useEffect(() => {
    let cancelled = false;
    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (!cancelled && status.state === "denied") setError(t.location.denied);
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [t.location]);

  return (
    <div className="space-y-5">
      <PageHeader title={t.location.title} subtitle={t.location.subtitle} />
      <Card className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-500/10 p-3 text-indigo-500"><MapPin className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold text-ink">{sharing ? t.location.active : t.location.private}</h2>
            <p className="mt-1 text-sm text-ink-3">{t.location.hint}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-2">{t.location.duration}</span>
            <Select value={String(minutes)} onChange={(event) => setMinutes(Number(event.target.value))} disabled={sharing} className="w-auto">
              {DURATIONS.map((duration) => <option key={duration} value={duration}>{duration} {t.location.minutes}</option>)}
            </Select>
          </label>
          {sharing ? (
            <Button variant="danger" onClick={stopSharing}><Square className="h-4 w-4" />{t.location.stop}</Button>
          ) : (
            <Button onClick={() => void startSharing()}><Radio className="h-4 w-4" />{t.location.start}</Button>
          )}
        </div>
        {point && <p className="text-xs text-ink-3">{t.location.lastUpdate}: {new Date(point.updatedAt).toLocaleTimeString()} · ±{Math.round(point.accuracy)} m</p>}
        {shareUrl && sharing && <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3"><p className="mb-2 text-xs font-semibold text-ink">{t.location.copyLink}</p><div className="flex gap-2"><input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-2 text-xs text-ink" /><Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(shareUrl)}>{t.location.copy}</Button></div></div>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <p className="text-xs leading-relaxed text-ink-3">{t.location.privacy}</p>
      </Card>
    </div>
  );
}
