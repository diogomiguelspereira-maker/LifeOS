"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
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
import type { AIMemory, Profile } from "@/lib/types";
import { cn } from "@/lib/cn";

const CATEGORIES = ["preferences", "goals", "routines", "importantDates", "projects"] as const;

export default function AiMemoryPage() {
  const { t, profile, setProfile } = useApp();
  const supabase = useSupabase();
  const [memory, setMemory] = useState<AIMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const memoryEnabled = (profile?.preferences as Record<string, unknown>)?.ai_memory !== false;

  const load = useCallback(async () => {
    setMemory(await api.aiMemory(supabase));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleMemory(v: boolean) {
    const prefs = { ...((profile?.preferences as Record<string, unknown>) ?? {}), ai_memory: v };
    const updated = await supabase.from("profiles").update({ preferences: prefs }).eq("id", profile!.id).select().single();
    if (updated.data) setProfile(updated.data as Profile);
  }

  const personality = ((profile?.preferences as Record<string, unknown>)?.nova_personality as string) ?? "friendly";

  async function setPersonality(p: string) {
    const prefs = { ...((profile?.preferences as Record<string, unknown>) ?? {}), nova_personality: p };
    const updated = await supabase.from("profiles").update({ preferences: prefs }).eq("id", profile!.id).select().single();
    if (updated.data) setProfile(updated.data as Profile);
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
        title={t.aimemory.title}
        subtitle={t.aimemory.subtitle}
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t.aimemory.add}
          </Button>
        }
      />

      <Card>
        <CardHeader title={t.personality.title} />
        <div className="flex flex-wrap gap-2">
          {(["friendly", "professional", "coach", "minimal", "analytical"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPersonality(p)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                personality === p
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:bg-white/5"
              )}
            >
              {t.personality[p]}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t.aimemory.title}
          action={
            <button
              onClick={() => toggleMemory(!memoryEnabled)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                memoryEnabled
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                  : "border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400"
              )}
            >
              {memoryEnabled ? t.aimemory.enable : t.aimemory.disabled}
            </button>
          }
        />

        {!memoryEnabled ? (
          <EmptyState icon="🧠" title={t.aimemory.disabled} subtitle={t.aimemory.subtitle} />
        ) : memory.length === 0 ? (
          <EmptyState icon="🧠" title={t.aimemory.empty} />
        ) : (
          <div className="space-y-3">
            {CATEGORIES.map((cat) => {
              const list = memory.filter((m) => m.category === cat);
              if (list.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    {t.aimemory[cat]}
                  </p>
                  <div className="space-y-1.5">
                    {list.map((m) => (
                      <div key={m.id} className="group flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/6 px-3 py-2">
                        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{m.key}</span>
                        <span className="flex-1 text-sm text-zinc-500">{m.value}</span>
                        <button
                          onClick={async () => {
                            await supabase.from("ai_memory").delete().eq("id", m.id);
                            load();
                          }}
                          className="rounded-lg p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <MemoryModal open={open} onClose={() => setOpen(false)} onSaved={load} />
    </div>
  );
}

function MemoryModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [category, setCategory] = useState("preferences");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) {
      setCategory("preferences");
      setKey("");
      setValue("");
    }
  }, [open]);

  async function save() {
    if (!key.trim() || !value.trim()) return;
    await supabase.from("ai_memory").insert({ category, key: key.trim(), value: value.trim() });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.aimemory.add}>
      <div className="space-y-4">
        <Field label={t.aimemory.category}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="preferences">{t.aimemory.preferences}</option>
            <option value="goals">{t.aimemory.goals}</option>
            <option value="routines">{t.aimemory.routines}</option>
            <option value="importantDates">{t.aimemory.importantDates}</option>
            <option value="projects">{t.aimemory.projects}</option>
          </Select>
        </Field>
        <Field label={t.aimemory.key}>
          <Input value={key} onChange={(e) => setKey(e.target.value)} autoFocus placeholder="ex: prefere chá a café" />
        </Field>
        <Field label={t.aimemory.value}>
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Button className="w-full" onClick={save} disabled={!key.trim() || !value.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
