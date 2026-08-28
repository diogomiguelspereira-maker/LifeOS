import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bearerToken, findUserByIntegrationToken } from "@/lib/integrations";
import {
  decodePolyline,
  distanceToPolyline,
  haversineM,
  lonMetersPerDeg,
  type WazeAlert,
  type WazeAlertType,
  type WazeRoute,
} from "@/lib/waze";

export const runtime = "nodejs";

// Primary source: Waze's own public live-map feed (unofficial, no key, can be
// bot-blocked — see README "Conduzir"). Fallback: OpenStreetMap fixed speed
// cameras via the free Overpass API, so the radar part keeps working even when
// Waze blocks the request.
const WAZE_ENDPOINT = "https://www.waze.com/live-map/api/georss";
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const OSRM_ENDPOINT = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const APIFY_ENDPOINT = "https://api.apify.com/v2/acts";
const APIFY_DEFAULT_ACTOR = "burbn/waze-traffic-scraper";

const CORRIDOR_M = 1500; // route mode: keep alerts within this distance of the polyline
const MAX_RADIUS = 20000;
const FETCH_TIMEOUT_MS = 15000;

interface RawAlert {
  id?: string;
  type?: string;
  subtype?: string;
  pubMillis?: number;
  location?: { y?: number; x?: number };
  latitude?: number;
  longitude?: number;
  street?: string | null;
  city?: string | null;
  reliability?: number | null;
}

interface BBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** One row of the burbn/waze-traffic-scraper dataset. */
interface ApifyRow {
  alert_id?: string | number;
  type?: string;
  data_type?: string;
  latitude?: number;
  longitude?: number;
  street?: string | null;
  city?: string | null;
  publish_datetime_utc?: string;
  alert_reliability?: number;
}

function regionFor(lat: number, lon: number): "na" | "il" | "row" {
  if (lat >= 24 && lat <= 50 && lon >= -135 && lon <= -60) return "na";
  if (lat >= 29 && lat <= 34 && lon >= 34 && lon <= 36) return "il";
  return "row";
}

async function fetchWaze(box: BBox, env: string): Promise<RawAlert[]> {
  const url = `${WAZE_ENDPOINT}?top=${box.top}&bottom=${box.bottom}&left=${box.left}&right=${box.right}&env=${env}&types=alerts`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      referer: "https://www.waze.com/live-map",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`waze http ${res.status}`);
  const json = await res.json();
  const alerts: RawAlert[] = Array.isArray(json)
    ? json
    : Array.isArray((json as { alerts?: unknown })?.alerts)
      ? (json as { alerts: RawAlert[] }).alerts
      : [];
  return alerts;
}

/** Fixed speed cameras from OpenStreetMap (fallback when Waze is blocked). */
/**
 * Real-time alerts via an Apify Waze actor (burbn/waze-traffic-scraper) —
 * works on Apify's free plan ($5/month credits) and survives Waze's bot
 * protection. Configure with APIFY_TOKEN (and optionally APIFY_ACTOR_ID).
 */
async function fetchApify(box: BBox): Promise<WazeAlert[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("apify not configured");
  const actor = (process.env.APIFY_ACTOR_ID ?? APIFY_DEFAULT_ACTOR).replace("/", "~");
  const url = `${APIFY_ENDPOINT}/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=60`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "LifeOS/0.1 (personal life app)",
    },
    body: JSON.stringify({
      bottom_left: `${box.bottom},${box.left}`,
      top_right: `${box.top},${box.right}`,
      max_alerts: 50,
      max_jams: 0,
      alert_types: [],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(70_000),
  });
  if (!res.ok) throw new Error(`apify http ${res.status}`);
  const rows = (await res.json()) as ApifyRow[];
  return rows
    .filter(
      (r) =>
        (r.data_type ?? "alert") !== "jam" &&
        typeof r.latitude === "number" &&
        typeof r.longitude === "number"
    )
    .map((r) => ({
      id: `apify-${r.alert_id ?? `${r.latitude}-${r.longitude}`}`,
      type: mapType(r.type ?? ""),
      lat: r.latitude as number,
      lon: r.longitude as number,
      dist: 0,
      along: 0,
      ageMin: r.publish_datetime_utc
        ? Math.max(0, (Date.now() - new Date(r.publish_datetime_utc).getTime()) / 60000)
        : 0,
      street: r.street ?? null,
      city: r.city ?? null,
      reliability: typeof r.alert_reliability === "number" ? r.alert_reliability : null,
    }));
}

async function fetchOsmCameras(box: BBox): Promise<{ id: number; lat: number; lon: number; name: string | null }[]> {
  const query = `[out:json][timeout:20];(node["highway"="speed_camera"](${box.bottom},${box.left},${box.top},${box.right}););out;`;
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "LifeOS/0.1 (personal life app)",
    },
    body: `data=${encodeURIComponent(query)}`,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`overpass http ${res.status}`);
  const json = (await res.json()) as {
    elements?: { type?: string; id?: number; lat?: number; lon?: number; tags?: { name?: string } }[];
  };
  const elements = json.elements ?? [];
  return elements
    .filter((e) => typeof e.lat === "number" && typeof e.lon === "number")
    .map((e) => ({
      id: e.id ?? 0,
      lat: e.lat as number,
      lon: e.lon as number,
      name: e.tags?.name ?? null,
    }));
}

function mapType(t: string): WazeAlertType {
  const u = (t || "").toUpperCase();
  if (u.includes("POLICE")) return "police";
  if (u.includes("RED_LIGHT") || u.includes("REDLIGHT")) return "redlight";
  if (u.includes("CAMERA")) return "camera";
  if (u.includes("ACCIDENT")) return "accident";
  if (u.includes("JAM")) return "jam";
  if (u.includes("HAZARD") || u.includes("ROAD_CLOSED")) return "hazard";
  return "other";
}

function normalize(raw: RawAlert): WazeAlert | null {
  const lat = raw.location?.y ?? raw.latitude;
  const lon = raw.location?.x ?? raw.longitude;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  const pubMillis = typeof raw.pubMillis === "number" ? raw.pubMillis : Date.now();
  return {
    id: raw.id ?? `${pubMillis}-${lat}-${lon}`,
    type: mapType(raw.type ?? ""),
    lat,
    lon,
    dist: 0,
    along: 0,
    ageMin: Math.max(0, (Date.now() - pubMillis) / 60000),
    street: raw.street ?? null,
    city: raw.city ?? null,
    reliability: typeof raw.reliability === "number" ? raw.reliability : null,
  };
}

/** Finalize raw alerts: distances, corridor filter (route mode), sorting. */
function finalize(
  raw: WazeAlert[],
  center: { lat: number; lon: number },
  corridor: [number, number][] | null,
  radius: number
): WazeAlert[] {
  if (corridor && corridor.length > 1) {
    const projected = raw.map((a) => {
      const { min, along } = distanceToPolyline(a.lat, a.lon, corridor);
      return { alert: a, min, along };
    });
    return projected
      .filter((p) => p.min <= CORRIDOR_M)
      .map((p) => ({ ...p.alert, dist: haversineM(center.lat, center.lon, p.alert.lat, p.alert.lon), along: p.along }))
      .sort((a, b) => a.along - b.along);
  }
  return raw
    .map((a) => ({ ...a, dist: haversineM(center.lat, center.lon, a.lat, a.lon) }))
    .filter((a) => a.dist <= radius * 1.2)
    .sort((a, b) => a.dist - b.dist);
}

async function geocode(q: string): Promise<{ lat: number; lon: number; label: string }> {
  const trimmed = q.trim();
  const coords = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (coords) {
    const lat = parseFloat(coords[1]);
    const lon = parseFloat(coords[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon, label: trimmed };
  }
  const url = `${NOMINATIM_ENDPOINT}?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "LifeOS/0.1 (personal life app)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("geocode");
  const list = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
  const first = Array.isArray(list) ? list[0] : undefined;
  if (!first) throw new Error("geocode");
  return {
    lat: parseFloat(first.lat),
    lon: parseFloat(first.lon),
    label: first.display_name ?? trimmed,
  };
}

async function getRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<{ polyline: [number, number][]; distanceM: number; durationS: number }> {
  const url = `${OSRM_ENDPOINT}/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=polyline&steps=false`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("route");
  const json = (await res.json()) as { routes?: { geometry?: string; distance?: number; duration?: number }[] };
  const r = json?.routes?.[0];
  if (!r?.geometry) throw new Error("route");
  return {
    polyline: decodePolyline(r.geometry),
    distanceM: r.distance ?? 0,
    durationS: r.duration ?? 0,
  };
}

function bad(code: "params" | "waze" | "geocode" | "route", center: { lat: number; lon: number } | null) {
  return NextResponse.json({
    ok: false,
    error: code,
    mode: "around",
    center: center ?? { lat: 0, lon: 0 },
    alerts: [],
    route: null,
    userAlong: 0,
    source: "waze",
    updatedAt: new Date().toISOString(),
  });
}

export async function GET(req: Request) {
  const supabase = await createClient();
  // Browser sessions use the Supabase cookie; native clients (the Android Auto
  // app) authenticate with a personal integration key (Definições → Automações).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? (await findUserByIntegrationToken(supabase, bearerToken(req)));
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const mode = sp.get("mode") === "route" ? "route" : "around";
  const lat = parseFloat(sp.get("lat") ?? "");
  const lon = parseFloat(sp.get("lon") ?? "");
  const radius = Math.min(MAX_RADIUS, Math.max(500, parseInt(sp.get("radius") ?? "2000", 10) || 2000));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return bad("params", null);
  }
  const center = { lat, lon };

  if (mode === "route" && !sp.get("dest")?.trim()) return bad("params", center);

  const env = regionFor(lat, lon);
  let route: WazeRoute | null = null;
  let userAlong = 0;
  let corridor: [number, number][] | null = null;
  let box: BBox;

  try {
    if (mode === "around") {
      box = {
        top: lat + radius / 111320,
        bottom: lat - radius / 111320,
        left: lon - radius / lonMetersPerDeg(lat),
        right: lon + radius / lonMetersPerDeg(lat),
      };
    } else {
      const dest = await geocode(sp.get("dest")!.trim());
      const r = await getRoute(lat, lon, dest.lat, dest.lon);
      route = {
        polyline: r.polyline,
        distanceM: r.distanceM,
        durationS: r.durationS,
        destination: dest,
      };
      corridor = r.polyline;
      let top = -90;
      let bottom = 90;
      let left = 180;
      let right = -180;
      for (const [plat, plon] of r.polyline) {
        top = Math.max(top, plat);
        bottom = Math.min(bottom, plat);
        left = Math.min(left, plon);
        right = Math.max(right, plon);
      }
      const padLat = CORRIDOR_M / 111320;
      const padLon = CORRIDOR_M / lonMetersPerDeg(lat);
      box = { top: top + padLat, bottom: bottom - padLat, left: left - padLon, right: right + padLon };
      userAlong = distanceToPolyline(lat, lon, r.polyline).along;
    }
  } catch (e) {
    const code = mode === "route" && !route ? (e instanceof Error && e.message === "geocode" ? "geocode" : "route") : "waze";
    return bad(code, center);
  }

  // Alerts: Apify (when configured) or direct Waze feed first; OSM fixed
  // cameras as fallback. All sources feed the same normalized list.
  let alerts: WazeAlert[] = [];
  let source: "apify" | "waze" | "osm" = "waze";
  const useApify = !!process.env.APIFY_TOKEN;
  try {
    if (useApify) {
      source = "apify";
      const raw = await fetchApify(box);
      alerts = finalize(raw, center, corridor, radius);
    } else {
      const raw = await fetchWaze(box, env);
      alerts = finalize(raw.map(normalize).filter((a): a is WazeAlert => a !== null), center, corridor, radius);
    }
  } catch {
    try {
      const cameras = await fetchOsmCameras(box);
      source = "osm";
      alerts = finalize(
        cameras.map((c) => ({
          id: `osm-${c.id}`,
          type: "camera" as WazeAlertType,
          lat: c.lat,
          lon: c.lon,
          dist: 0,
          along: 0,
          ageMin: -1, // permanent installation
          street: c.name,
          city: null,
          reliability: null,
        })),
        center,
        corridor,
        radius
      );
    } catch {
      return bad("waze", center);
    }
  }

  // Defensive dedupe + keep only the nearest ones (UI shows ~40 max anyway).
  const seen = new Set<string>();
  alerts = alerts
    .filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    })
    .slice(0, 40);

  return NextResponse.json({
    ok: true,
    mode,
    center,
    alerts,
    route,
    userAlong,
    source,
    updatedAt: new Date().toISOString(),
  });
}
