"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Progress,
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import type { Book, Course, StudySession } from "@/lib/types";
import { cn } from "@/lib/cn";

type Tab = "books" | "courses" | "study";

export default function LearningPage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [tab, setTab] = useState<Tab>("books");
  const [books, setBooks] = useState<Book[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [study, setStudy] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookOpen, setBookOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);

  const load = useCallback(async () => {
    const [bs, cs, ss] = await Promise.all([api.books(supabase), api.courses(supabase), api.studySessions(supabase, 90)]);
    setBooks(bs);
    setCourses(cs);
    setStudy(ss);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const totalHours = useMemo(() => study.reduce((s, x) => s + x.minutes, 0) / 60, [study]);
  const monthHours = useMemo(() => {
    const mk = new Date().toISOString().slice(0, 7);
    return study.filter((s) => s.date.startsWith(mk)).reduce((s, x) => s + x.minutes, 0) / 60;
  }, [study]);
  const reading = books.filter((b) => b.status === "reading").length;
  const finished = books.filter((b) => b.status === "finished").length;

  async function removeBook(id: string) {
    await supabase.from("books").delete().eq("id", id);
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
        title={t.learning.title}
        action={
          tab === "books" ? (
            <Button onClick={() => setBookOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.learning.addBook}
            </Button>
          ) : tab === "courses" ? (
            <Button onClick={() => setCourseOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.learning.addCourse}
            </Button>
          ) : (
            <Button onClick={() => setStudyOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.learning.addStudy}
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.learning.totalHours}</p>
          <p className="mt-1.5 text-2xl font-bold text-zinc-100">{totalHours.toFixed(1)}h</p>
          <p className="text-xs text-zinc-500">{t.learning.thisMonth}: {monthHours.toFixed(1)}h</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.learning.books}</p>
          <p className="mt-1.5 text-2xl font-bold text-zinc-100">{books.length}</p>
          <p className="text-xs text-zinc-500">{t.learning.reading}: {reading} · {t.learning.finished}: {finished}</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.learning.courses}</p>
          <p className="mt-1.5 text-2xl font-bold text-zinc-100">{courses.length}</p>
          <p className="text-xs text-zinc-500">{t.learning.hours}: {courses.reduce((s, c) => s + c.hours, 0)}h</p>
        </Card>
      </div>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "books", label: t.learning.books },
          { value: "courses", label: t.learning.courses },
          { value: "study", label: t.learning.study },
        ]}
      />

      {tab === "books" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {books.length === 0 && (
            <Card className="sm:col-span-2 lg:col-span-3">
              <EmptyState icon="📚" title={t.learning.addBook} />
            </Card>
          )}
          {books.map((b) => (
            <Card key={b.id} className="group">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{b.title}</p>
                  <p className="text-[11px] text-zinc-500">{b.author ?? ""}</p>
                </div>
                <button onClick={() => removeBook(b.id)} className="rounded-lg p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge color={b.status === "reading" ? "blue" : b.status === "finished" ? "green" : "zinc"}>
                  {t.learning[b.status]}
                </Badge>
                {b.rating && <span className="text-xs text-amber-400">{"★".repeat(b.rating)}</span>}
              </div>
              <div className="mt-2 flex gap-1">
                {(["want", "reading", "finished"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={async () => {
                      await supabase.from("books").update({ status: s, started_at: s === "reading" ? b.started_at ?? new Date().toISOString().slice(0, 10) : b.started_at, finished_at: s === "finished" ? new Date().toISOString().slice(0, 10) : null }).eq("id", b.id);
                      load();
                    }}
                    className={cn(
                      "flex-1 rounded-lg border px-1.5 py-1 text-[10px] font-medium transition",
                      b.status === s ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-300" : "border-white/10 text-zinc-500 hover:bg-white/5"
                    )}
                  >
                    {t.learning[s]}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "courses" && (
        <Card>
          {courses.length === 0 ? (
            <EmptyState icon="🎓" title={t.learning.addCourse} />
          ) : (
            <div className="space-y-3">
              {courses.map((c) => (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-zinc-200">{c.name}</span>
                    <span className="text-xs text-zinc-500">{c.platform ?? ""} · {c.progress}%</span>
                  </div>
                  <Progress value={c.progress} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "study" && (
        <Card>
          <CardHeader title={t.learning.study} />
          {study.length === 0 ? (
            <EmptyState icon="⏱️" title={t.learning.addStudy} />
          ) : (
            <div className="space-y-1.5">
              {study.slice(0, 30).map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="text-zinc-400">{s.date}</span>
                  <span className="text-zinc-200">{s.subject ?? t.learning.study}</span>
                  <Badge color="violet" className="ml-auto">
                    {s.minutes}′
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <BookModal open={bookOpen} onClose={() => setBookOpen(false)} onSaved={load} />
      <CourseModal open={courseOpen} onClose={() => setCourseOpen(false)} onSaved={load} />
      <StudyModal open={studyOpen} onClose={() => setStudyOpen(false)} onSaved={load} />
    </div>
  );
}

function BookModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState("want");

  useEffect(() => {
    if (open) {
      setTitle("");
      setAuthor("");
      setStatus("want");
    }
  }, [open]);

  async function save() {
    if (!title.trim()) return;
    await supabase.from("books").insert({ title: title.trim(), author: author || null, status });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.learning.addBook}>
      <div className="space-y-4">
        <Field label={t.common.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={t.common.name}>
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Autor" />
        </Field>
        <Field label={t.learning.status}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="want">{t.learning.want}</option>
            <option value="reading">{t.learning.reading}</option>
            <option value="finished">{t.learning.finished}</option>
          </Select>
        </Field>
        <Button className="w-full" onClick={save} disabled={!title.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function CourseModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [progress, setProgress] = useState("0");

  useEffect(() => {
    if (open) {
      setName("");
      setPlatform("");
      setProgress("0");
    }
  }, [open]);

  async function save() {
    if (!name.trim()) return;
    await supabase.from("courses").insert({ name: name.trim(), platform: platform || null, progress: Math.min(100, parseInt(progress) || 0) });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.learning.addCourse}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plataforma">
            <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Udemy, YouTube…" />
          </Field>
          <Field label={`${t.learning.progress} %`}>
            <Input type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
          </Field>
        </div>
        <Button className="w-full" onClick={save} disabled={!name.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function StudyModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [minutes, setMinutes] = useState("45");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) {
      setMinutes("45");
      setSubject("");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  async function save() {
    await supabase.from("study_sessions").insert({ date, minutes: parseInt(minutes) || 45, subject: subject || null });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.learning.addStudy}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.date}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={`${t.focus.minutes} (min)`}>
            <Input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
        </div>
        <Field label={t.common.category}>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="TypeScript, História…" />
        </Field>
        <Button className="w-full" onClick={save}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
