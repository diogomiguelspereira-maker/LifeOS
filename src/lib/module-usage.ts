// Tracks how often each /app module is opened. Usage is stored in the user
// profile's `preferences.moduleUsage` so it syncs across devices.

export function moduleHref(pathname: string): string | null {
  const match = pathname.match(/^\/app\/([^/]+)/);
  return match ? `/app/${match[1]}` : null;
}

export function getModuleUsage(
  preferences?: Record<string, unknown> | null
): Record<string, number> {
  const usage = preferences?.moduleUsage;
  if (usage && typeof usage === "object" && !Array.isArray(usage)) {
    return usage as Record<string, number>;
  }
  return {};
}

export function incrementUsage(
  usage: Record<string, number>,
  href: string
): Record<string, number> {
  return { ...usage, [href]: (usage[href] ?? 0) + 1 };
}
