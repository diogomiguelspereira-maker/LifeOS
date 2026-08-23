"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  GripHorizontal,
  ImageIcon,
  Lightbulb,
  Link2,
  Pencil,
  Plus,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api, currentMonthTransactions, moneyTotals } from "@/lib/api";
import { canAfford, costPerUse, safeToSpend, avgDailySpend, nextPayday, type AffordResult } from "@/lib/finance";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney } from "@/lib/format";
import type { WishlistItem, WishlistShare } from "@/lib/types";
import { cn } from "@/lib/cn";

const PRIORITIES = ["critical", "high", "medium", "low"] as const;
const PRIORITY_COLORS: Record<string, "red" | "amber" | "blue" | "zinc"> = { critical: "red", high: "amber", medium: "blue", low: "zinc" };
const PRIORITY_ICONS: Record<string, string> = { critical: "🔥", high: "⭐", medium: "💡", low: "🤔" };

type Tab = "wishlist" | "shared";

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function WishlistPage() {
  const { t, currency } = useApp();
  const supabase = useSupabase();
  const [tab, setTab] = useState<Tab>("wishlist");
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);
  const [affordItem, setAffordItem] = useState<WishlistItem | null>(null);
  const [affordResult, setAffordResult] = useState<AffordResult | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "wanted" | "purchased">("all");
  // Pre-fill form after URL scrape
  const [prefill, setPrefill] = useState<{ name: string; price: string; image: string; url: string } | null>(null);

  const load = useCallback(async () => {
    const ws = await api.wishlist(supabase);
    setItems(ws);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Financial context
  const [moneyCtx, setMoneyCtx] = useState<{ available: number; safe: number; fundTarget: number; fundCurrent: number; income: number; savingsRate: number } | null>(null);
  useEffect(() => {
    (async () => {
      const [tx, acc, profile, subs, income] = await Promise.all([
        api.allTransactions(supabase, 300),
        api.accounts(supabase),
        (async () => (await supabase.from("profiles").select("*").maybeSingle())?.data)(),
        api.subscriptions(supabase),
        api.incomeSchedule(supabase),
      ]);
      const monthTx = currentMonthTransactions(tx);
      const totals = moneyTotals(acc, monthTx, profile as never);
      const payday = nextPayday(income);
      const safe = safeToSpend(totals.totalBalance, income, subs, avgDailySpend(tx));
      const fundCurrent = (profile as { savings?: number } | null)?.savings ?? 0;
      const fundTarget = (totals.monthlyExpenses || (profile as { typical_expenses?: number } | null)?.typical_expenses || 0) * 3;
      setMoneyCtx({ available: totals.available, safe: Math.round(safe.amount), fundTarget, fundCurrent, income: totals.monthlyIncome, savingsRate: totals.savingsRate });
    })();
  }, [supabase]);

  async function scrapeProduct() {
    if (!urlInput.trim()) return;
    setScraping(true);
    setScrapeError(null);
    try {
      const res = await fetch("/api/wishlist/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; name?: string | null; price?: string | null; image?: string | null; error?: string; hint?: string };
      if (!res.ok || !data.ok) {
        setScrapeError(data.error === "timeout" ? t.wishlist.scrapeTimeout : (data.hint ?? t.wishlist.scrapeFailed));
        setScraping(false);
        return;
      }
      // Switch to manual mode with pre-filled fields so the user can verify & adjust
      setPrefill({
        name: data.name || "",
        price: (data.price ?? "").match(/([\d.,]+)/)?.[1]?.replace(",", ".") ?? "",
        image: data.image ?? "",
        url: urlInput.trim(),
      });
      setUrlMode(false);
      setUrlInput("");
      setScrapeError(null);
    } catch {
      setScrapeError(t.wishlist.scrapeFailed);
    }
    setScraping(false);
  }

  async function removeItem(id: string) {
    await supabase.from("wishlist_items").delete().eq("id", id);
    load();
  }

  async function togglePurchased(item: WishlistItem) {
    await supabase.from("wishlist_items").update({ purchased: !item.purchased }).eq("id", item.id);
    load();
  }

  async function updateItem(item: WishlistItem, updates: Partial<WishlistItem>) {
    await supabase.from("wishlist_items").update(updates).eq("id", item.id);
    load();
  }

  function checkAfford(w: WishlistItem) {
    if (!w.price || !moneyCtx) return;
    setAffordItem(w);
    setAffordResult(canAfford(w.price, {
      available: moneyCtx.available,
      safeToSpend: moneyCtx.safe,
      emergencyFundTarget: moneyCtx.fundTarget,
      emergencyFundCurrent: moneyCtx.fundCurrent,
      monthlyIncome: moneyCtx.income,
      savingsRate: moneyCtx.savingsRate,
    }));
  }

  async function createGoalFromWish(w: WishlistItem) {
    await supabase.from("savings_goals").insert({
      name: w.name,
      target_amount: w.price ?? 0,
      current_amount: 0,
      icon: "🛍️",
    });
    setAffordItem(null);
    setAffordResult(null);
  }

  const filtered = useMemo(() => {
    if (filter === "purchased") return items.filter((i) => i.purchased);
    if (filter === "wanted") return items.filter((i) => !i.purchased);
    return items;
  }, [items, filter]);

  const wantedTotal = items.filter((i) => !i.purchased).reduce((s, i) => s + (i.price ?? 0), 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.wishlist.title}
        subtitle={t.wishlist.subtitle}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t.wishlist.share}</span>
            </Button>
            <Button onClick={() => { setUrlMode(false); setEditingItem(null); setAddOpen(true); }}>
              <Plus className="h-4 w-4" />
              {t.wishlist.add}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {(["all", "wanted", "purchased"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                filter === f ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-300" : "border-white/10 text-zinc-400 hover:bg-white/5"
              )}
            >
              {t.wishlist[f]}
            </button>
          ))}
        </div>
        {wantedTotal > 0 && filter !== "purchased" && (
          <Badge color="violet">
            {t.wishlist.total}: {formatMoney(wantedTotal, currency)}
          </Badge>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="⭐"
          title={filter === "purchased" ? t.wishlist.emptyPurchased : t.wishlist.empty}
          subtitle={filter === "purchased" ? undefined : t.wishlist.emptyHint}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <Card key={item.id} className={cn("group flex flex-col transition", item.purchased && "opacity-60")}>
              {/* Product image */}
              {item.image ? (
                <div className="relative -mx-4 -mt-4 mb-3 overflow-hidden rounded-t-2xl bg-zinc-800/50">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="aspect-video w-full object-contain p-2"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).parentElement!.classList.add("hidden");
                    }}
                  />
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur transition hover:bg-black/80"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t.wishlist.viewOnStore}
                    </a>
                  )}
                </div>
              ) : (
                <div className="-mx-4 -mt-4 mb-3 flex aspect-video items-center justify-center rounded-t-2xl bg-zinc-800/30">
                  <ImageIcon className="h-8 w-8 text-zinc-600" />
                </div>
              )}

              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span>{PRIORITY_ICONS[item.priority]}</span>
                    <p className={cn("truncate text-sm font-semibold", item.purchased ? "text-zinc-500 line-through" : "text-zinc-100")}>
                      {item.name}
                    </p>
                  </div>
                  {item.category && (
                    <p className="mt-0.5 text-[11px] text-zinc-500">{item.category}</p>
                  )}
                </div>
                <Badge color={PRIORITY_COLORS[item.priority]}>{t.shopping[item.priority]}</Badge>
              </div>

              {/* Price */}
              <div className="mt-2 flex items-center justify-between">
                <InlinePrice
                  value={item.price}
                  currency={currency}
                  className="text-lg font-bold text-zinc-100"
                  onSave={async (v) => { await updateItem(item, { price: v }); }}
                />
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => { setEditingItem(item); setAddOpen(true); }}
                    className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/8 hover:text-zinc-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => togglePurchased(item)}
                    className={cn(
                      "rounded-lg p-1.5 transition",
                      item.purchased ? "text-emerald-400 hover:bg-emerald-500/10" : "text-zinc-500 hover:text-emerald-400 hover:bg-white/8"
                    )}
                    title={item.purchased ? t.wishlist.undoPurchase : t.wishlist.markPurchased}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Cost per use */}
              {item.price ? (
                <p className="mt-1 text-[11px] text-zinc-500">
                  {t.shopping.costPerUse}: <b className="text-zinc-400">{formatMoney(costPerUse(item.price, 100), currency)}</b> / 100 {t.shopping.uses}
                </p>
              ) : null}

              {/* Can I afford this? */}
              {item.price && moneyCtx && !item.purchased && (
                <button
                  onClick={() => checkAfford(item)}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-500/25 bg-indigo-500/8 py-2 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/15"
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  {t.shopping.canAfford}
                </button>
              )}

              {/* Link to store */}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
                >
                  <Link2 className="h-3 w-3" />
                  <span className="truncate">{new URL(item.url).hostname.replace("www.", "")}</span>
                </a>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      <AddModal
        open={addOpen}
        item={editingItem}
        urlMode={urlMode}
        setUrlMode={setUrlMode}
        urlInput={urlInput}
        setUrlInput={setUrlInput}
        scraping={scraping}
        scrapeError={scrapeError}
        prefill={prefill}
        onScrape={scrapeProduct}
        onClose={() => { setAddOpen(false); setEditingItem(null); setScrapeError(null); setPrefill(null); }}
        onSaved={() => { load(); setPrefill(null); }}
        currency={currency}
      />

      {/* Share modal */}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} items={items} />

      {/* Can I afford this? modal */}
      <Modal
        open={!!affordItem}
        onClose={() => { setAffordItem(null); setAffordResult(null); }}
        title={`${t.shopping.canAfford}: ${affordItem?.name ?? ""}`}
      >
        {affordItem && affordResult && (
          <div className="space-y-4">
            <div className={cn(
              "rounded-2xl border p-4 text-center",
              affordResult.verdict === "yes" ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"
            )}>
              <p className={cn("text-2xl font-bold", affordResult.verdict === "yes" ? "text-emerald-400" : "text-amber-400")}>
                {affordResult.verdict === "yes" ? "YES ✓" : t.shopping.notYet}
              </p>
              <p className="mt-1 text-sm text-zinc-300">{affordResult.reasoning}</p>
              {affordResult.waitWeeks && (
                <p className="mt-1.5 text-xs text-zinc-500">
                  {t.shopping.waitWeeks}: ~{affordResult.waitWeeks} {t.finance.days === "dias" ? "semanas" : "weeks"}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-white/4 p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">{t.shopping.afterBalance}</p>
                <p className={cn("text-lg font-bold", affordResult.afterBalance < 0 ? "text-rose-400" : "text-zinc-100")}>
                  {formatMoney(affordResult.afterBalance, currency)}
                </p>
              </div>
              <div className="rounded-xl bg-white/4 p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">{t.shopping.afterSafe}</p>
                <p className={cn("text-lg font-bold", affordResult.safeToSpendAfter < 0 ? "text-rose-400" : "text-zinc-100")}>
                  {formatMoney(affordResult.safeToSpendAfter, currency)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setAffordItem(null)}>{t.common.close}</Button>
              <Button className="flex-1" onClick={() => createGoalFromWish(affordItem)}>🎯 {t.shopping.createGoal}</Button>
            </div>
            <p className="text-center text-[10px] text-zinc-600">ℹ️ {t.shopping.educational}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------- Inline price editor ---------- */
function InlinePrice({
  value,
  currency,
  onSave,
  className,
}: {
  value: number | null;
  currency: string;
  onSave: (v: number | null) => Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  async function commit() {
    setEditing(false);
    const n = parseFloat(val.replace(",", "."));
    await onSave(Number.isFinite(n) && n > 0 ? n : null);
  }
  if (!editing) {
    return (
      <button
        onClick={() => { setVal(value != null ? String(value) : ""); setEditing(true); }}
        className={cn("rounded px-1 -mx-1 transition hover:bg-white/8 hover:text-indigo-300", className)}
      >
        {value != null ? formatMoney(value, currency) : "—"}
      </button>
    );
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="h-7 w-24 rounded-lg border border-white/15 bg-white/8 px-2 text-xs tabular-nums text-zinc-100 outline-none focus:border-indigo-400/60"
    />
  );
}

/* ---------- Add/Edit Modal ---------- */
function AddModal({
  open,
  item,
  urlMode,
  setUrlMode,
  urlInput,
  setUrlInput,
  scraping,
  scrapeError,
  prefill,
  onScrape,
  onClose,
  onSaved,
  currency,
}: {
  open: boolean;
  item: WishlistItem | null;
  urlMode: boolean;
  setUrlMode: (v: boolean) => void;
  urlInput: string;
  setUrlInput: (v: string) => void;
  scraping: boolean;
  scrapeError: string | null;
  prefill: { name: string; price: string; image: string; url: string } | null;
  onScrape: () => void;
  onClose: () => void;
  onSaved: () => void;
  currency: string;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");

  // When prefill arrives (after a successful scrape), populate the manual form
  useEffect(() => {
    if (prefill && !item) {
      setName(prefill.name);
      setPrice(prefill.price);
      setImage(prefill.image);
      setUrl(prefill.url);
      setCategory("");
      setPriority("medium");
    }
  }, [prefill, item]);

  useEffect(() => {
    if (open) {
      if (item) {
        setName(item.name ?? "");
        setPrice(item.price != null ? String(item.price) : "");
        setImage(item.image ?? "");
        setUrl(item.url ?? "");
        setCategory(item.category ?? "");
        setPriority(item.priority ?? "medium");
      } else if (prefill) {
        // Already handled by the prefill useEffect above
      } else {
        setName("");
        setPrice("");
        setImage("");
        setUrl("");
        setCategory("");
        setPriority("medium");
      }
      if (!item) { setUrlMode(false); setUrlInput(""); }
    }
  }, [open, item, prefill]);

  async function saveManual() {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      price: price ? parseFloat(price.replace(",", ".")) : null,
      image: image || null,
      url: url || null,
      category: category || null,
      priority,
    };
    if (item) {
      await supabase.from("wishlist_items").update(payload).eq("id", item.id);
    } else {
      await supabase.from("wishlist_items").insert(payload);
    }
    onSaved();
    onClose();
  }

  if (urlMode && !item) {
    return (
      <Modal open={open} onClose={onClose} title={t.wishlist.addByUrl}>
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">{t.wishlist.addByUrlHint}</p>
          <Field label="URL">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.amazon.es/…"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") onScrape(); }}
            />
          </Field>
          {scrapeError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">{scrapeError}</p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setUrlMode(false)}>{t.common.back}</Button>
            <Button className="flex-1" onClick={onScrape} disabled={scraping || !urlInput.trim()}>
              {scraping ? t.common.loading : t.wishlist.scrape}
            </Button>
          </div>
          <button
            onClick={() => setUrlMode(false)}
            className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
          >
            {t.wishlist.addManually}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? t.common.edit : t.wishlist.add}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={urlMode ? "outline" : "primary"}
            size="sm"
            className="flex-1"
            onClick={() => !item && setUrlMode(false)}
          >
            <GripHorizontal className="h-3.5 w-3.5" />
            {t.wishlist.manual}
          </Button>
          <Button
            variant={urlMode ? "primary" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => !item && setUrlMode(true)}
            disabled={!!item}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t.wishlist.byUrl}
          </Button>
        </div>

        {prefill && !item && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2.5">
            <p className="text-[11px] font-medium text-emerald-300">
              ✨ {t.wishlist.scrapedFromUrl}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-emerald-400/60">{prefill.url}</p>
          </div>
        )}

        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MacBook Pro, Ténis…" autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.amount}>
            <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={currency} />
          </Field>
          <Field label={t.wishlist.priority}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_ICONS[p]} {t.shopping[p]}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t.common.category}>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t.wishlist.categoryHint} />
        </Field>

        <Field label="URL">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>

        <Field label={t.wishlist.image}>
          <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://… (url da imagem)" />
        </Field>

        <Button className="w-full" onClick={saveManual} disabled={!name.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------- Share Modal ---------- */
function ShareModal({ open, onClose, items }: { open: boolean; onClose: () => void; items: WishlistItem[] }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState("24h");
  const [shares, setShares] = useState<WishlistShare[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("wishlist_shares").select("*").order("created_at", { ascending: false });
    setShares((data as WishlistShare[]) ?? []);
  }, [supabase]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const wantedCount = items.filter((i) => !i.purchased).length;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const token = randomToken();
      let expiresAt: string | null = null;
      let unlimited = false;
      if (mode === "24h") expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
      else if (mode === "7d") expiresAt = new Date(Date.now() + 7 * 24 * 3600000).toISOString();
      else if (mode === "30d") expiresAt = new Date(Date.now() + 30 * 24 * 3600000).toISOString();
      else if (mode === "unlimited") unlimited = true;
      const { error: insertError } = await supabase.from("wishlist_shares").insert({ token, label: label.trim() || null, expires_at: expiresAt, unlimited });
      if (insertError) throw insertError;
      setCreatedUrl(`${window.location.origin}/share/wishlist/${token}`);
      setLabel("");
      load();
    } catch {
      setError(t.wishlist.shareCreateFailed);
    }
    setBusy(false);
  }

  async function revoke(s: WishlistShare) {
    await supabase.from("wishlist_shares").delete().eq("id", s.id);
    if (createdUrl?.endsWith(s.token)) setCreatedUrl(null);
    load();
  }

  async function copyLink(url: string) {
    try { await navigator.clipboard.writeText(url); } catch {
      const el = document.createElement("textarea"); el.value = url; document.body.appendChild(el); el.select(); document.execCommand("copy"); el.remove();
    }
    setCopied(url);
    setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500);
  }

  function shareStatus(s: WishlistShare): "active" | "used" | "expired" {
    if (s.used_at) return "used";
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) return "expired";
    return "active";
  }

  return (
    <Modal open={open} onClose={onClose} title={t.wishlist.shareModal} maxWidth="max-w-lg">
      <div className="space-y-5">
        <p className="rounded-xl border border-indigo-500/20 bg-indigo-500/8 px-3 py-2.5 text-xs leading-relaxed text-indigo-200">
          🔗 {t.wishlist.shareHint} ({wantedCount} {t.wishlist.items})
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t.calendar.shareLabel}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.calendar.shareLabelPlaceholder} />
          </Field>
          <Field label={t.wishlist.shareMode}>
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="once">{t.wishlist.shareOnce}</option>
              <option value="24h">{t.wishlist.share24h}</option>
              <option value="7d">{t.wishlist.share7d}</option>
              <option value="30d">{t.wishlist.share30d}</option>
              <option value="unlimited">{t.wishlist.shareUnlimited}</option>
            </Select>
          </Field>
        </div>

        <Button className="w-full" onClick={create} disabled={busy}>
          {busy ? t.common.loading : t.wishlist.shareCreate}
        </Button>

        {error && <p className="text-center text-xs text-red-400">{error}</p>}

        {createdUrl && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">{t.wishlist.shareReady}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-emerald-500/20 bg-black/30 px-3 py-2 text-xs text-zinc-200">{createdUrl}</code>
              <Button size="sm" onClick={() => copyLink(createdUrl)}>
                <Copy className="h-3.5 w-3.5" />
                {copied === createdUrl ? t.wishlist.copied : t.wishlist.copy}
              </Button>
            </div>
          </div>
        )}

        {shares.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t.wishlist.existingShares}</p>
            <div className="space-y-1.5">
              {shares.map((s) => {
                const st = shareStatus(s);
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-200">
                        {s.label || s.token.slice(0, 12) + "…"}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {st === "active" && "🟢 " + t.wishlist.active}
                        {st === "used" && "🔴 " + t.wishlist.used}
                        {st === "expired" && "⏰ " + t.wishlist.expired}
                        {s.unlimited && ` · ${t.wishlist.unlimitedBadge}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyLink(`${window.location.origin}/share/wishlist/${s.token}`)}
                        className="rounded-lg p-1.5 text-zinc-500 transition hover:text-zinc-200"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => revoke(s)} className="rounded-lg p-1.5 text-zinc-500 transition hover:text-red-400">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}