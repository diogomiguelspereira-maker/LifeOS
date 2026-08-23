"use client";

import { use, useEffect, useState } from "react";
import { ExternalLink, Gift, Lock, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { pt, en, es, fr, type Dict } from "@/lib/i18n";
import type { SharedWishlistItem } from "@/lib/types";
import { cn } from "@/lib/cn";

type Status = "loading" | "invalid" | "error" | "empty" | "ok";

function pickLang(): Dict {
  try {
    const l = (navigator.language || "pt").toLowerCase();
    if (l.startsWith("en")) return en;
    if (l.startsWith("es")) return es;
    if (l.startsWith("fr")) return fr;
  } catch { /* fall through to pt */ }
  return pt;
}

function formatPrice(price: number | null, currency?: string): string {
  if (price == null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 2,
  }).format(price);
}

export default function ShareWishlistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<SharedWishlistItem[]>([]);
  const [t] = useState<Dict>(() => pickLang());

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_shared_wishlist", { p_token: token });
        if (cancelled) return;
        if (error) { setStatus(error.code === "P0001" ? "invalid" : "error"); return; }
        const rows = (data as SharedWishlistItem[] | null) ?? [];
        if (rows.length === 0) { setStatus("empty"); return; }
        setItems(rows);
        setStatus("ok");
      } catch { if (!cancelled) setStatus("error"); }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const first = items[0];
  const ownerName = first?.owner_name ?? first?.owner_email ?? null;
  const shareLabel = first?.share_label ?? null;
  const isUnlimited = first?.is_unlimited ?? false;
  const total = items.reduce((s, i) => s + (i.price ?? 0), 0);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30">
          <Gift className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-zinc-800 dark:text-zinc-100">
            {shareLabel || `${t.wishlist.shareTitle} ${ownerName ?? "LifeOS"}`}
          </h1>
          {shareLabel && ownerName && (
            <p className="truncate text-xs text-zinc-500">{t.wishlist.shareBy} {ownerName}</p>
          )}
        </div>
        {total > 0 && (
          <div className="ml-auto shrink-0 rounded-xl border border-zinc-200 dark:border-white/10 bg-white/[0.04] px-4 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">{items.length} {t.wishlist.items}</p>
            <p className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{formatPrice(total)}</p>
          </div>
        )}
      </header>

      {status === "loading" && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="skeleton h-3 w-40 rounded-full" />
          <div className="skeleton h-3 w-56 rounded-full" />
          <p className="mt-2 text-xs text-zinc-500">{t.calendar.shareLoading}</p>
        </div>
      )}

      {status === "invalid" && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white/[0.04] px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
            <Lock className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-zinc-700 dark:text-zinc-200">{t.calendar.shareUnavailableTitle}</p>
          <p className="max-w-sm text-sm text-zinc-500">{t.calendar.shareUnavailable}</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white/[0.04] px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
            <Lock className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-zinc-700 dark:text-zinc-200">{t.common.error}</p>
          <p className="max-w-sm text-sm text-zinc-500">{t.calendar.shareLoadFailed}</p>
        </div>
      )}

      {status === "empty" && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white/[0.04] px-6 py-16 text-center">
          <p className="text-base font-semibold text-zinc-700 dark:text-zinc-200">{t.wishlist.shareEmpty}</p>
        </div>
      )}

      {status === "ok" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {isUnlimited ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-[11px] text-emerald-300">
                🔓 {t.calendar.shareUnlimitedNote}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-300">
                🔒 {t.calendar.shareOneTimeNote}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="group rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/[0.04] p-4 transition hover:border-zinc-300 dark:border-white/15">
                {/* Product image */}
                {item.image ? (
                  <div className="-mx-4 -mt-4 mb-3 overflow-hidden rounded-t-2xl bg-zinc-50 dark:bg-zinc-800/50">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="aspect-video w-full object-contain p-3"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                ) : (
                  <div className="-mx-4 -mt-4 mb-3 flex aspect-video items-center justify-center rounded-t-2xl bg-zinc-50 dark:bg-zinc-800/30">
                    <ShoppingBag className="h-8 w-8 text-zinc-600" />
                  </div>
                )}

                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{item.name}</h3>

                {item.category && (
                  <p className="mt-0.5 text-[11px] text-zinc-500">{item.category}</p>
                )}

                <div className="mt-2 flex items-center justify-between">
                  <p className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                    {formatPrice(item.price)}
                  </p>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/20"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t.wishlist.viewOnStore}
                    </a>
                  )}
                </div>

                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block truncate text-[10px] text-zinc-600 hover:text-zinc-500 dark:text-zinc-400"
                  >
                    {new URL(item.url).hostname.replace("www.", "")}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="mt-8 text-center text-[11px] text-zinc-600">
        {t.wishlist.shareFooter}{" "}
        <span className="font-semibold text-zinc-500">LifeOS</span> 🧠
      </footer>
    </main>
  );
}