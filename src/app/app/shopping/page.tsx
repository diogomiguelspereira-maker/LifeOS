"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import { costPerUse } from "@/lib/finance";
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
  const [activeList, setActiveList] = useState<string>("");

  const load = useCallback(async () => {
    const [ls, it, ws] = await Promise.all([api.shoppingLists(supabase), api.shoppingItems(supabase), api.wishlist(supabase)]);
    setLists(ls);
    setItems(it);
    setWishlist(ws);
    if (!activeList && ls.length) setActiveList(ls[0].id);
    setLoading(false);
  }, [supabase, activeList]);

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
            <Button onClick={() => setItemOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.shopping.addItem}
            </Button>
          ) : (
            <Button onClick={() => setWishOpen(true)}>
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
                            ×{item.quantity}
                            {item.price ? ` · ${formatMoney(item.price, currency)}` : ""}
                          </p>
                        </div>
                        <Badge color={PRIORITY_COLORS[item.priority]}>{t.shopping[item.priority]}</Badge>
                        <button onClick={() => removeItem(item.id)} className="rounded-lg p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100">
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
                  <p className="text-sm font-bold text-zinc-100">{w.price ? formatMoney(w.price, currency) : "—"}</p>
                  <div className="flex items-center gap-1">
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
              </Card>
            ))}
          </div>
        </>
      )}

      <ListModal open={listOpen} onClose={() => setListOpen(false)} onSaved={load} />
      <ItemModal open={itemOpen} onClose={() => setItemOpen(false)} lists={lists} activeList={activeList} onSaved={load} currency={currency} />
      <WishModal open={wishOpen} onClose={() => setWishOpen(false)} onSaved={load} currency={currency} />
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

function ItemModal({ open, onClose, lists, activeList, onSaved, currency }: { open: boolean; onClose: () => void; lists: ShoppingList[]; activeList: string; onSaved: () => void; currency: string }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [listId, setListId] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState("medium");

  useEffect(() => {
    if (open) {
      setName("");
      setListId(activeList || lists[0]?.id || "");
      setPrice("");
      setPriority("medium");
    }
  }, [open, activeList, lists]);

  async function save() {
    if (!name.trim() || !listId) return;
    await supabase.from("shopping_items").insert({
      name: name.trim(),
      list_id: listId,
      price: price ? parseFloat(price.replace(",", ".")) : null,
      priority,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.shopping.addItem}>
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

function WishModal({ open, onClose, onSaved, currency }: { open: boolean; onClose: () => void; onSaved: () => void; currency: string }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");

  useEffect(() => {
    if (open) {
      setName("");
      setPrice("");
      setUrl("");
      setCategory("");
      setPriority("medium");
    }
  }, [open]);

  async function save() {
    if (!name.trim()) return;
    await supabase.from("wishlist_items").insert({
      name: name.trim(),
      price: price ? parseFloat(price.replace(",", ".")) : null,
      url: url || null,
      category: category || null,
      priority,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.shopping.addWish}>
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
        <Button className="w-full" onClick={save} disabled={!name.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
