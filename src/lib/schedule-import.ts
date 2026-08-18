/**
 * Schedule table importer.
 *
 * Parses pasted tables in the format:
 *   | Data | Dia     | Horário         |
 *   | ---- | ------- | --------------- |
 *   | 14   | Sexta   | **15:00–20:00** |
 *   | 17   | Segunda | **V**           |
 *
 * Time ranges (15:00–20:00) become timed events — the title falls back to the
 * default title when the row has none. Codes (V, FC, FO…) become all-day events
 * with the code as title. The month is detected from the text (month names,
 * "14/08" dates, a 4-digit year) or falls back to the visible month.
 */

export interface ScheduleSlot {
  /** YYYY-MM-DD (local) */
  date: string;
  /** empty → use the default title chosen in the UI */
  title: string;
  start?: string; // "HH:MM"
  end?: string; // "HH:MM"
}

export interface ParsedSchedule {
  slots: ScheduleSlot[];
  /** rows that could not be understood */
  skipped: number;
  /** month detected from the text, if any */
  month: { year: number; month: number } | null;
}

const MONTH_NAMES: Record<string, number> = {
  // pt
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  // en
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  // es
  enero: 1, febrero: 2, marzo: 3, mayo: 5, junio: 6, julio: 7,
  septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  // fr
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, août: 8,
  septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

const HEADER_RE = /\b(data|dia|day|horário|horario|horaire|schedule|time|date|week)\b/;

const SKIP_TITLE_RE = /^(folga|off|livre|free|—|-+)$/i;

const pad2 = (n: string | number) => String(Number(n)).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

export function parseScheduleText(text: string, fallbackYear: number, fallbackMonth: number): ParsedSchedule {
  // normalize: en/em dashes → hyphen, strip markdown bold
  const norm = text.replace(/[–—]/g, "-").replace(/\*\*/g, "");

  // month / year detection across the whole text
  let year = fallbackYear;
  let month = fallbackMonth;
  let monthDetected = false;
  const yr = norm.match(/\b(20\d{2})\b/);
  if (yr) year = Number(yr[1]);
  const lower = norm.toLowerCase();
  for (const [name, m] of Object.entries(MONTH_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) {
      month = m;
      monthDetected = true;
      break;
    }
  }

  const slots: ScheduleSlot[] = [];
  let skipped = 0;

  for (const raw of norm.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const joined = cells.join(" ").toLowerCase();
    if (HEADER_RE.test(joined)) continue; // header row
    if (/^-+$/.test(cells.join(""))) continue; // separator row

    // --- day (first cell): "14", "14/08", "14/08/2026", "14 de agosto", "14 Ago" ---
    let day: number | null = null;
    let rowMonth = month;
    let rowYear = year;
    const first = cells[0];
    const dm = first.match(/^(\d{1,2})(?:\s*[/.\-]\s*(\d{1,2})(?:\s*[/.\-]\s*(\d{2,4}))?)?/);
    if (dm) {
      day = Number(dm[1]);
      if (dm[2]) {
        rowMonth = Number(dm[2]);
        monthDetected = true;
        month = rowMonth;
      }
      if (dm[3]) {
        rowYear = Number(dm[3]) < 100 ? 2000 + Number(dm[3]) : Number(dm[3]);
        year = rowYear;
      }
    }
    // month word inside the day cell ("14 de agosto", "14 Ago")
    if (day != null && !dm?.[2]) {
      const mm = first.toLowerCase().match(/\b([a-zç]{3,})\b/);
      if (mm && MONTH_NAMES[mm[1]]) {
        rowMonth = MONTH_NAMES[mm[1]];
        monthDetected = true;
      }
    }
    if (day == null || day < 1 || day > 31 || day > new Date(rowYear, rowMonth, 0).getDate()) {
      skipped++;
      continue;
    }

    // --- time / code (last cell) ---
    const lastCell = cells[cells.length - 1];
    const tm = lastCell.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (tm) {
      const start = `${pad2(tm[1])}:${tm[2]}`;
      const end = `${pad2(tm[3])}:${tm[4]}`;
      const before = lastCell.slice(0, lastCell.indexOf(tm[0])).trim();
      slots.push({ date: iso(rowYear, rowMonth, day), title: before, start, end });
    } else if (lastCell && !SKIP_TITLE_RE.test(lastCell)) {
      slots.push({ date: iso(rowYear, rowMonth, day), title: lastCell });
    }
  }

  return { slots, skipped, month: monthDetected ? { year, month } : null };
}

/** Example schedule used to pre-fill the import dialog. */
export const SCHEDULE_EXAMPLE = `| Data | Dia     | Horário         |
| ---- | ------- | --------------- |
| 14   | Sexta   | **15:00–20:00** |
| 15   | Sábado  | **18:00–23:00** |
| 16   | Domingo | **15:00–20:00** |
| 17   | Segunda | **V**           |
| 18   | Terça   | **FC**          |
| 19   | Quarta  | **FO**          |
| 20   | Quinta  | **17:00–22:00** |
| 21   | Sexta   | **18:00–23:00** |
| 22   | Sábado  | **18:00–23:00** |
| 23   | Domingo | **15:00–20:00** |
| 24   | Segunda | **V**           |
| 25   | Terça   | **FC**          |
| 26   | Quarta  | **FO**          |
| 27   | Quinta  | **17:00–22:00** |`;
