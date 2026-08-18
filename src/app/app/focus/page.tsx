"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { api } from "@/lib/api";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Select, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatTime } from "@/lib/format";
import type { FocusSession, Task } from "@/lib/types";
import { cn } from "@/lib/cn";

type Phase = "work" | "short" | "long";

export default function FocusPage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [workMin, setWorkMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [phase, setPhase] = useState<Phase>("work");
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [taskId, setTaskId] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [ts, ss] = await Promise.all([api.tasks(supabase), api.focusSessions(supabase)]);
    setTasks(ts.filter((x) => x.status !== "done"));
    setSessions(ss);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function handleComplete() {
    setRunning(false);
    if (phase === "work") {
      // log the session
      supabase.from("focus_sessions").insert({
        task_id: taskId || null,
        kind: "pomodoro",
        minutes: workMin,
      });
      const next = cycle + 1;
      setCycle(next);
      setPhase(next % 4 === 0 ? "long" : "short");
      setSecondsLeft((next % 4 === 0 ? workMin * 4 : breakMin) * 60);
      load();
    } else {
      setPhase("work");
      setSecondsLeft(workMin * 60);
    }
  }

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          handleComplete();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function start() {
    setRunning(true);
  }

  function pause() {
    setRunning(false);
  }

  function reset() {
    setRunning(false);
    setPhase("work");
    setSecondsLeft(workMin * 60);
    setCycle(0);
  }

  const todaySessions = sessions.filter((s) => new Date(s.started_at).toDateString() === new Date().toDateString());
  const todayMinutes = todaySessions.reduce((s, x) => s + x.minutes, 0);
  const totalFocus = sessions.reduce((s, x) => s + x.minutes, 0);

  const total = phase === "work" ? workMin * 60 : phase === "short" ? breakMin * 60 : workMin * 4 * 60;
  const pct = ((total - secondsLeft) / total) * 100;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  useEffect(() => {
    setSecondsLeft(workMin * 60);
  }, [workMin, phase === "work" && !running]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t.focus.title} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* timer */}
        <Card className="flex flex-col items-center py-8">
          <div className="relative flex h-56 w-56 items-center justify-center">
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={phase === "work" ? "#818cf8" : "#34d399"}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 45}
                strokeDashoffset={2 * Math.PI * 45 * (1 - pct / 100)}
                className="transition-all duration-500"
              />
            </svg>
            <div className="text-center">
              <p className="text-5xl font-bold tabular-nums tracking-tight text-zinc-100">
                {mm}:{ss}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                {phase === "work" ? t.focus.work : phase === "short" ? t.focus.shortBreak : t.focus.longBreak}
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button size="lg" onClick={running ? pause : start}>
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? t.focus.stop : t.focus.start}
            </Button>
            <div className="ml-2 flex items-center gap-1.5">
              <Flame className={cn("h-5 w-5", cycle > 0 ? "text-orange-400" : "text-zinc-600")} />
              <span className="text-sm font-semibold text-zinc-300">{cycle}</span>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <Field label={`${t.focus.work} (min)`}>
              <Select value={String(workMin)} onChange={(e) => setWorkMin(parseInt(e.target.value))}>
                {[15, 20, 25, 30, 45, 50].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`${t.focus.shortBreak} (min)`}>
              <Select value={String(breakMin)} onChange={(e) => setBreakMin(parseInt(e.target.value))}>
                {[5, 10, 15, 20].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.focus.linkTask}>
              <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">—</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title.slice(0, 24)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        {/* sessions */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.focus.today}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100">{todaySessions.length}</p>
              <p className="text-xs text-zinc-500">{todayMinutes} {t.focus.minutes}</p>
            </Card>
            <Card>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.focus.sessions}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100">{sessions.length}</p>
              <p className="text-xs text-zinc-500">{totalFocus} {t.focus.minutes}</p>
            </Card>
          </div>

          <Card>
            <CardHeader title={t.focus.sessions} />
            {sessions.length === 0 ? (
              <EmptyState icon="⏱️" title={t.focus.sessions} subtitle={t.focus.start} />
            ) : (
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {sessions.slice(0, 30).map((s) => {
                  const task = tasks.find((x) => x.id === s.task_id);
                  return (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                      <Timer className="h-4 w-4 shrink-0 text-indigo-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-200">{task?.title ?? t.focus.deepWork}</p>
                        <p className="text-[11px] text-zinc-500">{new Date(s.started_at).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })} · {formatTime(s.started_at)}</p>
                      </div>
                      <Badge color="violet">{s.minutes}′</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
