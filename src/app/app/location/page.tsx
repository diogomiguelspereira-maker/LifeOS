"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, MapPin, QrCode, Radio, Square, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useApp, useSupabase } from "@/lib/app-context";
import { Button, Card, Select } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";

const DURATIONS = [15, 30, 60, 180];

type Point = { lat: number; lon: number; accuracy: number; updatedAt: string };

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

export default function LocationPage() {
  const { t, profile } = useApp();
  const supabase = useSupabase();
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [point, setPoint] = useState<Point | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Mirrors `token` synchronously so stopSharing (captured by the owned
  // timeout/cleanup and the Stop button) always sees the live token — the
  // React state alone is stale inside those stabilized callbacks.
  const tokenRef = useRef<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const expiresRef = useRef<number | null>(null);

  const stopSharing = useCallback(() => {
    if (watchRef.current !== null && "geolocation" in navigator) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    const tok = tokenRef.current;
    if (tok) void supabase.rpc("stop_location_share", { p_token: tok });
    if (channelRef.current) void supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    if (expiresRef.current !== null) window.clearTimeout(expiresRef.current);
    expiresRef.current = null;
    setExpiresAt(null);
    setNow(Date.now());
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
    tokenRef.current = shareToken;
    setShareUrl(`${window.location.origin}/share/location/${shareToken}`);
    setSharing(true);
    setExpiresAt(new Date(Date.now() + minutes * 60_000));
    setNow(Date.now());
    // The share page polls get_shared_location every 5s, so live delivery does
    // NOT depend on this Realtime channel. Subscribe best-effort instead of
    // letting a subscribe timeout/error stop the share from starting at all.
    const channel = supabase.channel(`lifeos-location:${profile?.id ?? "anonymous"}`);
    channelRef.current = channel;
    try {
      await channel.subscribe();
    } catch {
      // realtime is optional — geolocation + polling keep sharing working
    }
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

  // Live viewer count: poll how many people currently have the share link open.
  useEffect(() => {
    if (!sharing || !tokenRef.current) {
      setViewerCount(null);
      return;
    }
    let cancelled = false;
    const token = tokenRef.current;
    const poll = async () => {
      const { data } = await supabase.rpc("get_share_viewer_count", { p_token: token });
      if (!cancelled && typeof data === "number") setViewerCount(data);
    };
    void poll();
    const id = window.setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sharing, supabase]);

  // Live 1s ticker so the "expires in" countdown keeps moving while sharing.
  useEffect(() => {
    if (!sharing) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sharing]);

  // Android Chrome fails silently (no permission prompt) when the OS location
  // toggle is off or the site permission was blocked before. Probe on open so
  // the page says exactly what's wrong before the user presses start.
  useEffect(() => {
    let cancelled = false;
    if (!("geolocation" in navigator)) {
      setError(t.location.unsupported);
      return () => { cancelled = true; };
    }
    const check = (state: string) => {
      if (cancelled) return;
      if (state === "denied") {
        setError(t.location.denied);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => {}, // probe only — real tracking starts on demand
        (geoError) => {
          if (cancelled) return;
          if (geoError.code === geoError.PERMISSION_DENIED) setError(t.location.denied);
          else if (geoError.code === geoError.TIMEOUT) setError(t.location.timeout);
          else setError(t.location.signal);
        },
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
      );
    };
    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => check(status.state))
        .catch(() => check("prompt"));
    } else {
      check("prompt");
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
        {sharing && expiresAt && <p className="flex items-center gap-1.5 text-xs text-ink-3"><Clock className="h-3.5 w-3.5" />{t.location.expiresIn} {fmtCountdown(expiresAt.getTime() - now)} · {t.location.expiresAt} {expiresAt.toLocaleTimeString()}</p>}
        {shareUrl && sharing && <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3"><p className="mb-2 text-xs font-semibold text-ink">{t.location.copyLink}</p><div className="flex flex-wrap gap-2"><input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-2 text-xs text-ink" /><Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(shareUrl)}>{t.location.copy}</Button><Button size="sm" variant="outline" onClick={() => setShowQr((v) => !v)}><QrCode className="h-4 w-4" />{t.location.qr}</Button></div>{showQr && <div className="mt-3 flex justify-center rounded-xl bg-white p-3"><QRCodeSVG value={shareUrl} size={150} /></div>}{viewerCount !== null && <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3"><Users className="h-3.5 w-3.5" />{t.location.liveViewers.replace("{n}", String(viewerCount))}</p>}</div>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <p className="text-xs leading-relaxed text-ink-3">{t.location.privacy}</p>
      </Card>
    </div>
  );
}
