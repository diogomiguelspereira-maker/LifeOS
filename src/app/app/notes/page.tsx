"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookHeart, Plus, Search, StickyNote, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Segmented,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import type { JournalEntry, Note } from "@/lib/types";
import { cn } from "@/lib/cn";

const MOODS = ["😊", "😐", "😔", "😡", "😴", "🤩", "😰"];

type Tab = "notes" | "journal";

function NotesPageInner() {
  const { t } = useApp();
  const supabase = useSupabase();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("notes");
  const [notes, setNotes] = useState<Note[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);

  const load = useCallback(async () => {
    const [ns, js] = await Promise.all([api.notes(supabase), api.journal(supabase)]);
    setNotes(ns);
    setJournal(js);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    if (params.get("new") === "1") setNoteOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let list = notes;
    if (onlyFavs) list = list.filter((n) => n.is_favorite);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return list;
  }, [notes, search, onlyFavs]);

  async function toggleFav(note: Note) {
    await supabase.from("notes").update({ is_favorite: !note.is_favorite }).eq("id", note.id);
    load();
  }

  async function removeNote(id: string) {
    await supabase.from("notes").delete().eq("id", id);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-14" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.notes.title}
        action={
          tab === "notes" ? (
            <Button onClick={() => { setEditing(null); setNoteOpen(true); }}>
              <Plus className="h-4 w-4" />
              {t.notes.addNote}
            </Button>
          ) : (
            <Button onClick={() => setJournalOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.notes.newEntry}
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "notes", label: t.notes.title },
            { value: "journal", label: t.notes.journal },
          ]}
        />
        {tab === "notes" && (
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-3 sm:max-w-xs">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.notes.search}
              className="h-10 w-full bg-transparent text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-500 outline-none"
            />
          </div>
        )}
      </div>

      {tab === "notes" ? (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlyFavs((v) => !v)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                onlyFavs
                  ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
                  : "border-zinc-200 dark:border-white/10 text-zinc-500 hover:bg-zinc-50 dark:bg-white/5"
              )}
            >
              ⭐ {t.notes.favorites}
            </button>
          </div>
          {filtered.length === 0 ? (
            <Card>
              <EmptyState icon="🗒️" title={t.notes.noNotes} />
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((note) => (
                <Card
                  key={note.id}
                  className="group cursor-pointer transition hover:bg-zinc-100 dark:bg-white/8"
                >
                  <div onClick={() => { setEditing(note); setNoteOpen(true); }}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{note.title}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFav(note); }}
                        className={cn("text-base transition", note.is_favorite ? "opacity-100" : "opacity-30 hover:opacity-100")}
                      >
                        ⭐
                      </button>
                    </div>
                    <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {note.content || "—"}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {note.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => removeNote(note.id)}
                      className="rounded-lg p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {journal.length === 0 ? (
            <Card>
              <EmptyState icon="📖" title={t.notes.writeJournal} />
            </Card>
          ) : (
            <div className="space-y-3">
              {journal.map((entry) => (
                <Card key={entry.id}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {new Date(entry.entry_date).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    {entry.mood && <span className="text-xl">{entry.mood}</span>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{entry.content}</p>
                  {entry.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <NoteModal open={noteOpen} onClose={() => setNoteOpen(false)} note={editing} onSaved={load} />
      <JournalModal open={journalOpen} onClose={() => setJournalOpen(false)} onSaved={load} />
    </div>
  );
}

function NoteModal({
  open,
  onClose,
  note,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  note: Note | null;
  onSaved: () => void;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(note?.title ?? "");
      setContent(note?.content ?? "");
      setTags(note?.tags.join(", ") ?? "");
    }
  }, [open, note]);

  async function save() {
    const payload = {
      title: title.trim() || "Sem título",
      content,
      tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
    };
    if (note) {
      await supabase.from("notes").update(payload).eq("id", note.id);
    } else {
      await supabase.from("notes").insert(payload);
    }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={note ? t.common.edit : t.notes.addNote}>
      <div className="space-y-4">
        <Field label={t.common.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={t.common.description}>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7} placeholder="Markdown suportado ✨" />
        </Field>
        <Field label={t.notes.tags}>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="trabalho, ideias" />
        </Field>
        <Button className="w-full" onClick={save}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function JournalModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [mood, setMood] = useState("😊");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (open) {
      setMood("😊");
      setContent("");
      setTags("");
    }
  }, [open]);

  async function save() {
    if (!content.trim()) return;
    await supabase.from("journal_entries").insert({
      entry_date: new Date().toISOString().slice(0, 10),
      mood,
      content: content.trim(),
      tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.notes.writeJournal}>
      <div className="space-y-4">
        <Field label={t.notes.mood}>
          <div className="flex gap-2">
            {MOODS.map((m) => (
              <button
                key={m}
                onClick={() => setMood(m)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition",
                  mood === m ? "border-indigo-400/60 bg-indigo-500/15" : "border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:bg-white/5"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t.common.description}>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Hoje foi stressante porque…" autoFocus />
        </Field>
        <Field label={t.notes.tags}>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="trabalho, família" />
        </Field>
        <Button className="w-full" onClick={save} disabled={!content.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

export default function NotesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-72" />
        </div>
      }
    >
      <NotesPageInner />
    </Suspense>
  );
}
