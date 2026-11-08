import Link from "next/link";
import { MapPin } from "lucide-react";
import type { PublicTask } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { taskImageUrl } from "@/lib/env";
import { Countdown } from "@/components/countdown";

export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-sun px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink ${className}`}
      title="Demonstration task — not a real listing"
    >
      Demo
    </span>
  );
}

export function TaskCard({ task, onExpire, leaving }: { task: PublicTask; onExpire?: () => void; leaving?: boolean }) {
  const img = taskImageUrl(task.image_path, "sm");
  const reward = formatMoney(task.reward_cents);
  return (
    <Link
      href={`/t/${task.id}`}
      className={`group relative flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-ink/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        leaving ? "animate-card-out pointer-events-none" : "animate-card-in"
      }`}
    >
      {/* Top panel: the photo, or (on wider screens) a soft panel with the reward so the grid lines up. */}
      {img ? (
        <div className="relative aspect-[16/8] w-full overflow-hidden bg-lavender">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
          {task.is_demo && <DemoBadge className="absolute left-3 top-3" />}
        </div>
      ) : (
        <div className="relative hidden aspect-[16/8] w-full items-end overflow-hidden bg-gradient-to-br from-brand-50 via-lavender to-sun-soft p-5 md:flex">
          <span className="pointer-events-none absolute -right-6 -top-10 text-[9rem] font-extrabold leading-none text-brand-500/[.06]" aria-hidden>
            $
          </span>
          {task.is_demo && <DemoBadge className="absolute left-4 top-4" />}
          <span className="relative text-[2.6rem] font-extrabold leading-none tracking-tight text-brand-500">{reward}</span>
        </div>
      )}

      <div className={`flex flex-1 gap-4 p-4 sm:p-5 ${img ? "flex-col" : "flex-row items-start md:flex-col"}`}>
        <div
          className={`shrink-0 font-extrabold tracking-tight text-brand-500 ${
            img
              ? "text-[2rem] leading-none"
              : "min-w-[4.5rem] rounded-2xl bg-lavender px-3 py-3 text-center text-[1.6rem] leading-none md:hidden"
          }`}
        >
          {reward}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 self-stretch">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-[1.05rem] font-bold leading-snug text-ink">{task.headline}</h3>
            {!img && task.is_demo && <DemoBadge className="mt-0.5 md:hidden" />}
          </div>
          <p className="line-clamp-2 text-sm leading-relaxed text-ink-soft">{task.description}</p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <span className="flex min-w-0 items-center gap-1 text-sm text-ink-muted">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{task.location}</span>
            </span>
            <Countdown expiresAt={task.expires_at} onExpire={onExpire} />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function TaskCardSkeleton() {
  return (
    <div className="relative flex gap-4 overflow-hidden rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink/5">
      <div className="h-16 w-20 rounded-2xl bg-lavender" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-4 w-3/4 rounded-full bg-lavender" />
        <div className="h-3 w-full rounded-full bg-lavender" />
        <div className="h-3 w-2/3 rounded-full bg-lavender" />
        <div className="mt-2 flex justify-between">
          <div className="h-3 w-20 rounded-full bg-lavender" />
          <div className="h-6 w-16 rounded-full bg-coral-soft" />
        </div>
      </div>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}
