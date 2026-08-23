"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
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
import type { ShoppingItem, ShoppingList, WishlistItem } from "@/lib/types";
import { cn } from "@/lib/cn";

const CATEGORIES = ["groceries", "electronics", "clothes", "home", "travel"];
const PRIORITIES = ["critical", "high", "medium", "low"] as const;
const PRIORITY_COLORS: Record<string, "red" | "amber" | "blue" | "zinc"> = {
  critical: "red",
  high: "amber",
  medium: "blue",
  low: "zinc",
};

type Tab = "lists" | "wishlist";

export default function ShoppingPage() {
  const { t, currency } = useApp();
  const supabase = useSupabase();
  const [tab, setTab] = useState<Tab>("lists");
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [wishOpen, setWishOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [editingWish, setEditingWish] = useState<WishlistItem | null>(null);
  const [activeList, setActiveList] = useState<string>("");
  const [affordItem, setAffordItem] = useState<WishlistItem | null>(null);
  const [affordResult, setAffordResult] = useState<AffordResult | null>(null);

  const load = useCallback(async () => {
    const [ls, it, ws] = await Promise.all([api.shoppingLists(supabase), api.shoppingItems(supabase), api.wishlist(supabase)]);
    setLists(ls);
    setItems(it);
    setWishlist(ws);
    if (!activeList && ls.length) setActiveList(ls[0].id);
    setLoading(false);
  }, [supabase, activeList]);

  // financial context for "Can I afford this?"
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
      setMoneyCtx({
        available: totals.available,
        safe: Math.round(safe.amount),
        fundTarget,
        fundCurrent,
        income: totals.monthlyIncome,
        savingsRate: totals.savingsRate,
      });
    })();
  }, [supabase]);

  function checkAfford(w: WishlistItem) {
    if (!w.price || !moneyCtx) return;
    setAffordItem(w);
    setAffordResult(
      canAfford(w.price, {
        available: moneyCtx.available,
        safeToSpend: moneyCtx.safe,
        emergencyFundTarget: moneyCtx.fundTarget,
        emergencyFundCurrent: moneyCtx.fundCurrent,
        monthlyIncome: moneyCtx.income,
        savingsRate: moneyCtx.savingsRate,
      })
    );
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

  useEffect(() => {
    load();
  }, [load]);

  const current = lists.find((l) => l.id === activeList);
  const currentItems = items.filter((i) => i.list_id === activeList);
  const checkedCount = currentItems.filter((i) => i.checked).length;
  const wishTotal = wishlist.filter((w) => !w.purchased).reduce((s, w) => s + (w.price ?? 0), 0);

  async function toggleItem(item: ShoppingItem) {
    await supabase.from("shopping_items").update({ checked: !item.checked }).eq("id", item.id);
    load();
  }

  async function removeItem(id: string) {
    await supabase.from("shopping_items").delete().eq("id", id);
    load();
  }

  async function removeWish(id: string) {
    await supabase.from("wishlist_items").delete().eq("id", id);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.shopping.title}
        action={
          tab === "lists" ? (
            <Button onClick={() => { setEditingItem(null); setItemOpen(true); }}>
              <Plus className="h-4 w-4" />
              {t.shopping.addItem}
            </Button>
          ) : (
            <Button onClick={() => { setEditingWish(null); setWishOpen(true); }}>
              <Plus className="h-4 w-4" />
              {t.shopping.addWish}
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "lists", label: t.shopping.lists },
            { value: "wishlist", label: t.shopping.wishlist },
          ]}
        />
        {tab === "lists" && (
          <Button variant="outline" size="sm" onClick={() => setListOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t.shopping.addList}
          </Button>
        )}
      </div>

      {tab === "lists" ? (
        <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            {lists.map((l) => {
              const cnt = items.filter((i) => i.list_id === l.id);
              const done = cnt.filter((i) => i.checked).length;
              return (
                <button
                  key={l.id}
                  onClick={() => setActiveList(l.id)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-left transition",
                    activeList === l.id ? "border-indigo-400/40 bg-indigo-500/10" : "border-white/8 hover:bg-white/5"
                  )}
                >
                  <p className="text-sm font-medium text-zinc-200">{l.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {l.category} · {done}/{cnt.length}
                  </p>
                </button>
              );
            })}
          </div>

          <Card>
            {!current ? (
              <EmptyState icon="🛒" title={t.shopping.addList} />
            ) : (
              <>
                <CardHeader
                  title={current.name}
                  subtitle={`${checkedCount}/${currentItems.length}`}
                  action={
                    <Badge color="violet">
                      {formatMoney(currentItems.filter((i) => i.price).reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0), currency)}
                    </Badge>
                  }
                />
                {currentItems.length === 0 ? (
                  <p className="py-4 text-center text-sm text-zinc-500">{t.shopping.empty}</p>
                ) : (
                  <div className="space-y-1">
                    {currentItems.map((item) => (
                      <div key={item.id} className="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/4">
                        <button
                          onClick={() => toggleItem(item)}
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                            item.checked ? "border-transparent bg-emerald-500" : "border-white/20 hover:border-emerald-400"
                          )}
                        >
                          {item.checked && <Check className="h-3 w-3 text-white" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm", item.checked ? "text-zinc-500 line-through" : "text-zinc-100")}>{item.name}</p>
                          <p className="text-[11px] text-zinc-500">
                            ×{item.quantity} ·{" "}
                            <InlinePrice
                              value={item.price}
                              currency={currency}
                              onSave={async (v) => {
                                await supabase.from("shopping_items").update({ price: v }).eq("id", item.id);
                                load();
                              }}
                            />
                          </p>
                        </div>
                        <Badge color={PRIORITY_COLORS[item.priority]}>{t.shopping[item.priority]}</Badge>
                        <button
                          onClick={() => { setEditingItem(item); setItemOpen(true); }}
                          className="rounded-lg p-1 text-zinc-500 transition hover:bg-white/8 hover:text-zinc-200"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => removeItem(item.id)} className="rounded-lg p-1 text-zinc-600 transition hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      ) : (
        <>
          <Card className="flex items-center justify-between">
            <p className="text-sm text-zinc-300">{t.shopping.totalWishlist}</p>
            <p className="text-2xl font-bold text-zinc-100">{formatMoney(wishTotal, currency)}</p>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2">
            {wishlist.length === 0 && (
              <Card className="sm:col-span-2">
                <EmptyState icon="⭐" title={t.shopping.addWish} />
              </Card>
            )}
            {wishlist.map((w) => (
              <Card key={w.id} className="group">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-semibold", w.purchased ? "text-zinc-500 line-through" : "text-zinc-100")}>{w.name}</p>
                    <p className="text-[11px] text-zinc-500">{w.category ?? ""}</p>
                  </div>
                  <Badge color={PRIORITY_COLORS[w.priority]}>{t.shopping[w.priority]}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <InlinePrice
                    value={w.price}
                    currency={currency}
                    className="text-sm font-bold text-zinc-100"
                    onSave={async (v) => {
                      await supabase.from("wishlist_items").update({ price: v }).eq("id", w.id);
                      load();
                    }}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingWish(w); setWishOpen(true); }}
                      className="rounded-lg p-1 text-zinc-500 transition hover:bg-white/8 hover:text-zinc-200"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        await supabase.from("wishlist_items").update({ purchased: !w.purchased }).eq("id", w.id);
                        load();
                      }}
                      className="rounded-lg px-2 py-1 text-[11px] font-medium text-emerald-400 transition hover:bg-emerald-500/10"
                    >
                      {w.purchased ? "↩" : "✓"}
                    </button>
                    <button onClick={() => removeWish(w.id)} className="rounded-lg p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {w.price ? (
                  <p className="mt-1.5 text-[11px] text-zinc-500">
                    {t.shopping.costPerUse}: <b className="text-zinc-300">{formatMoney(costPerUse(w.price, 100), currency)}</b> / 100 {t.shopping.uses}
                  </p>
                ) : null}
                {w.price && moneyCtx && (
                  <button
                    onClick={() => checkAfford(w)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-500/25 bg-indigo-500/8 py-1.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/15"
                  >
                    <Lightbulb className="h-3.5 w-3.5" />
                    {t.shopping.canAfford}
                  </button>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <ListModal open={listOpen} onClose={() => setListOpen(false)} onSaved={load} />
      <ItemModal
        open={itemOpen}
        item={editingItem}
        onClose={() => { setItemOpen(false); setEditingItem(null); }}
        lists={lists}
        activeList={activeList}
        onSaved={load}
        currency={currency}
      />
      <WishModal
        open={wishOpen}
        wish={editingWish}
        onClose={() => { setWishOpen(false); setEditingWish(null); }}
        onSaved={load}
        currency={currency}
      />

      {/* Can I afford this? */}
      <Modal
        open={!!affordItem}
        onClose={() => {
          setAffordItem(null);
          setAffordResult(null);
        }}
        title={`${t.shopping.canAfford}: ${affordItem?.name ?? ""}`}
      >
        {affordItem && affordResult && (
          <div className="space-y-4">
            <div
              className={cn(
                "rounded-2xl border p-4 text-center",
                affordResult.verdict === "yes" ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"
              )}
            >
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
              <Button variant="secondary" className="flex-1" onClick={() => setAffordItem(null)}>
                {t.common.close}
              </Button>
              <Button
                className="flex-1"
                onClick={() => createGoalFromWish(affordItem)}
              >
                🎯 {t.shopping.createGoal}
              </Button>
            </div>
            <p className="text-center text-[10px] text-zinc-600">ℹ️ {t.shopping.educational}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ListModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("groceries");

  useEffect(() => {
    if (open) {
      setName("");
      setCategory("groceries");
    }
  }, [open]);

  async function save() {
    if (!name.trim()) return;
    await supabase.from("shopping_lists").insert({ name: name.trim(), category });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.shopping.addList}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t.common.category}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.shopping[c as keyof typeof t.shopping]}
              </option>
            ))}
          </Select>
        </Field>
        <Button className="w-full" onClick={save} disabled={!name.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

/** Click a price to edit it inline (Enter/blur saves, Esc cancels). */
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
        onClick={() => {
          setVal(value != null ? String(value) : "");
          setEditing(true);
        }}
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
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className="h-7 w-24 rounded-lg border border-white/15 bg-white/8 px-2 text-xs tabular-nums text-zinc-100 outline-none focus:border-indigo-400/60"
    />
  );
}

function ItemModal({
  open,
  item,
  onClose,
  lists,
  activeList,
  onSaved,
  currency,
}: {
  open: boolean;
  item: ShoppingItem | null;
  onClose: () => void;
  lists: ShoppingList[];
  activeList: string;
  onSaved: () => void;
  currency: string;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [listId, setListId] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState("medium");

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setListId(item?.list_id ?? (activeList || lists[0]?.id || ""));
      setPrice(item?.price != null ? String(item.price) : "");
      setPriority(item?.priority ?? "medium");
    }
  }, [open, item, activeList, lists]);

  async function save() {
    if (!name.trim() || !listId) return;
    const payload = {
      name: name.trim(),
      list_id: listId,
      price: price ? parseFloat(price.replace(",", ".")) : null,
      priority,
    };
    if (item) {
      await supabase.from("shopping_items").update(payload).eq("id", item.id);
    } else {
      await supabase.from("shopping_items").insert(payload);
    }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? t.common.edit : t.shopping.addItem}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.shopping.lists}>
            <Select value={listId} onChange={(e) => setListId(e.target.value)}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.common.amount}>
            <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={currency} />
          </Field>
        </div>
        <Field label={t.shopping.priority}>
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t.shopping[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Button className="w-full" onClick={save} disabled={!name.trim() || !listId}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function WishModal({
  open,
  wish,
  onClose,
  onSaved,
  currency,
}: {
  open: boolean;
  wish: WishlistItem | null;
  onClose: () => void;
  onSaved: () => void;
  currency: string;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [image, setImage] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");

  useEffect(() => {
    if (open) {
      setName(wish?.name ?? "");
      setPrice(wish?.price != null ? String(wish.price) : "");
      setUrl(wish?.url ?? "");
      setImage(wish?.image ?? "");
      setCategory(wish?.category ?? "");
      setPriority(wish?.priority ?? "medium");
    }
  }, [open, wish]);

  async function save() {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      price: price ? parseFloat(price.replace(",", ".")) : null,
      url: url || null,
      image: image || null,
      category: category || null,
      priority,
    };
    if (wish) {
      await supabase.from("wishlist_items").update(payload).eq("id", wish.id);
    } else {
      await supabase.from("wishlist_items").insert(payload);
    }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={wish ? t.common.edit : t.shopping.addWish}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MacBook, ténis…" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.amount}>
            <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={currency} />
          </Field>
          <Field label={t.shopping.priority}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t.shopping[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t.common.category}>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Eletrónica, moda…" />
        </Field>
        <Field label="URL">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label={t.wishlist.image}>
          <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://… (url da imagem)" />
        </Field>
        <Button className="w-full" onClick={save} disabled={!name.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
