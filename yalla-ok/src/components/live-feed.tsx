"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import type { PublicTask } from "@/lib/types";
import { PUBLIC_TASK_COLUMNS } from "@/lib/types";
import { getBrowserClient } from "@/lib/supabase/client";
import { subscribeFeed } from "@/lib/realtime";
import { useServerClock } from "@/components/server-clock";
import { TaskCard } from "@/components/task-card";
import { LiveDot } from "@/components/live-dot";

const LEAVE_MS = 300;

function sortTasks(list: PublicTask[]) {
  return [...list].sort((a, b) => b.published_at.localeCompare(a.published_at));
}

export function LiveFeed({ initialTasks }: { initialTasks: PublicTask[] }) {
  const now = useServerClock();
  const [tasks, setTasks] = useState<PublicTask[]>(() =>
    initialTasks.filter((t) => new Date(t.expires_at).getTime() > now()),
  );
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState(0);
  const timers = useRef(new Map<string, number>());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const remove = useCallback((id: string) => {
    if (timers.current.has(id)) return;
    setLeaving((s) => new Set(s).add(id));
    const t = window.setTimeout(() => {
      setTasks((list) => list.filter((x) => x.id !== id));
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      timers.current.delete(id);
    }, LEAVE_MS);
    timers.current.set(id, t);
  }, []);

  const fetchOne = useCallback(
    async (id: string): Promise<PublicTask | null> => {
      const { data } = await getBrowserClient()
        .from("tasks")
        .select(PUBLIC_TASK_COLUMNS)
        .eq("id", id)
        .eq("status", "active")
        .gt("expires_at", new Date(now()).toISOString())
        .maybeSingle();
      return (data as PublicTask | null) ?? null;
    },
    [now],
  );

  const refetchAll = useCallback(async () => {
    const { data, error } = await getBrowserClient()
      .from("tasks")
      .select(PUBLIC_TASK_COLUMNS)
      .eq("status", "active")
      .gt("expires_at", new Date(now()).toISOString())
      .order("published_at", { ascending: false })
      .limit(200);
    if (!error && data) setTasks(data as PublicTask[]);
  }, [now]);

  useEffect(() => {
    let wasConnected = true;
    const unsubscribe = subscribeFeed(
      async (event) => {
        if (event.kind === "removed") {
          remove(event.task_id);
          return;
        }
        const task = await fetchOne(event.task_id);
        if (!task) {
          remove(event.task_id);
          return;
        }
        if (!tasksRef.current.some((t) => t.id === task.id)) setFresh((n) => n + 1);
        setTasks((list) => {
          const exists = list.some((t) => t.id === task.id);
          return sortTasks(exists ? list.map((t) => (t.id === task.id ? task : t)) : [task, ...list]);
        });
      },
      (connected) => {
        // Catch up on anything missed while the connection was down.
        if (connected && !wasConnected) void refetchAll();
        wasConnected = connected;
      },
    );

    const onVisible = () => {
      if (document.visibilityState === "visible") void refetchAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Safety net in case Realtime is unavailable.
    const poll = window.setInterval(() => void refetchAll(), 60_000);

    const pending = timers.current;
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
      for (const t of pending.values()) window.clearTimeout(t);
      pending.clear();
    };
  }, [fetchOne, refetchAll, remove]);

  useEffect(() => {
    if (!fresh) return;
    const t = window.setTimeout(() => setFresh(0), 4000);
    return () => window.clearTimeout(t);
  }, [fresh]);

  const count = tasks.length - leaving.size;

  return (
    <section aria-labelledby="live-heading">
      <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
        <h2 id="live-heading" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
          <LiveDot />
          Live Tasks
        </h2>
        <p className="text-sm font-medium text-ink-muted" aria-live="polite">
          <span className="tabular-nums font-semibold text-ink">{count}</span> {count === 1 ? "task" : "tasks"} now
        </p>
      </div>

      {fresh > 0 && (
        <div className="mb-4 flex animate-fade-in items-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700" role="status">
          <Sparkles className="h-4 w-4" aria-hidden />
          {fresh === 1 ? "A new task just landed" : `${fresh} new tasks just landed`}
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyFeed />
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} leaving={leaving.has(task.id)} onExpire={() => remove(task.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center rounded-4xl bg-lavender px-6 py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-card">
        <LiveDot />
      </div>
      <h3 className="text-lg font-bold text-ink">No live tasks right now</h3>
      <p className="mt-1 max-w-xs text-sm text-ink-muted">
        New tasks appear here the moment they’re posted. Need something done? Be the first.
      </p>
      <Link
        href="/post"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 font-semibold text-white shadow-fab transition hover:bg-brand-600"
      >
        <Plus className="h-5 w-5" aria-hidden /> Post a Task
      </Link>
    </div>
  );
}
