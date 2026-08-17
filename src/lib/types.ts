export type Currency = "EUR" | "USD" | "GBP" | "BRL" | "JPY";
export type Lang = "pt" | "en";

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  age_range: string | null;
  country: string | null;
  currency: Currency;
  monthly_income: number;
  typical_expenses: number;
  savings: number;
  work_schedule: string | null;
  theme: "dark" | "light";
  language: Lang;
  week_start: "monday" | "sunday";
  onboarding_completed: boolean;
  widget_layout: WidgetDef[];
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WidgetDef {
  id: string;
  visible: boolean;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: "cash" | "bank" | "savings" | "investment" | "credit" | "crypto" | "loan";
  balance: number;
  color: string;
  icon: string | null;
  is_archived: boolean;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: "expense" | "income";
  icon: string | null;
  color: string;
  monthly_budget: number | null;
  budget_type: "needs" | "wants" | null;
  is_custom: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string | null;
  category_id: string | null;
  amount: number;
  description: string;
  merchant: string | null;
  date: string;
  is_recurring: boolean;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  month: string;
  needs_limit: number;
  wants_limit: number;
  savings_target: number;
  investments_target: number;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  monthly_contribution: number;
  icon: string;
  color: string;
  category: string | null;
}

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  billing_cycle: "monthly" | "yearly" | "weekly";
  next_billing_date: string | null;
  category: string | null;
  is_active: boolean;
  is_unused: boolean;
  notes: string | null;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  status: "active" | "completed" | "archived";
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
  tags: string[];
  project_id: string | null;
  estimated_minutes: number | null;
  recurrence: string | null;
  reminder_at: string | null;
  completed_at: string | null;
}

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  target_per_week: number;
}

export interface HabitCompletion {
  id: string;
  user_id: string;
  habit_id: string;
  date: string;
  note: string | null;
}

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[];
  is_favorite: boolean;
  is_archived: boolean;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_date: string;
  content: string;
  mood: string | null;
  tags: string[];
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  color: string;
  calendar_name: string;
  source: "lifeos" | "google";
  google_event_id: string | null;
}

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  last_contacted: string | null;
  notes: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string;
  read: boolean;
  created_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface NovaResponse {
  reply: string;
  action?: NovaAction;
}

export interface NovaAction {
  kind:
    | "create_task"
    | "create_event"
    | "create_goal"
    | "create_note"
    | "create_reminder"
    | "create_transaction";
  payload: Record<string, unknown>;
}

export interface MoneyTotals {
  totalBalance: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  available: number;
}
