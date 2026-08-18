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
import type { CareerGoal, JobApplication, Skill } from "@/lib/types";
import { cn } from "@/lib/cn";

type Tab = "roadmap" | "skills" | "applications";

export default function CareerPage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [tab, setTab] = useState<Tab>("roadmap");
  const [goals, setGoals] = useState<CareerGoal[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [goalOpen, setGoalOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [appOpen, setAppOpen] = useState(false);

  const load = useCallback(async () => {
    const [g, s, a] = await Promise.all([
      api.careerGoals(supabase),
      api.skills(supabase),
      api.jobApplications(supabase),
    ]);
    setGoals(g);
    setSkills(s);
    setApps(a);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const avgSkill = useMemo(
    () => (skills.length ? Math.round(skills.reduce((s, x) => s + x.level, 0) / skills.length) : 0),
    [skills]
  );
  const activeApps = apps.filter((a) => a.status === "applied" || a.status === "interview").length;
  const offers = apps.filter((a) => a.status === "offer").length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const statusColor: Record<string, "zinc" | "blue" | "green" | "red" | "amber"> = {
    applied: "blue",
    interview: "amber",
    offer: "green",
    rejected: "red",
    withdrawn: "zinc",
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.career.title}
        action={
          tab === "roadmap" ? (
            <Button onClick={() => setGoalOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.career.addGoal}
            </Button>
          ) : tab === "skills" ? (
            <Button onClick={() => setSkillOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.career.addSkill}
            </Button>
          ) : (
            <Button onClick={() => setAppOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.career.addApp}
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.career.roadmap}</p>
          <p className="mt-1.5 text-2xl font-bold text-zinc-100">{goals.filter((g) => g.status === "active").length}</p>
          <p className="text-xs text-zinc-500">{t.career.noData}</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.career.skills}</p>
          <p className="mt-1.5 text-2xl font-bold text-zinc-100">{skills.length}</p>
          <p className="text-xs text-zinc-500">
            {t.career.level}: {avgSkill}/5
          </p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.career.applications}</p>
          <p className="mt-1.5 text-2xl font-bold text-zinc-100">{activeApps}</p>
          <p className="text-xs text-zinc-500">
            {t.career.offer}: {offers}
          </p>
        </Card>
      </div>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "roadmap", label: t.career.roadmap },
          { value: "skills", label: t.career.skills },
          { value: "applications", label: t.career.applications },
        ]}
      />

      {tab === "roadmap" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.length === 0 && (
            <Card className="sm:col-span-2">
              <EmptyState icon="🧭" title={t.career.addGoal} />
            </Card>
          )}
          {goals.map((g) => (
            <Card key={g.id} className="group">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{g.title}</p>
                  <p className="text-[11px] text-zinc-500">{g.timeline ?? ""}</p>
                </div>
                <button
                  onClick={async () => {
                    await supabase.from("career_goals").delete().eq("id", g.id);
                    load();
                  }}
                  className="rounded-lg p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{g.description}</p>
              <div className="mt-2">
                <Badge color={g.status === "achieved" ? "green" : g.status === "active" ? "blue" : "zinc"}>
                  {g.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "skills" && (
        <Card>
          <CardHeader title={t.career.skills} />
          {skills.length === 0 ? (
            <EmptyState icon="💪" title={t.career.addSkill} />
          ) : (
            <div className="space-y-4">
              {skills.map((s) => (
                <div key={s.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-zinc-200">{s.name}</span>
                    <span className="text-xs text-zinc-500">
                      {t.career.level} {s.level}/5 → {t.career.target} {s.target_level}/5
                    </span>
                  </div>
                  <Progress value={(s.level / 5) * 100} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "applications" && (
        <div className="space-y-3">
          {apps.length === 0 && (
            <Card>
              <EmptyState icon="💼" title={t.career.addApp} />
            </Card>
          )}
          {apps.map((a) => (
            <Card key={a.id} className="group">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{a.position}</p>
                  <p className="text-[11px] text-zinc-500">
                    {a.company} · {a.applied_date}
                    {a.salary ? ` · ${a.salary}€` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={a.status}
                    onChange={async (e) => {
                      await supabase.from("job_applications").update({ status: e.target.value }).eq("id", a.id);
                      load();
                    }}
                    className="h-8 w-auto px-2 text-xs"
                  >
                    <option value="applied">{t.career.applied}</option>
                    <option value="interview">{t.career.interview}</option>
                    <option value="offer">{t.career.offer}</option>
                    <option value="rejected">{t.career.rejected}</option>
                    <option value="withdrawn">{t.career.withdrawn}</option>
                  </Select>
                  <button
                    onClick={async () => {
                      await supabase.from("job_applications").delete().eq("id", a.id);
                      load();
                    }}
                    className="rounded-lg p-1 text-zinc-600 transition hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-1.5">
                <Badge color={statusColor[a.status] ?? "zinc"}>{t.career[a.status]}</Badge>
                {a.interview_date && (
                  <span className="ml-2 text-[11px] text-zinc-500">
                    {t.career.interviewDate}: {a.interview_date}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CareerGoalModal open={goalOpen} onClose={() => setGoalOpen(false)} onSaved={load} />
      <SkillModal open={skillOpen} onClose={() => setSkillOpen(false)} onSaved={load} />
      <AppModal open={appOpen} onClose={() => setAppOpen(false)} onSaved={load} />
    </div>
  );
}

function CareerGoalModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [title, setTitle] = useState("");
  const [timeline, setTimeline] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setTimeline("");
    }
  }, [open]);

  async function save() {
    if (!title.trim()) return;
    await supabase.from("career_goals").insert({ title: title.trim(), timeline: timeline || null });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.career.addGoal}>
      <div className="space-y-4">
        <Field label={t.common.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={t.career.roadmap}>
          <Input value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder="Junior → Mid → Senior" />
        </Field>
        <Button className="w-full" onClick={save} disabled={!title.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function SkillModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [level, setLevel] = useState("1");
  const [target, setTarget] = useState("3");

  useEffect(() => {
    if (open) {
      setName("");
      setLevel("1");
      setTarget("3");
    }
  }, [open]);

  async function save() {
    if (!name.trim()) return;
    await supabase.from("skills").insert({
      name: name.trim(),
      level: Math.min(5, parseInt(level) || 1),
      target_level: Math.min(5, parseInt(target) || 3),
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.career.addSkill}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t.career.level} (1-5)`}>
            <Input type="number" min={1} max={5} value={level} onChange={(e) => setLevel(e.target.value)} />
          </Field>
          <Field label={`${t.career.target} (1-5)`}>
            <Input type="number" min={1} max={5} value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
        </div>
        <Button className="w-full" onClick={save} disabled={!name.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function AppModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [salary, setSalary] = useState("");
  const [interview, setInterview] = useState("");

  useEffect(() => {
    if (open) {
      setCompany("");
      setPosition("");
      setSalary("");
      setInterview("");
    }
  }, [open]);

  async function save() {
    if (!company.trim() || !position.trim()) return;
    await supabase.from("job_applications").insert({
      company: company.trim(),
      position: position.trim(),
      salary: parseFloat(salary) || null,
      interview_date: interview || null,
    });
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t.career.addApp}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.career.company}>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} autoFocus />
          </Field>
          <Field label={t.career.position}>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t.career.salary} (€)`}>
            <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
          </Field>
          <Field label={t.career.interviewDate}>
            <Input type="date" value={interview} onChange={(e) => setInterview(e.target.value)} />
          </Field>
        </div>
        <Button className="w-full" onClick={save} disabled={!company.trim() || !position.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
