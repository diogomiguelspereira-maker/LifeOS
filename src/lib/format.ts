export function formatMoney(amount: number, currency: string = "EUR"): string {
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatDate(date: string | Date, lang: "pt" | "en" = "pt"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(lang === "pt" ? "pt-PT" : "en-GB", {
    day: "numeric",
    month: "short",
  }).format(d);
}

export function formatDateLong(date: string | Date, lang: "pt" | "en" = "pt"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(lang === "pt" ? "pt-PT" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

export function formatTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(d);
}

export function greeting(date = new Date(), lang: string = "pt"): string {
  const h = date.getHours();
  if (lang === "en") {
    if (h < 6) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 20) return "Good afternoon";
    return "Good evening";
  }
  if (lang === "es") {
    if (h < 6) return "Buenas noches";
    if (h < 12) return "Buenos días";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  }
  if (lang === "fr") {
    if (h < 6) return "Bonne nuit";
    if (h < 12) return "Bonjour";
    if (h < 20) return "Bon après-midi";
    return "Bonsoir";
  }
  if (h < 6) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 20) return "Boa tarde";
  return "Boa noite";
}

export function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export function monthKey(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d.toISOString().slice(0, 10);
}

export function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
