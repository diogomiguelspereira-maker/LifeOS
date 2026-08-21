import { createHash, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time compare of the presented secret against a stored token. */
function safeEqual(a: string, b: string): boolean {
  const da = digest(a);
  const db = digest(b);
  if (da.length !== db.length) return false;
  return timingSafeEqual(da, db);
}

/**
 * Resolve an integration token (`Authorization: Bearer …`) to a user id.
 * Hashes stored tokens so a DB leak never exposes working secrets.
 */
export async function findUserByIntegrationToken(
  supabase: SupabaseClient,
  presented: string
): Promise<string | null> {
  if (!presented) return null;
  const { data } = await supabase.from("integration_tokens").select("user_id, token").limit(1000);
  const rows = (data as { user_id: string; token: string }[] | null) ?? [];
  for (const row of rows) {
    if (safeEqual(row.token, presented)) {
      await supabase
        .from("integration_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("token", row.token);
      return row.user_id;
    }
  }
  return null;
}

export function bearerToken(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}
