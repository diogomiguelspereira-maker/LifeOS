// Shared types/helpers for the Driving (Waze alerts) module.
// Alert data comes from Waze's public live-map feed (unofficial, may change).

export type WazeAlertType =
  | "police"
  | "camera"
  | "redlight"
  | "hazard"
  | "accident"
  | "jam"
  | "other";

export interface WazeAlert {
  id: string;
  type: WazeAlertType;
  lat: number;
  lon: number;
  /** Straight-line distance from the user, in meters. */
  dist: number;
  /** Route mode only: distance along the route polyline of the alert's projection, in meters. */
  along: number;
  ageMin: number;
  street: string | null;
  city: string | null;
  reliability: number | null;
}

export interface WazeRoute {
  polyline: [number, number][]; // [lat, lon]
  distanceM: number;
  durationS: number;
  destination: { lat: number; lon: number; label: string };
}

export interface WazeData {
  ok: boolean;
  mode: "around" | "route";
  center: { lat: number; lon: number };
  alerts: WazeAlert[];
  route: WazeRoute | null;
  /** Route mode only: how far along the polyline the user currently is (m). */
  userAlong: number;
  /** Where the alerts came from: Apify actor, Waze live feed or OSM fixed cameras. */
  source?: "apify" | "waze" | "osm";
  error?: "params" | "waze" | "geocode" | "route" | "network";
  updatedAt: string;
}

const EARTH_M = 6371000;

export function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(s));
}

/** Deep link that opens Waze navigation to a point (works on mobile + desktop). */
export function wazeUrl(lat: number, lon: number): string {
  return `https://waze.com/ul?ll=${lon.toFixed(6)},${lat.toFixed(6)}&navigate=yes`;
}

export function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
}

export function fmtAge(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  return `${Math.round(min / 60)} h`;
}

/** Decode an encoded polyline (OSRM/Google "encoded polyline algorithm" format 5). */
export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dLat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLon = result & 1 ? ~(result >> 1) : result >> 1;
    lon += dLon;
    coords.push([lat / 1e5, lon / 1e5]);
  }
  return coords;
}

/**
 * Distance (m) from a point to a polyline and how far along the polyline the
 * closest point sits. Uses an equirectangular projection scaled to meters —
 * accurate enough at the scales Waze alerts live at.
 */
export function distanceToPolyline(
  lat: number,
  lon: number,
  polyline: [number, number][]
): { min: number; along: number } {
  if (polyline.length === 0) return { min: Infinity, along: 0 };
  if (polyline.length === 1) {
    return { min: haversineM(lat, lon, polyline[0][0], polyline[0][1]), along: 0 };
  }
  let min = Infinity;
  let along = 0;
  let prevAlong = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const [aLat, aLon] = polyline[i];
    const [bLat, bLon] = polyline[i + 1];
    const segLen = haversineM(aLat, aLon, bLat, bLon);
    const d = pointToSegmentM(lat, lon, aLat, aLon, bLat, bLon);
    if (d < min) {
      min = d;
      // t = 0 → point at segment start; t = 1 → at segment end.
      const t = segLen > 0 ? closestT(lat, lon, aLat, aLon, bLat, bLon) : 0;
      along = prevAlong + Math.max(0, Math.min(1, t)) * segLen;
    }
    prevAlong += segLen;
  }
  return { min, along };
}

/** Meters per degree of longitude at a given latitude. */
export function lonMetersPerDeg(lat: number): number {
  return 111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180));
}

function closestT(lat: number, lon: number, aLat: number, aLon: number, bLat: number, bLon: number): number {
  const mx = lonMetersPerDeg(lat);
  const px = lon * mx;
  const py = lat * 111320;
  const ax = aLon * mx;
  const ay = aLat * 111320;
  const bx = bLon * mx;
  const by = bLat * 111320;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  return len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
}

function pointToSegmentM(lat: number, lon: number, aLat: number, aLon: number, bLat: number, bLon: number): number {
  // Clamp to the segment: a point that projects beyond an endpoint is measured
  // from that endpoint, otherwise collinear consecutive polyline segments would
  // all match points lying on their extended lines with wrong `along` values.
  const t = Math.max(0, Math.min(1, closestT(lat, lon, aLat, aLon, bLat, bLon)));
  const mx = lonMetersPerDeg(lat);
  const px = lon * mx;
  const py = lat * 111320;
  const ax = aLon * mx;
  const ay = aLat * 111320;
  const bx = bLon * mx;
  const by = bLat * 111320;
  const cx = ax + t * (bx - ax);
  const cy = ay + t * (by - ay);
  return Math.hypot(px - cx, py - cy);
}
