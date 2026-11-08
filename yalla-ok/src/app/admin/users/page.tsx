import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import type { Profile } from "@/lib/types";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, inputClass } from "@/components/ui";
import { setFreeBonusAction, setUserStatusAction } from "../actions";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, user: me } = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const settings = await getSettings();

  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(100);
  if (q) {
    const safe = q.replace(/[%_,()]/g, "");
    query = query.or(`email.ilike.%${safe}%,display_name.ilike.%${safe}%`);
  }
  const { data } = await query;
  const users = (data ?? []) as Profile[];

  const counts = new Map<string, number>();
  if (users.length) {
    const { data: tasks } = await supabase.from("tasks").select("user_id").in("user_id", users.map((u) => u.id)).neq("status", "draft");
    for (const t of tasks ?? []) counts.set(t.user_id!, (counts.get(t.user_id!) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Users</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Email or name" className={`${inputClass} py-2.5`} aria-label="Find a user" />
          <button className={`${buttonClass.secondary} py-2.5`}>Find</button>
        </form>
      </div>

      <ul className="space-y-3">
        {users.map((u) => {
          const allowance = Math.max(0, settings.free_posts + u.free_posts_bonus);
          return (
            <li key={u.id} className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink/5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">
                    {u.display_name}{" "}
                    {u.role === "admin" && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">admin</span>}{" "}
                    {u.status !== "active" && (
                      <span className="rounded-full bg-coral-soft px-2 py-0.5 text-xs font-semibold text-coral">{u.status}</span>
                    )}
                  </p>
                  <p className="truncate text-sm text-ink-muted">
                    {u.email} · joined {formatDateTime(u.created_at)}
                  </p>
                  <p className="mt-1 text-sm">
                    <Link href={`/admin/tasks?status=all&user=${u.id}`} className="font-semibold text-brand-600">
                      {counts.get(u.id) ?? 0} posted
                    </Link>{" "}
                    · free posts used {u.free_posts_used} of {allowance}
                  </p>
                </div>

                {u.id !== me.id && (
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionForm action={setFreeBonusAction} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={u.id} />
                      <label className="text-xs text-ink-muted" htmlFor={`bonus-${u.id}`}>
                        Extra free
                      </label>
                      <input
                        id={`bonus-${u.id}`}
                        name="bonus"
                        type="number"
                        defaultValue={u.free_posts_bonus}
                        className={`${inputClass} w-20 py-2 text-center`}
                      />
                      <SubmitButton className={`${buttonClass.secondary} py-2 text-sm`}>Set</SubmitButton>
                    </ActionForm>
                    <ActionForm
                      action={setUserStatusAction}
                      className="flex gap-2"
                      confirm="Change this account’s status? Banning also takes down all of their open listings."
                    >
                      <input type="hidden" name="user_id" value={u.id} />
                      {u.status !== "active" && (
                        <SubmitButton name="status" value="active" className={`${buttonClass.secondary} py-2 text-sm`}>
                          Reactivate
                        </SubmitButton>
                      )}
                      {u.status === "active" && (
                        <SubmitButton name="status" value="suspended" className={`${buttonClass.secondary} py-2 text-sm`}>
                          Suspend
                        </SubmitButton>
                      )}
                      {u.status !== "banned" && (
                        <SubmitButton name="status" value="banned" className={`${buttonClass.danger} py-2 text-sm`}>
                          Ban
                        </SubmitButton>
                      )}
                    </ActionForm>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {users.length === 0 && <p className="rounded-3xl bg-lavender px-5 py-10 text-center text-ink-muted">No users found.</p>}
    </div>
  );
}
