import type { SupabaseClient } from "@supabase/supabase-js";
import { monthKey } from "./format";
import type {
  Account,
  AIMemory,
  Book,
  Budget,
  CalendarEvent,
  CareerGoal,
  Category,
  Contact,
  Course,
  DigitalAsset,
  Document,
  ExerciseLog,
  FinancialChallenge,
  FocusSession,
  Habit,
  HabitCompletion,
  IncomeSchedule,
  JobApplication,
  JournalEntry,
  MoneyTotals,
  NetWorthSnapshot,
  Note,
  Profile,
  Routine,
  SavingsGoal,
  SharedExpense,
  ShoppingItem,
  ShoppingList,
  Skill,
  SleepLog,
  StudySession,
  Subscription,
  Task,
  Transaction,
  Trip,
  TripItem,
  WaterLog,
  WellnessLog,
  WishlistItem,
} from "./types";

type SB = SupabaseClient;

export const api = {
  async profile(sb: SB): Promise<Profile | null> {
    const { data } = await sb.from("profiles").select("*").maybeSingle();
    return (data as Profile) ?? null;
  },

  async transactions(sb: SB, month?: string): Promise<Transaction[]> {
    let q = sb.from("transactions").select("*").order("date", { ascending: false });
    if (month) {
      const next = new Date(month);
      next.setMonth(next.getMonth() + 1);
      q = q.gte("date", month).lt("date", next.toISOString().slice(0, 10));
    }
    const { data } = await q;
    return (data as Transaction[]) ?? [];
  },

  async allTransactions(sb: SB, limit = 100): Promise<Transaction[]> {
    const { data } = await sb
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .limit(limit);
    return (data as Transaction[]) ?? [];
  },

  async accounts(sb: SB): Promise<Account[]> {
    const { data } = await sb
      .from("accounts")
      .select("*")
      .eq("is_archived", false)
      .order("created_at");
    return (data as Account[]) ?? [];
  },

  async categories(sb: SB): Promise<Category[]> {
    const { data } = await sb.from("categories").select("*").order("name");
    return (data as Category[]) ?? [];
  },

  async budget(sb: SB, month: string): Promise<Budget | null> {
    const { data } = await sb.from("budgets").select("*").eq("month", month).maybeSingle();
    return (data as Budget) ?? null;
  },

  async goals(sb: SB): Promise<SavingsGoal[]> {
    const { data } = await sb.from("savings_goals").select("*").order("created_at");
    return (data as SavingsGoal[]) ?? [];
  },

  async subscriptions(sb: SB): Promise<Subscription[]> {
    const { data } = await sb
      .from("subscriptions")
      .select("*")
      .eq("is_active", true)
      .order("created_at");
    return (data as Subscription[]) ?? [];
  },

  async tasks(sb: SB): Promise<Task[]> {
    const { data } = await sb.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false });
    return (data as Task[]) ?? [];
  },

  async events(sb: SB, start: string, end: string): Promise<CalendarEvent[]> {
    const { data } = await sb
      .from("calendar_events")
      .select("*")
      .gte("start_at", start)
      .lte("start_at", end)
      .order("start_at");
    return (data as CalendarEvent[]) ?? [];
  },

  async habits(sb: SB): Promise<Habit[]> {
    const { data } = await sb.from("habits").select("*").order("created_at");
    return (data as Habit[]) ?? [];
  },

  async completions(sb: SB, since?: string): Promise<HabitCompletion[]> {
    let q = sb.from("habit_completions").select("*");
    if (since) q = q.gte("date", since);
    const { data } = await q;
    return (data as HabitCompletion[]) ?? [];
  },

  async notes(sb: SB): Promise<Note[]> {
    const { data } = await sb
      .from("notes")
      .select("*")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false });
    return (data as Note[]) ?? [];
  },

  async journal(sb: SB): Promise<JournalEntry[]> {
    const { data } = await sb
      .from("journal_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .limit(60);
    return (data as JournalEntry[]) ?? [];
  },

  async contacts(sb: SB): Promise<Contact[]> {
    const { data } = await sb.from("contacts").select("*").order("name");
    return (data as Contact[]) ?? [];
  },

  /* ---------- finance intelligence ---------- */
  async netWorthSnapshots(sb: SB): Promise<NetWorthSnapshot[]> {
    const { data } = await sb.from("net_worth_snapshots").select("*").order("date", { ascending: true });
    return (data as NetWorthSnapshot[]) ?? [];
  },
  async incomeSchedule(sb: SB): Promise<IncomeSchedule[]> {
    const { data } = await sb.from("income_schedule").select("*").order("day_of_month");
    return (data as IncomeSchedule[]) ?? [];
  },
  async challenges(sb: SB): Promise<FinancialChallenge[]> {
    const { data } = await sb.from("financial_challenges").select("*").order("created_at");
    return (data as FinancialChallenge[]) ?? [];
  },

  /* ---------- shopping ---------- */
  async shoppingLists(sb: SB): Promise<ShoppingList[]> {
    const { data } = await sb.from("shopping_lists").select("*").order("created_at");
    return (data as ShoppingList[]) ?? [];
  },
  async shoppingItems(sb: SB): Promise<ShoppingItem[]> {
    const { data } = await sb.from("shopping_items").select("*").order("created_at");
    return (data as ShoppingItem[]) ?? [];
  },
  async wishlist(sb: SB): Promise<WishlistItem[]> {
    const { data } = await sb.from("wishlist_items").select("*").order("created_at");
    return (data as WishlistItem[]) ?? [];
  },

  /* ---------- focus ---------- */
  async focusSessions(sb: SB): Promise<FocusSession[]> {
    const { data } = await sb.from("focus_sessions").select("*").order("started_at", { ascending: false }).limit(100);
    return (data as FocusSession[]) ?? [];
  },
  async routines(sb: SB): Promise<Routine[]> {
    const { data } = await sb.from("routines").select("*").order("created_at");
    return (data as Routine[]) ?? [];
  },

  /* ---------- wellness ---------- */
  async sleepLogs(sb: SB, days = 30): Promise<SleepLog[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data } = await sb.from("sleep_logs").select("*").gte("date", since).order("date", { ascending: false });
    return (data as SleepLog[]) ?? [];
  },
  async waterLogs(sb: SB, days = 30): Promise<WaterLog[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data } = await sb.from("water_logs").select("*").gte("date", since).order("date", { ascending: false });
    return (data as WaterLog[]) ?? [];
  },
  async exerciseLogs(sb: SB, days = 60): Promise<ExerciseLog[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data } = await sb.from("exercise_logs").select("*").gte("date", since).order("date", { ascending: false });
    return (data as ExerciseLog[]) ?? [];
  },
  async wellnessLogs(sb: SB, days = 30): Promise<WellnessLog[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data } = await sb.from("wellness_logs").select("*").gte("date", since).order("date", { ascending: false });
    return (data as WellnessLog[]) ?? [];
  },

  /* ---------- career ---------- */
  async careerGoals(sb: SB): Promise<CareerGoal[]> {
    const { data } = await sb.from("career_goals").select("*").order("created_at");
    return (data as CareerGoal[]) ?? [];
  },
  async skills(sb: SB): Promise<Skill[]> {
    const { data } = await sb.from("skills").select("*").order("name");
    return (data as Skill[]) ?? [];
  },
  async jobApplications(sb: SB): Promise<JobApplication[]> {
    const { data } = await sb.from("job_applications").select("*").order("applied_date", { ascending: false });
    return (data as JobApplication[]) ?? [];
  },

  /* ---------- learning ---------- */
  async books(sb: SB): Promise<Book[]> {
    const { data } = await sb.from("books").select("*").order("created_at");
    return (data as Book[]) ?? [];
  },
  async courses(sb: SB): Promise<Course[]> {
    const { data } = await sb.from("courses").select("*").order("created_at");
    return (data as Course[]) ?? [];
  },
  async studySessions(sb: SB, days = 90): Promise<StudySession[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data } = await sb.from("study_sessions").select("*").gte("date", since).order("date", { ascending: false });
    return (data as StudySession[]) ?? [];
  },

  /* ---------- travel ---------- */
  async trips(sb: SB): Promise<Trip[]> {
    const { data } = await sb.from("trips").select("*").order("start_date", { ascending: true, nullsFirst: false });
    return (data as Trip[]) ?? [];
  },
  async tripItems(sb: SB, tripId: string): Promise<TripItem[]> {
    const { data } = await sb.from("trip_items").select("*").eq("trip_id", tripId).order("created_at");
    return (data as TripItem[]) ?? [];
  },

  /* ---------- social ---------- */
  async sharedExpenses(sb: SB): Promise<SharedExpense[]> {
    const { data } = await sb.from("shared_expenses").select("*").order("date", { ascending: false });
    return (data as SharedExpense[]) ?? [];
  },

  /* ---------- digital & docs ---------- */
  async digitalAssets(sb: SB): Promise<DigitalAsset[]> {
    const { data } = await sb.from("digital_assets").select("*").order("created_at");
    return (data as DigitalAsset[]) ?? [];
  },
  async documents(sb: SB): Promise<Document[]> {
    const { data } = await sb.from("documents").select("*").order("name");
    return (data as Document[]) ?? [];
  },

  /* ---------- AI memory ---------- */
  async aiMemory(sb: SB): Promise<AIMemory[]> {
    const { data } = await sb.from("ai_memory").select("*").order("category");
    return (data as AIMemory[]) ?? [];
  },
};

/* ---------- money math ---------- */

export function moneyTotals(
  accounts: Account[],
  transactions: Transaction[],
  profile: Profile | null
): MoneyTotals {
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const loans = accounts.filter((a) => a.type === "loan").reduce((s, a) => s + a.balance, 0);
  const netWorth = totalBalance - loans;
  const monthlyIncome = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const monthlyExpenses = Math.abs(
    transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  );
  const savingsRate = monthlyIncome > 0 ? Math.round((1 - monthlyExpenses / monthlyIncome) * 100) : 0;
  const available = monthlyIncome - monthlyExpenses + (profile?.savings ?? 0);
  return { totalBalance, netWorth, monthlyIncome, monthlyExpenses, savingsRate, available };
}

export function spendingByCategory(
  transactions: Transaction[],
  categories: Category[]
): { category: string; value: number; color: string; icon: string | null }[] {
  const map = new Map<string, { value: number; color: string; icon: string | null }>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const cat = categories.find((c) => c.id === t.category_id);
    const key = cat?.name ?? "Other";
    const cur = map.get(key) ?? { value: 0, color: cat?.color ?? "#94a3b8", icon: cat?.icon ?? null };
    cur.value += Math.abs(t.amount);
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.value - a.value);
}

export function currentMonthTransactions(transactions: Transaction[], now = new Date()): Transaction[] {
  const mk = monthKey(now);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextKey = next.toISOString().slice(0, 10);
  return transactions.filter((t) => t.date >= mk && t.date < nextKey);
}
