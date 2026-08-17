"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus, Send, Sparkles } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { Badge, Button, Card, Modal } from "@/components/ui";
import type { AIMessage, NovaAction, NovaResponse } from "@/lib/types";
import { cn } from "@/lib/cn";

function NovaChat() {
  const { t, profile } = useApp();
  const supabase = useSupabase();
  const params = useSearchParams();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [pending, setPending] = useState<{ action: NovaAction; reply: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d) => setOnline(Boolean(d.configured)))
      .catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const autoAsk = useCallback(
    async (q: string) => {
      if (!q) return;
      setInput(q);
      send(q);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    const q = params.get("q");
    if (q) autoAsk(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    setInput("");
    setThinking(true);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, conversation_id: convId ?? "", user_id: "", role: "user", content, created_at: new Date().toISOString() }]);

    const res = await fetch("/api/nova", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content, conversation_id: convId }),
    });
    const data = (await res.json()) as NovaResponse & { conversation_id?: string };
    setThinking(false);

    if (data.conversation_id) setConvId(data.conversation_id);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}-a`, conversation_id: data.conversation_id ?? "", user_id: "", role: "assistant", content: data.reply, created_at: new Date().toISOString() },
    ]);
    if (data.action) {
      setPending({ action: data.action, reply: data.reply });
    }
  }

  async function newConversation() {
    setConvId(null);
    setMessages([]);
  }

  async function executeAction() {
    if (!pending) return;
    const { action } = pending;
    try {
      switch (action.kind) {
        case "create_task": {
          const p = action.payload as { title: string; due_date?: string | null; notes?: string };
          await supabase.from("tasks").insert({ title: p.title, due_date: p.due_date ?? null, notes: p.notes ?? null });
          break;
        }
        case "create_event": {
          const p = action.payload as { title: string; start_at?: string; end_at?: string };
          const start = p.start_at ? new Date(p.start_at) : new Date(Date.now() + 3600000);
          const end = p.end_at ? new Date(p.end_at) : new Date(start.getTime() + 3600000);
          await supabase.from("calendar_events").insert({ title: p.title, start_at: start.toISOString(), end_at: end.toISOString() });
          break;
        }
        case "create_goal": {
          const p = action.payload as { name: string; target_amount?: number; deadline?: string | null };
          await supabase.from("savings_goals").insert({
            name: p.name,
            target_amount: p.target_amount ?? 500,
            current_amount: 0,
            deadline: p.deadline ?? null,
            icon: "🎯",
          });
          break;
        }
        case "create_note": {
          const p = action.payload as { title: string; content?: string };
          await supabase.from("notes").insert({ title: p.title, content: p.content ?? "" });
          break;
        }
        case "create_transaction": {
          const p = action.payload as { amount: number; description?: string; type?: "expense" | "income"; category_name?: string };
          const amount = p.type === "expense" ? -Math.abs(p.amount) : Math.abs(p.amount);
          let categoryId: string | null = null;
          if (p.category_name) {
            const { data: cats } = await supabase.from("categories").select("*").eq("name", p.category_name).eq("type", p.type ?? "expense");
            if (cats?.length) categoryId = cats[0].id;
          }
          const { data: accs } = await supabase.from("accounts").select("*").limit(1);
          const firstAccount = accs?.[0] ?? null;
          await supabase.from("transactions").insert({
            amount,
            description: p.description ?? p.category_name ?? "",
            category_id: categoryId,
            account_id: firstAccount?.id ?? null,
            date: new Date().toISOString().slice(0, 10),
          });
          if (firstAccount) {
            await supabase
              .from("accounts")
              .update({ balance: (firstAccount.balance ?? 0) + amount })
              .eq("id", firstAccount.id);
          }
          break;
        }
      }
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}-done`, conversation_id: "", user_id: "", role: "assistant", content: "✅ Feito!", created_at: new Date().toISOString() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}-err`, conversation_id: "", user_id: "", role: "assistant", content: "❌ Não consegui guardar. Tenta novamente.", created_at: new Date().toISOString() },
      ]);
    }
    setPending(null);
  }

  const suggestions = t.nova.suggestions;

  return (
    <div className="flex h-[calc(100dvh-140px)] flex-col lg:h-[calc(100dvh-120px)]">
      {/* header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-zinc-100">{t.nova.title}</p>
            <p className="text-xs text-zinc-500">
              {online === null ? "…" : online ? (
                <span className="text-emerald-400">● online</span>
              ) : (
                <span className="text-amber-400">● {t.nova.offline}</span>
              )}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={newConversation}>
          <Plus className="h-4 w-4" />
          {t.common.add}
        </Button>
      </div>

      {/* messages */}
      <Card className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-xl shadow-indigo-500/30">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-200">{t.nova.subtitle}</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-500">
                {profile?.name?.split(" ")[0] ? `Olá ${profile.name.split(" ")[0]}! ` : ""}Pergunta o que quiseres sobre o teu dinheiro, tarefas, calendário e objetivos.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-indigo-400/40 hover:bg-indigo-500/10"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed animate-slide-up",
                  m.role === "user"
                    ? "rounded-br-md bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
                    : "rounded-bl-md bg-white/6 text-zinc-200 dark:bg-white/6"
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
              {t.nova.thinking}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </Card>

      {/* input */}
      <div className="mt-3 flex items-end gap-2">
        <div className="flex flex-1 items-center rounded-2xl border border-white/10 bg-white/5 px-4 focus-within:border-indigo-400/50">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={t.nova.placeholder}
            className="h-12 w-full bg-transparent py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
        </div>
        <Button size="lg" className="h-12 rounded-2xl" onClick={() => send()} disabled={!input.trim() || thinking}>
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* action confirmation */}
      <Modal open={!!pending} onClose={() => setPending(null)} title={t.nova.confirmTitle}>
        {pending && (
          <div className="space-y-4">
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                {pending.action.kind.replace("create_", "create ")}
              </p>
              <p className="mt-1.5 text-sm text-zinc-200">{JSON.stringify(pending.action.payload, null, 2)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPending(null)}>
                {t.common.cancel}
              </Button>
              <Button className="flex-1" onClick={executeAction}>
                {t.nova.confirm}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function NovaPage() {
  return (
    <Suspense fallback={null}>
      <NovaChat />
    </Suspense>
  );
}
