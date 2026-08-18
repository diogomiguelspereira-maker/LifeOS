import type { Account, IncomeSchedule, Subscription, Transaction } from "./types";

export interface Payday {
  date: Date;
  name: string;
  amount: number;
  days: number;
}

/** Next upcoming salary/freelance payment from the income schedule. */
export function nextPayday(
  schedule: IncomeSchedule[],
  from = new Date()
): Payday | null {
  const active = schedule.filter((s) => s.active);
  if (!active.length) return null;
  let best: Payday | null = null;
  for (const s of active) {
    let d = new Date(from.getFullYear(), from.getMonth(), s.day_of_month);
    if (d < from) d = new Date(from.getFullYear(), from.getMonth() + 1, s.day_of_month);
    const days = Math.ceil((d.getTime() - from.getTime()) / 86400000);
    if (!best || days < best.days) {
      best = { date: d, name: s.name, amount: s.amount, days };
    }
  }
  return best;
}

/** Income expected between now and the next payday (excluding the payday itself). */
function incomeUntilPayday(schedule: IncomeSchedule[], from: Date, until: Date): number {
  let total = 0;
  for (const s of schedule) {
    if (!s.active) continue;
    let d = new Date(from.getFullYear(), from.getMonth(), s.day_of_month);
    if (d < from) d = new Date(from.getFullYear(), from.getMonth() + 1, s.day_of_month);
    while (d < until) {
      total += s.amount;
      d = new Date(d.getFullYear(), d.getMonth() + 1, s.day_of_month);
    }
  }
  return total;
}

/** Recurring expenses (subscriptions) due before a given date. */
function billsUntil(subs: Subscription[], from: Date, until: Date): number {
  let total = 0;
  for (const s of subs) {
    if (!s.is_active || !s.next_billing_date) continue;
    const next = new Date(s.next_billing_date);
    if (next >= from && next < until) total += s.amount;
  }
  return total;
}

/** How much the user can safely spend before the next payday. */
export function safeToSpend(
  balance: number,
  schedule: IncomeSchedule[],
  subs: Subscription[],
  dailySpend: number
): { amount: number; until: Date } {
  const payday = nextPayday(schedule);
  if (!payday) return { amount: Math.max(0, balance), until: new Date() };
  const income = incomeUntilPayday(schedule, new Date(), payday.date);
  const bills = billsUntil(subs, new Date(), payday.date);
  // keep a buffer: average daily spend until payday
  const buffer = dailySpend * Math.max(0, payday.days - 1);
  return { amount: Math.max(0, balance + income - bills - buffer), until: payday.date };
}

/** Average daily spend over the last N days (default 30). */
export function avgDailySpend(transactions: Transaction[], days = 30): number {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceKey = since.toISOString().slice(0, 10);
  const spent = transactions
    .filter((t) => t.amount < 0 && t.date >= sinceKey)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  return spent / days;
}

/** Cash flow forecast at day offsets [7, 30, 60, 90]. */
export function cashFlowForecast(
  balance: number,
  schedule: IncomeSchedule[],
  subs: Subscription[],
  avgSpend: number,
  from = new Date()
): { day: number; label: string; balance: number }[] {
  const offsets = [7, 30, 60, 90];
  const out: { day: number; label: string; balance: number }[] = [];
  let cursor = balance;
  let cursorDate = new Date(from);
  for (const off of offsets) {
    // simulate in weekly chunks
    const target = new Date(from.getTime() + off * 86400000);
    while (cursorDate < target) {
      const next = new Date(Math.min(target.getTime(), cursorDate.getTime() + 7 * 86400000));
      cursor += incomeUntilPayday(schedule, cursorDate, next) - billsUntil(subs, cursorDate, next) - avgSpend * ((next.getTime() - cursorDate.getTime()) / 86400000);
      cursorDate = next;
    }
    out.push({ day: off, label: `${off}d`, balance: Math.round(cursor) });
  }
  return out;
}

/** Net worth = sum of non-loan balances minus loans. */
export function netWorth(accounts: Account[]): number {
  const assets = accounts.filter((a) => a.type !== "loan").reduce((s, a) => s + a.balance, 0);
  const liabilities = accounts.filter((a) => a.type === "loan").reduce((s, a) => s + a.balance, 0);
  return assets - liabilities;
}

/** Recommended emergency fund (3–6 months of expenses). */
export function emergencyFund(monthlyExpenses: number, months = 3): number {
  return monthlyExpenses * months;
}

/** Recommended daily spending allowance until next payday. */
export function dailyLimit(amount: number, days: number): number {
  if (days <= 0) return amount;
  return amount / days;
}

/** Monthly cost of a subscription (yearly → /12, weekly → *4.33). */
export function monthlyCost(sub: Subscription): number {
  if (sub.billing_cycle === "yearly") return sub.amount / 12;
  if (sub.billing_cycle === "weekly") return sub.amount * 4.33;
  return sub.amount;
}

/** Cost per use. */
export function costPerUse(price: number, uses: number): number {
  if (uses <= 0) return price;
  return price / uses;
}
