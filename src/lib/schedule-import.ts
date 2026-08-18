/**
 * One-off schedule import (August 2026).
 * Days with a code (V / FC / FO) are imported as all-day events with the code as title.
 * Timed days use their local start/end times.
 * Reuse this file to import a different schedule: keep the shape, change the entries.
 */
export interface ScheduleSlot {
  /** YYYY-MM-DD (local) */
  date: string;
  title: string;
  start?: string; // "HH:MM"
  end?: string; // "HH:MM"
}

export const SCHEDULE_SLOTS: ScheduleSlot[] = [
  { date: "2026-08-14", title: "Trabalho", start: "15:00", end: "20:00" },
  { date: "2026-08-15", title: "Trabalho", start: "18:00", end: "23:00" },
  { date: "2026-08-16", title: "Trabalho", start: "15:00", end: "20:00" },
  { date: "2026-08-17", title: "V" },
  { date: "2026-08-18", title: "FC" },
  { date: "2026-08-19", title: "FO" },
  { date: "2026-08-20", title: "Trabalho", start: "17:00", end: "22:00" },
  { date: "2026-08-21", title: "Trabalho", start: "18:00", end: "23:00" },
  { date: "2026-08-22", title: "Trabalho", start: "18:00", end: "23:00" },
  { date: "2026-08-23", title: "Trabalho", start: "15:00", end: "20:00" },
  { date: "2026-08-24", title: "V" },
  { date: "2026-08-25", title: "FC" },
  { date: "2026-08-26", title: "FO" },
  { date: "2026-08-27", title: "Trabalho", start: "17:00", end: "22:00" },
];

export const SCHEDULE_COLOR = "#6366f1";

export interface ImportEvent {
  key: string; // `${date}|${title}` — used to skip duplicates
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  color: string;
}

export function scheduleToEvents(): ImportEvent[] {
  return SCHEDULE_SLOTS.map((slot) => {
    const [y, m, d] = slot.date.split("-").map(Number);
    const startAt = slot.start
      ? new Date(y, m - 1, d, ...slot.start.split(":").map(Number))
      : new Date(y, m - 1, d, 0, 0, 0, 0);
    const endAt = slot.end
      ? new Date(y, m - 1, d, ...slot.end.split(":").map(Number))
      : null;
    return {
      key: `${slot.date}|${slot.title}`,
      title: slot.title,
      startAt,
      endAt,
      allDay: !slot.start,
      color: SCHEDULE_COLOR,
    };
  });
}
