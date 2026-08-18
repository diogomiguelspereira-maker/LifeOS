import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "./crypto";

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  google_email: string | null;
  calendar_id: string;
}

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  // Needed for the /oauth2/v2/userinfo endpoint (to show the connected email).
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleClient(): { id: string; secret: string } {
  return {
    id: process.env.GOOGLE_CLIENT_ID ?? "",
    secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  };
}

/** Absolute base URL of the app (env override, else request origin). */
export function appBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export function authUrl(baseUrl: string, state: string): string {
  const { id } = googleClient();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: `${baseUrl}/api/google/callback`,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchange(
  body: Record<string, string>
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const { id, secret } = googleClient();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }).toString(),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Exchange an authorization code for tokens and persist (encrypted).
 * baseUrl must match the one used to build the auth URL (request-derived).
 * Throws on any failure so callers never report a false success.
 */
export async function storeCode(
  supabase: SupabaseClient,
  userId: string,
  code: string,
  baseUrl: string
): Promise<string | null> {
  const { id, secret } = googleClient();
  const data = await exchange({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: `${baseUrl}/api/google/callback`,
    grant_type: "authorization_code",
  });
  if (!data.refresh_token) {
    throw new Error("no refresh_token returned — offline access not granted");
  }

  // Best-effort email lookup (the userinfo endpoint needs the email scope;
  // a failure here must not break the connection).
  let email: string | null = null;
  try {
    const me = (await googleGet(data.access_token, "https://www.googleapis.com/oauth2/v2/userinfo")) as {
      email?: string;
    };
    email = me.email ?? null;
  } catch (err) {
    console.error("google userinfo failed (ignored)", err);
  }

  const { error } = await supabase.from("google_tokens").upsert(
    {
      user_id: userId,
      access_token: encryptToken(data.access_token),
      refresh_token: encryptToken(data.refresh_token),
      expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      google_email: email,
      calendar_id: "primary",
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(`failed to store google tokens: ${error.message}`);
  return email;
}

/** Read + decrypt stored tokens, refreshing if expired. */
export async function getTokens(supabase: SupabaseClient, userId: string): Promise<GoogleTokens | null> {
  const { data } = await supabase.from("google_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;

  const access = decryptToken(data.access_token as string);
  const refresh = decryptToken(data.refresh_token as string);
  if (!access || !refresh) return null;

  let accessToken = access;
  let expiresAt = data.expires_at as string;
  if (new Date(expiresAt).getTime() - 60_000 < Date.now()) {
    const refreshed = await exchange({
      refresh_token: refresh,
      grant_type: "refresh_token",
    });
    accessToken = refreshed.access_token;
    expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
    await supabase
      .from("google_tokens")
      .update({ access_token: encryptToken(accessToken), expires_at: expiresAt })
      .eq("user_id", userId);
  }

  return {
    access_token: accessToken,
    refresh_token: refresh,
    expires_at: expiresAt,
    google_email: (data.google_email as string) ?? null,
    calendar_id: (data.calendar_id as string) ?? "primary",
  };
}

export async function googleGet(accessToken: string, url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`google get failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function googlePost(accessToken: string, url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`google post failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string | null;
  location?: string | null;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/** Map a Google event to our calendar_events shape. */
export function mapGoogleEvent(ev: GCalEvent): {
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  color: string;
  calendar_name: string;
  source: "google";
  google_event_id: string;
} {
  const allDay = !ev.start?.dateTime;
  const startAt = allDay
    ? new Date(`${ev.start!.date}T00:00:00`).toISOString()
    : new Date(ev.start!.dateTime!).toISOString();
  const endAt = allDay && ev.end?.date
    ? new Date(`${ev.end.date}T00:00:00`).toISOString()
    : ev.end?.dateTime
      ? new Date(ev.end.dateTime).toISOString()
      : null;
  return {
    title: ev.summary ?? "(sem título)",
    description: ev.description ?? null,
    location: ev.location ?? null,
    start_at: startAt,
    end_at: endAt,
    all_day: allDay,
    color: "#4285f4", // Google blue
    calendar_name: "Google Calendar",
    source: "google",
    google_event_id: ev.id,
  };
}
