import "server-only";
import { cache } from "react";
import { getSession } from "@/lib/auth";
import type { Task } from "@/lib/types";

/** Loads a task as the current viewer: visitors see live tasks; owners and admins see more. */
export const getTaskForViewer = cache(async (id: string) => {
  const session = await getSession();
  if (!session.supabase || !/^[0-9a-f-]{36}$/i.test(id)) return { task: null, session } as const;
  const { data } = await session.supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  return { task: (data as Task | null) ?? null, session } as const;
});
