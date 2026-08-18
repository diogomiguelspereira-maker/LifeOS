"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import type { DigitalAsset, Document } from "@/lib/types";

type Tab = "assets" | "documents";
type AssetType = "device" | "license" | "domain" | "service" | "cloud";

const ASSET_LABEL_KEYS: Record<AssetType, string> = {
  device: "devices",
  license: "licenses",
  domain: "domains",
  service: "services",
  cloud: "services",
};

export default function DigitalPage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [tab, setTab] = useState<Tab>("assets");
  const [assets, setAssets] = useState<DigitalAsset[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetOpen, setAssetOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);

  const load = useCallback(async () => {
    const [as, ds] = await Promise.all([api.digitalAssets(supabase), api.documents(supabase)]);
    setAssets(as);
    setDocuments(ds);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const daysUntil = (date: string) => Math.round((new Date(date).getTime() - Date.now()) / 86400000);
  const expiryBadge = (date: string | null): { label: string; color: "green" | "amber" | "red" } => {
    if (!date) return { label: "—", color: "green" };
    const d = daysUntil(date);
    if (d < 0) return { label: `${t.digital.expired} (${-d}d)`, color: "red" };
    if (d <= 60) return { label: `${d}d`, color: "amber" };
    return { label: `${d}d`, color: "green" };
  };

  const expiringDocs = useMemo(
    () =>
      documents
        .filter((d) => d.expiry_date && daysUntil(d.expiry_date) <= 90)
        .sort((a, b) => (a.expiry_date! < b.expiry_date! ? -1 : 1)),
    [documents]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const assetGroups: Record<AssetType, DigitalAsset[]> = {
    device: assets.filter((a) => a.type === "device"),
    license: assets.filter((a) => a.type === "license"),
    domain: assets.filter((a) => a.type === "domain"),
    service: assets.filter((a) => a.type === "service"),
    cloud: assets.filter((a) => a.type === "cloud"),
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.digital.title}
        action={
          tab === "assets" ? (
            <Button onClick={() => setAssetOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.digital.add}
            </Button>
          ) : (
            <Button onClick={() => setDocOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.digital.add}
            </Button>
          )
        }
      />

      <p className="text-xs text-zinc-500">🔒 {t.digital.note}</p>

      {expiringDocs.length > 0 && tab === "documents" && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-semibold text-amber-400">⚠️ {t.digital.expiresIn}</p>
          <div className="mt-2 space-y-1">
            {expiringDocs.map((d) => {
              const b = expiryBadge(d.expiry_date);
              return (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-200">{d.name}</span>
                  <Badge color={b.color}>{b.label}</Badge>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "assets", label: t.digital.devices },
          { value: "documents", label: t.digital.documents },
        ]}
      />

      {tab === "assets" && (
        <div className="space-y-4">
          {(["device", "license", "domain", "service", "cloud"] as AssetType[]).map((type) => {
            const list = assetGroups[type];
            return (
              <div key={type}>
                <p className="mb-2 text-sm font-semibold text-zinc-300">{(t.digital as Record<string, string>)[ASSET_LABEL_KEYS[type]]}</p>
                {list.length === 0 ? (
                  <p className="text-xs text-zinc-600">{t.digital.noData}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {list.map((a) => {
                      const b = expiryBadge(a.expiry_date);
                      return (
                        <Card key={a.id} className="group !p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-zinc-200">{a.name}</p>
                              {a.details && <p className="text-[11px] text-zinc-500">{a.details}</p>}
                              <p className="mt-1 text-[11px] text-zinc-500">
                                {a.purchase_date ? `${t.digital.purchased}: ${a.purchase_date}` : ""}
                                {a.cost ? ` · ${a.cost}€` : ""}
                              </p>
                            </div>
                            <button
                              onClick={async () => {
                                await supabase.from("digital_assets").delete().eq("id", a.id);
                                load();
                              }}
                              className="rounded-lg p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-2">
                            <Badge color={b.color}>
                              {t.digital.expiry}: {b.label}
                            </Badge>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "documents" && (
        <Card>
          {documents.length === 0 ? (
            <EmptyState icon="📄" title={t.digital.noData} />
          ) : (
            <div className="space-y-2">
              {documents.map((d) => {
                const b = expiryBadge(d.expiry_date);
                return (
                  <div key={d.id} className="group flex items-center gap-3 rounded-xl border border-white/6 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-200">{d.name}</p>
                      <p className="text-[11px] text-zinc-500">
                        {t.digital.category}: {(t.digital as Record<string, string>)[d.category] ?? d.category}
                        {d.number ? ` · ${d.number}` : ""}
                      </p>
                    </div>
                    <Badge color={b.color}>{b.label}</Badge>
                    <button
                      onClick={async () => {
                        await supabase.from("documents").delete().eq("id", d.id);
                        load();
                      }}
                      className="rounded-lg p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <AssetModal open={assetOpen} onClose={() => setAssetOpen(false)} onSaved={load} />
      <DocModal open={docOpen} onClose={() => setDocOpen(false)} onSaved={load} />
    </div>
  );
}

function AssetModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [type, setType] = useState("device");
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [purchase, setPurchase] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cost, setCost] = useState("");

  useEffect(() => {
    if (open) {
      setType("device");
      setName("");
      setDetails("");
      setPurchase("");
      setExpiry("");
      setCost("");
    }
  }, [open]);

  async function save() {
    if (!name.trim()) return;
    await supabase.from("digital_assets").insert({
      type,
      name: name.trim(),
      details: details || null,
      purchase_date: purchase || null,
      expiry_date: expiry || null,
      cost: parseFloat(cost) || null,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.digital.add}>
      <div className="space-y-4">
        <Field label={t.common.category}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="device">{t.digital.devices}</option>
            <option value="license">{t.digital.licenses}</option>
            <option value="domain">{t.digital.domains}</option>
            <option value="service">{t.digital.services}</option>
            <option value="cloud">Cloud</option>
          </Select>
        </Field>
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t.common.description}>
          <Input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="MacBook Pro M3, 16GB…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.digital.purchased}>
            <Input type="date" value={purchase} onChange={(e) => setPurchase(e.target.value)} />
          </Field>
          <Field label={t.digital.expiry}>
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>
        <Field label={`${t.common.amount} (€)`}>
          <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Button className="w-full" onClick={save} disabled={!name.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function DocModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setCategory("other");
      setNumber("");
      setExpiry("");
    }
  }, [open]);

  async function save() {
    if (!name.trim()) return;
    await supabase.from("documents").insert({
      name: name.trim(),
      category,
      number: number || null,
      expiry_date: expiry || null,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.digital.add}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Passaporte" />
        </Field>
        <Field label={t.digital.category}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="passport">{t.digital.passport}</option>
            <option value="id">{t.digital.id}</option>
            <option value="license">{t.digital.license}</option>
            <option value="insurance">{t.digital.insurance}</option>
            <option value="contract">{t.digital.contract}</option>
            <option value="other">{t.digital.other}</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.name}>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Nº documento" />
          </Field>
          <Field label={t.digital.expiry}>
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>
        <Button className="w-full" onClick={save} disabled={!name.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
