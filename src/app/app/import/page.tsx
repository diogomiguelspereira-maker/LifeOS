"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import { Button, Card, CardHeader, Select, Textarea } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/cn";

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  categoryId: string | null;
}

/** Parse "1.234,56" / "1,234.56" / "(15,00)" → number. */
function parseAmount(raw: string): number | null {
  const t = raw.trim();
  const neg = /^-/.test(t) || /^\(.*\)$/.test(t);
  let body = t.replace(/^[+-]|^\(|\)$/g, "").replace(/[^\d.,]/g, "");
  if (!body) return null;
  if (body.includes(",") && body.includes(".")) {
    if (body.lastIndexOf(",") > body.lastIndexOf(".")) body = body.replace(/\./g, "").replace(",", ".");
    else body = body.replace(/,/g, "");
  } else if (body.includes(",")) {
    const parts = body.split(",");
    if (parts.length === 2 && parts[1].length <= 2) body = body.replace(",", ".");
    else body = body.replace(/,/g, "");
  } else if (body.includes(".")) {
    // pt thousands: "1.000" = 1000 (only when exactly 3 decimals and int part non-zero)
    const parts = body.split(".");
    if (parts.length === 2 && parts[1].length === 3 && parts[0] !== "0" && parts[0] !== "") body = body.replace(/\./g, "");
  }
  const n = parseFloat(body);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Accept YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY → ISO date (fallback today). */
function parseDate(raw: string): string {
  const t = raw.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const yy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${yy}-${String(Number(dmy[2])).padStart(2, "0")}-${String(Number(dmy[1])).padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function detectDelimiter(firstLine: string): string {
  const counts = [";", ",", "\t"].map((d) => ({ d, n: (firstLine.match(new RegExp(`\\${d}`, "g")) ?? []).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

const HEADER_HINTS: Record<string, "date" | "desc" | "amount"> = {
  date: "date", data: "date", dia: "date", día: "date", fecha: "date", jour: "date",
  description: "desc", descrição: "desc", descricao: "desc", descripcion: "desc", desc: "desc",
  memo: "desc", libelle: "desc", libellé: "desc", detail: "desc", name: "desc",
  amount: "amount", valor: "amount", montant: "amount", importe: "amount", amounteur: "amount",
  value: "amount", quantia: "amount", "": "amount",
};

/** Guess which column is date / description / amount, by header names or position. */
function parseCsv(text: string, categories: Category[]): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = detectDelimiter(lines[0]);
  const split = (l: string) => l.split(delim).map((c) => c.replace(/^"|"$/g, "").trim());

  let header: string[] | null = null;
  let start = 0;
  const first = split(lines[0]);
  const looksLikeHeader = first.some((c) => HEADER_HINTS[c.toLowerCase()] && /[a-zà-ÿ]/i.test(c));
  if (looksLikeHeader) {
    header = first;
    start = 1;
  }

  const colOf = (kind: "date" | "desc" | "amount"): number => {
    if (header) {
      const idx = header.findIndex((h) => HEADER_HINTS[h.toLowerCase()] === kind);
      if (idx >= 0) return idx;
    }
    if (kind === "date") return 0;
    if (kind === "amount") return header ? header.length - 1 : lines[0].split(delim).length - 1;
    return 1;
  };
  const cDate = colOf("date");
  const cDesc = colOf("desc");
  const cAmount = colOf("amount");

  const out: ParsedRow[] = [];
  for (let i = start; i < lines.length && out.length < 300; i++) {
    const cells = split(lines[i]);
    if (cells.length < 2) continue;
    const amount = parseAmount(cells[cAmount] ?? "");
    if (amount === null || amount === 0) continue;
    const description = (cells[cDesc] ?? cells[0] ?? "Movimento").slice(0, 120);
    const date = parseDate(cells[cDate] ?? "");
    const low = description.toLowerCase();
    const match = categories.find((c) => c.name && low.includes(c.name.toLowerCase()));
    out.push({ date, description, amount, categoryId: match?.id ?? null });
  }
  return out;
}

export default function ImportPage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [categories, setCategories] = useState<Category[]>([]);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setCategories(await api.categories(supabase));
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    if (!rows || !rows.length) return null;
    const expense = rows.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
    const income = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    return { count: rows.length, expense, income };
  }, [rows]);

  function parse() {
    const parsed = parseCsv(text, categories);
    setRows(parsed);
    setMsg(null);
  }

  async function doImport() {
    if (!rows || !rows.length) return;
    setImporting(true);
    const payload = rows.map((r) => ({
      amount: r.amount,
      description: r.description,
      date: r.date,
      category_id: r.categoryId,
    }));
    const { error } = await supabase.from("transactions").insert(payload);
    setImporting(false);
    if (error) {
      setMsg(t.importData.error);
    } else {
      setMsg(`${t.importData.done} ${rows.length}`);
      setRows(null);
      setText("");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t.importData.title} subtitle={t.importData.subtitle} />

      <Card>
        <CardHeader title={t.importData.step1} />
        <p className="mb-2 text-xs leading-relaxed text-zinc-400">{t.importData.hint}</p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"01/08/2026;Supermercado;−42,30\n02/08/2026;Salário;+1200,00"}
          className="font-mono text-xs"
        />
        <div className="mt-3">
          <Button onClick={parse} disabled={!text.trim()}>
            <Upload className="h-4 w-4" />
            {t.importData.parse}
          </Button>
        </div>
      </Card>

      {stats && rows && (
        <Card>
          <CardHeader
            title={t.importData.preview}
            subtitle={`${stats.count} · ${t.importData.expenses}: ${stats.expense.toFixed(2)}€ · ${t.importData.income}: ${stats.income.toFixed(2)}€`}
          />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/4">
                <span className="w-20 shrink-0 tabular-nums text-zinc-500 sm:w-24">{r.date}</span>
                <span className="min-w-[100px] flex-1 truncate text-zinc-200">{r.description}</span>
                <span className={cn("w-20 shrink-0 text-right font-semibold tabular-nums sm:w-24", r.amount < 0 ? "text-rose-400" : "text-emerald-400")}>
                  {r.amount.toFixed(2)}€
                </span>
                <Select
                  value={r.categoryId ?? ""}
                  onChange={(e) => setRows((prev) => (prev ? prev.map((x, j) => (j === i ? { ...x, categoryId: e.target.value || null } : x)) : prev))}
                  className="h-7 w-32 shrink-0 rounded-lg text-[11px] sm:w-36"
                >
                  <option value="">{t.importData.category}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          {rows.length >= 300 && <p className="mt-2 text-[11px] text-amber-400">{t.importData.limit}</p>}
          {msg && <p className="mt-2 text-[11px] text-emerald-400">{msg}</p>}
          <div className="mt-3">
            <Button onClick={doImport} disabled={importing || rows.length === 0}>
              <Download className="h-4 w-4" />
              {importing ? t.common.loading : `${t.importData.import} ${rows.length}`}
            </Button>
          </div>
        </Card>
      )}

      {rows !== null && rows.length === 0 && (
        <Card>
          <p className="py-6 text-center text-sm text-zinc-500">{t.importData.error}</p>
        </Card>
      )}
    </div>
  );
}
