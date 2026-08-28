"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkCheck,
  BookmarkPlus,
  LocateFixed,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  ShieldAlert,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import {
  fmtDistance,
  lonMetersPerDeg,
  wazeUrl,
  type WazeAlert,
  type WazeAlertType,
  type WazeData,
  type WazeRoute,
} from "@/lib/waze";
import { cn } from "@/lib/cn";
import type { Dict } from "@/lib/i18n";

type Mode = "around" | "route";
type Dr = Dict["driving"];

const ALERT_COLORS: Record<WazeAlertType, string> = {
  police: "#f59e0b",
  camera: "#ef4444",
  redlight: "#ef4444",
  hazard: "#f97316",
  accident: "#ef4444",
  jam: "#a1a1aa",
  other: "#8b5cf6",
};

const RADIUS_OPTIONS = [1000, 2000, 5000];

const ALERT_TYPES: WazeAlertType[] = ["police", "camera", "redlight", "hazard", "accident", "jam", "other"];

function labelFor(type: WazeAlertType, dr: Dr): string {
  return dr[type] ?? dr.other;
}

function errorText(code: string | undefined, dr: Dr): string {
  if (code === "geocode") return dr.errorGeocode;
  if (code === "route") return dr.errorRoute;
  return dr.errorWaze;
}

function ageText(min: number, dr: Dr): string {
  if (min < 0) return dr.permanent;
  if (min < 60) return dr.minAgo.replace("{n}", String(Math.round(min)));
  return dr.hourAgo.replace("{n}", String(Math.round(min / 60)));
}

function beep(audioRef: { current: AudioContext | null }) {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!audioRef.current) audioRef.current = new Ctor();
    const ctx = audioRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    [880, 660].forEach((freq, i) => {
      const t = t0 + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {
    // audio is a nicety — never crash the page for it
  }
}

function WazeLink({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  return (
    <a
      href={wazeUrl(lat, lon)}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/6 dark:hover:text-white"
    >
      <Navigation className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function project(
  lat: number,
  lon: number,
  center: { lat: number; lon: number },
  pxPerM: number,
  cx: number,
  cy: number
): [number, number] {
  const lonM = lonMetersPerDeg(center.lat);
  return [cx + (lon - center.lon) * lonM * pxPerM, cy - (lat - center.lat) * 111320 * pxPerM];
}

function niceStep(target: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const n = target / pow;
  const f = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return f * pow;
}

function RadarCanvas({
  center,
  alerts,
  route,
  accuracy,
}: {
  center: { lat: number; lon: number };
  alerts: WazeAlert[];
  route: WazeRoute | null;
  accuracy?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const size = wrap.clientWidth;
      if (size < 10) return; // layout not ready yet — avoid degenerate draws
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      // Pin the CSS size explicitly in px: the width/height *attributes* set
      // the backing store (size × dpr) and must never drive layout — some
      // mobile WebViews ignore aspect-ratio on canvas and would render the
      // canvas at its huge intrinsic size once a redraw runs.
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const maxDist = Math.max(
        2000,
        ...alerts.map((a) => a.dist),
        (route?.distanceM ?? 0) * 0.5
      );
      const scale = Math.max(2500, maxDist * 1.15);
      const pxPerM = size / 2 / scale;

      const dark = document.documentElement.classList.contains("dark");
      const ringColor = dark ? "rgba(255,255,255,0.12)" : "rgba(24,24,27,0.12)";
      const labelColor = dark ? "rgba(255,255,255,0.35)" : "rgba(24,24,27,0.4)";

      // Distance rings
      const step = niceStep(scale / 4);
      ctx.font = "10px ui-sans-serif, system-ui";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let r = step; r < scale; r += step) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * pxPerM, 0, Math.PI * 2);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = labelColor;
        ctx.fillText(fmtDistance(r), cx + 6, cy - r * pxPerM);
      }

      // GPS accuracy circle
      if (accuracy && accuracy > 10) {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(accuracy * pxPerM, cx - 10), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(99,102,241,0.35)";
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Route polyline + destination marker
      if (route && route.polyline.length > 1) {
        ctx.beginPath();
        route.polyline.forEach(([plat, plon], i) => {
          const [x, y] = project(plat, plon, center, pxPerM, cx, cy);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = "rgba(99,102,241,0.55)";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
        const last = route.polyline[route.polyline.length - 1];
        const [dx, dy] = project(last[0], last[1], center, pxPerM, cx, cy);
        ctx.beginPath();
        ctx.arc(dx, dy, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#6366f1";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Alerts
      for (const a of alerts) {
        const [x, y] = project(a.lat, a.lon, center, pxPerM, cx, cy);
        if (x < -20 || x > size + 20 || y < -20 || y > size + 20) continue;
        ctx.beginPath();
        ctx.arc(x, y, a.type === "police" || a.type === "camera" || a.type === "redlight" ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle = ALERT_COLORS[a.type];
        ctx.fill();
        ctx.strokeStyle = dark ? "rgba(0,0,0,0.5)" : "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Center marker
      ctx.beginPath();
      ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = "#6366f1";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    };

    draw();
    // Re-draw when the container itself resizes (rotation, sidebar, reflow).
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(draw);
      if (wrapRef.current) ro.observe(wrapRef.current);
    } else {
      window.addEventListener("resize", draw);
    }
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [center, alerts, route, accuracy]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}

export default function DrivingPage() {
  const { t, profile, updateProfile } = useApp();
  const supabase = useSupabase();
  const dr = t.driving;

  const [loc, setLoc] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [locError, setLocError] = useState<"denied" | "unsupported" | null>(() =>
    typeof navigator !== "undefined" && !("geolocation" in navigator) ? "unsupported" : null
  );
  const [mode, setMode] = useState<Mode>("around");
  const [dest, setDest] = useState("");
  const [destQ, setDestQ] = useState("");
  const [radius, setRadius] = useState(2000);
  const [sound, setSound] = useState(true);
  const [data, setData] = useState<WazeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [trips, setTrips] = useState<string[]>([]);
  const [placeSaved, setPlaceSaved] = useState(false);

  const lastFetch = useRef(0);
  const busy = useRef(false); // skip polls while a (slow) request is in flight
  const announced = useRef<Set<string>>(new Set());
  const audio = useRef<AudioContext | null>(null);

  // Destinations from the travel module, as suggestions.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("trips")
      .select("destination")
      .order("start_date", { ascending: false })
      .limit(50)
      .then(({ data: rows }) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const list: string[] = [];
        for (const row of rows ?? []) {
          const d = String(row.destination ?? "").trim();
          if (d && !seen.has(d.toLowerCase())) {
            seen.add(d.toLowerCase());
            list.push(d);
          }
        }
        setTrips(list);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Places the user saved on the driving page (synced via profile preferences).
  const places = useMemo<string[]>(() => {
    const p = (profile?.preferences ?? {}).places;
    return Array.isArray(p) ? (p as string[]) : [];
  }, [profile?.preferences]);

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of [...places, ...trips]) {
      if (!seen.has(p.toLowerCase())) {
        seen.add(p.toLowerCase());
        out.push(p);
      }
    }
    return out.slice(0, 12);
  }, [places, trips]);

  const savePlace = async () => {
    const label = (data?.route?.destination?.label ?? destQ).trim();
    if (!label) return;
    const next = places.includes(label) ? places : [...places, label].slice(-20);
    await updateProfile({ preferences: { ...(profile?.preferences ?? {}), places: next } });
    setPlaceSaved(true);
    window.setTimeout(() => setPlaceSaved(false), 2000);
  };

  // Periodic refresh while driving (location barely moves at traffic lights).
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Location watch (throttled — watchPosition fires constantly on the road).
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let lastSent = 0;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSent < 5000) return;
        lastSent = now;
        setLoc({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocError(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocError("denied");
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 25000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const load = useCallback(async () => {
    if (!loc || busy.current) return;
    const now = Date.now();
    if (now - lastFetch.current < 8000) return; // debounce: never hammer the feed
    busy.current = true;
    lastFetch.current = now;
    setLoading(true);
    const params = new URLSearchParams({
      mode,
      lat: loc.lat.toFixed(6),
      lon: loc.lon.toFixed(6),
      radius: String(radius),
    });
    if (mode === "route" && destQ) params.set("dest", destQ);
    try {
      const res = await fetch(`/api/waze?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as WazeData;
      setData(json);
      if (json.ok && sound) {
        const seen = announced.current;
        for (const a of json.alerts) {
          if (a.dist <= radius && !seen.has(a.id)) {
            seen.add(a.id);
            beep(audio);
          }
        }
        if (seen.size > 500) {
          // keep the announced-set bounded on long drives
          const keep = new Set([...seen].slice(-300));
          announced.current = keep;
        }
      }
    } catch {
      setData((d) => (d ? { ...d, ok: false, error: "network" } : null));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [loc, mode, destQ, radius, sound]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets loading, intentional
    void load();
  }, [load, tick]);

  const submitDest = () => {
    if (dest.trim()) {
      setDestQ(dest.trim());
      lastFetch.current = 0; // allow an immediate fetch for the new route
    }
  };

  const sorted = useMemo(() => {
    if (!data?.ok) return [];
    const list = [...data.alerts];
    if (data.mode === "route") list.sort((a, b) => a.along - b.along);
    else list.sort((a, b) => a.dist - b.dist);
    return list;
  }, [data]);

  const nearest = sorted[0] ?? null;
  const warned = !!nearest && nearest.dist <= radius;

  if (!loc && !locError) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={dr.title} subtitle={dr.subtitle} />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "around", label: dr.aroundMe },
              { value: "route", label: dr.onRoute },
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={String(radius)}
              onChange={(e) => setRadius(parseInt(e.target.value, 10))}
              className="h-9 w-auto px-2 text-xs"
              aria-label={dr.radius}
            >
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="icon"
              aria-label={dr.sound}
              title={dr.sound}
              onClick={() => setSound((s) => !s)}
            >
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || !loc}
              onClick={() => {
                lastFetch.current = 0;
                void load();
              }}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              {dr.refresh}
            </Button>
          </div>
        </div>

        {mode === "route" && (
          <>
            <div className="flex gap-2">
              <Input
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitDest()}
                placeholder={dr.destinationPlaceholder}
                aria-label={dr.destination}
              />
              <Button onClick={submitDest} disabled={!dest.trim()}>
                <RouteIcon className="h-4 w-4" />
                {dr.go}
              </Button>
              {data?.ok && data.route && (
                <Button variant="secondary" onClick={savePlace} disabled={placeSaved} title={dr.savePlace}>
                  {placeSaved ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
                  <span className="hidden sm:inline">{placeSaved ? dr.placeSaved : dr.savePlace}</span>
                </Button>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {dr.places}
                </span>
                {suggestions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setDest(p);
                      setDestQ(p);
                      lastFetch.current = 0;
                    }}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-indigo-400/60 hover:text-indigo-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-indigo-400/50 dark:hover:text-indigo-300"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {!loc && locError !== "denied" && (
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <LocateFixed className="h-3.5 w-3.5 animate-pulse" />
            {dr.locating}
          </p>
        )}
        {locError === "denied" && <p className="text-xs text-amber-600 dark:text-amber-400">{dr.locationDenied}</p>}
        {locError === "unsupported" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{dr.locationUnsupported}</p>
        )}
        {data?.ok && (
          <p className="text-[11px] text-zinc-500">
            {dr.lastUpdate}: {new Date(data.updatedAt).toLocaleTimeString()}
            {data.mode === "route" && data.route
              ? ` · ${fmtDistance(data.route.distanceM)} · ${Math.max(1, Math.round(data.route.durationS / 60))} min`
              : ""}
          </p>
        )}
      </Card>

      {data && !data.ok && (
        <Card className="border-amber-300/50 dark:border-amber-500/20">
          <p className="text-sm text-amber-700 dark:text-amber-300">{errorText(data.error, dr)}</p>
        </Card>
      )}

      {warned && nearest && (
        <Card className="flex items-center gap-3 border-red-300/60 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10">
          <TriangleAlert className="h-6 w-6 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {labelFor(nearest.type, dr)} {fmtDistance(nearest.dist)}
            </p>
            <p className="truncate text-xs text-red-500/80">
              {[nearest.street, nearest.city].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <WazeLink lat={nearest.lat} lon={nearest.lon} label={dr.openInWaze} />
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {loc && (
          <Card>
            <RadarCanvas
              center={loc}
              alerts={data?.ok ? data.alerts : []}
              route={data?.ok ? data.route : null}
              accuracy={loc.accuracy}
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3">
              {ALERT_TYPES.slice(0, 5).map((type) => (
                <span key={type} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: ALERT_COLORS[type] }} />
                  {labelFor(type, dr)}
                </span>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{dr.alerts}</h3>
            {data?.ok && <span className="text-xs text-zinc-500">{data.alerts.length}</span>}
          </div>
          {data?.ok && sorted.length === 0 ? (
            <EmptyState icon="🚗" title={dr.noAlerts} />
          ) : data?.ok ? (
            <div className="divide-y divide-line">
              {sorted.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: ALERT_COLORS[a.type] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {a.type === "police" ? (
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      ) : null}
                      {labelFor(a.type, dr)}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {[a.street, a.city].filter(Boolean).join(" · ") || "—"} · {ageText(a.ageMin, dr)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {fmtDistance(data.mode === "route" ? Math.abs(a.along - data.userAlong) : a.dist)}
                    </p>
                    {data.mode === "route" && (
                      <p className="text-[10px] text-zinc-500">
                        {a.along >= data.userAlong ? dr.ahead : dr.behind}
                      </p>
                    )}
                  </div>
                  <WazeLink lat={a.lat} lon={a.lon} label="" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 py-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-600">{dr.disclaimer}</p>
    </div>
  );
}
