export type Currency = "EUR" | "USD" | "GBP" | "BRL" | "JPY" | "CHF" | "CAD";
export type Lang = "pt" | "en" | "es" | "fr";

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
  theme: "dark" | "light" | "system";
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
  project_id: string | null;
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
  project_id: string | null;
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
  to_cancel: boolean;
  notes: string | null;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  budget: number | null;
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
  parent_task_id: string | null;
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
    | "create_transaction"
    | "create_plan";
  payload: Record<string, unknown>;
}

export interface AiActionLog {
  id: string;
  user_id: string;
  action: string;
  summary: string;
  undo_payload: Record<string, unknown>;
  created_at: string;
}

export interface NetWorthSnapshot {
  id: string;
  user_id: string;
  date: string;
  net_worth: number;
}

export interface IncomeSchedule {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  day_of_month: number;
  type: "salary" | "freelance" | "bonus" | "other";
  active: boolean;
}

export interface FinancialChallenge {
  id: string;
  user_id: string;
  name: string;
  kind: "no_purchases" | "save_amount" | "cook_home" | "no_delivery" | "custom";
  target: number;
  unit: string;
  start_date: string;
  end_date: string;
  completed: boolean;
}

export interface ShoppingList {
  id: string;
  user_id: string;
  name: string;
  category: string;
}

export interface ShoppingItem {
  id: string;
  user_id: string;
  list_id: string | null;
  name: string;
  quantity: number;
  checked: boolean;
  price: number | null;
  priority: "critical" | "high" | "medium" | "low";
}

export interface WishlistItem {
  id: string;
  user_id: string;
  name: string;
  price: number | null;
  url: string | null;
  priority: "critical" | "high" | "medium" | "low";
  category: string | null;
  desired_date: string | null;
  notes: string | null;
  purchased: boolean;
}

export interface FocusSession {
  id: string;
  user_id: string;
  task_id: string | null;
  kind: string;
  started_at: string;
  minutes: number;
  notes: string | null;
}

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  time_of_day: string;
  icon: string;
  color: string;
  days: "daily" | "weekdays" | "weekend";
  start_time: string; // HH:MM local
  items: { text: string; minutes: number }[]; // legacy (kept for compat)
  active: boolean;
}

export interface SleepLog {
  id: string;
  user_id: string;
  date: string;
  hours: number;
  quality: number | null;
  bedtime: string | null;
  wake_time: string | null;
}

export interface WaterLog {
  id: string;
  user_id: string;
  date: string;
  glasses: number;
}

export interface ExerciseLog {
  id: string;
  user_id: string;
  date: string;
  type: string;
  duration_minutes: number;
  calories: number | null;
  notes: string | null;
}

export interface WellnessLog {
  id: string;
  user_id: string;
  date: string;
  mood: number | null;
  energy: number | null;
  notes: string | null;
}

export interface CareerGoal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  timeline: string | null;
  status: string;
}

export interface Skill {
  id: string;
  user_id: string;
  name: string;
  level: number;
  target_level: number;
  category: string | null;
}

export interface JobApplication {
  id: string;
  user_id: string;
  company: string;
  position: string;
  applied_date: string;
  status: "applied" | "interview" | "offer" | "rejected" | "withdrawn";
  interview_date: string | null;
  salary: number | null;
  notes: string | null;
}

export interface Book {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  status: "want" | "reading" | "finished";
  rating: number | null;
  started_at: string | null;
  finished_at: string | null;
  notes: string | null;
}

export interface Course {
  id: string;
  user_id: string;
  name: string;
  platform: string | null;
  progress: number;
  hours: number;
  status: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  date: string;
  minutes: number;
  subject: string | null;
  notes: string | null;
}

export interface Trip {
  id: string;
  user_id: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  status: "planned" | "booked" | "completed";
  notes: string | null;
}

export interface TripItem {
  id: string;
  user_id: string;
  trip_id: string;
  type: "flight" | "hotel" | "activity" | "restaurant" | "packing" | "other";
  title: string;
  cost: number | null;
  datetime: string | null;
  checked: boolean;
}

export interface SharedExpense {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  paid_by: string;
  participants: string[];
  date: string;
  settled: boolean;
}

export interface DigitalAsset {
  id: string;
  user_id: string;
  type: "device" | "license" | "domain" | "service" | "cloud";
  name: string;
  details: string | null;
  purchase_date: string | null;
  expiry_date: string | null;
  cost: number | null;
  notes: string | null;
}

export interface Document {
  id: string;
  user_id: string;
  name: string;
  category: string;
  number: string | null;
  expiry_date: string | null;
  notes: string | null;
}

export interface AIMemory {
  id: string;
  user_id: string;
  category: string;
  key: string;
  value: string;
}

export interface RoutineStep {
  id: string;
  user_id: string;
  routine_id: string;
  title: string;
  time: string; // HH:MM local
  duration_minutes: number;
  order: number;
  created_at: string;
}

export interface RoutineCompletion {
  id: string;
  user_id: string;
  step_id: string;
  date: string; // YYYY-MM-DD
}

export interface MoneyTotals {
  totalBalance: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  available: number;
}
