export type OrderDir = "asc" | "desc";

/** Compare two unknown accessor values: numbers numerically, everything else as strings. Nulls sort last. */
function cmpValue(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const as = String(a).toLowerCase();
  const bs = String(b).toLowerCase();
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** Return a new array sorted by `key`, ascending or descending. Does not mutate the input. */
export function sortBy<T>(items: T[], key: (x: T) => unknown, order: OrderDir): T[] {
  const sorted = [...items].sort((a, b) => cmpValue(key(a), key(b)));
  return order === "desc" ? sorted.reverse() : sorted;
}
