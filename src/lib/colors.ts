/**
 * Shared swatch palette for every color picker in the app
 * (calendar events, accounts, routines, goals, projects, habits…).
 * The first 8 colors keep the original defaults so existing data is unchanged.
 */
export const SWATCHES = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#64748b", // slate
];

/** Accent themes. Ids must match the [data-accent="…"] blocks in globals.css. */
export const ACCENTS = [
  { id: "indigo", color: "#6366f1" },
  { id: "violet", color: "#8b5cf6" },
  { id: "sky", color: "#0ea5e9" },
  { id: "emerald", color: "#10b981" },
  { id: "rose", color: "#f43f5e" },
  { id: "amber", color: "#f59e0b" },
  { id: "fuchsia", color: "#d946ef" },
  { id: "teal", color: "#14b8a6" },
  { id: "graphite", color: "#71717a" },
];

export const ACCENT_IDS = ACCENTS.map((a) => a.id);
