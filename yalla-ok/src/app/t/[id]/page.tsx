import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, MapPin, UserRound } from "lucide-react";
import { getTaskForViewer } from "./data";
import { formatMoney, timeAgo, formatDateTime, durationLabel } from "@/lib/format";
import { taskImageUrl } from "@/lib/env";
import { Countdown } from "@/components/countdown";
import { DemoBadge } from "@/components/task-card";
import { StatusBadge, effectiveStatus } from "@/components/status-badge";
import { Notice, buttonClass } from "@/components/ui";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { ReportTask } from "./report-task";
import { ShareButton } from "./share-button";
import { MarkTakenButton } from "@/app/my/mark-taken-button";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { task } = await getTaskForViewer(id);
  if (!task || task.status !== "active") return { title: "Task not available", robots: { index: false } };
  const title = `${formatMoney(task.reward_cents)} · ${task.headline}`;
  const description = `${task.description} — ${task.location}. Contact the poster on WhatsApp via Yalla Ok.`;
  return {
    title,
    description,
    alternates: { canonical: `/t/${task.id}` },
    openGraph: { type: "article", title, description, url: `/t/${task.id}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TaskPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const { task, session } = await getTaskForViewer(id);
  if (!task) notFound();

  const isOwner = !!session.user && task.user_id === session.user.id;
  const status = effectiveStatus(task);
  const live = status === "active";
  const img = taskImageUrl(task.image_path, "lg");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Live tasks
      </Link>

      {sp.posted === "1" && live && (
        <Notice tone="success" title="Your task is live!" className="mb-5 animate-pop-in">
          People can see it now and contact you on WhatsApp. The countdown has started.
        </Notice>
      )}
      {sp.demo === "1" && (
        <Notice tone="warning" title="This is a demo task" className="mb-5">
          Demonstration listings aren’t real, so there’s no one to contact.
        </Notice>
      )}

      <article className="overflow-hidden rounded-4xl bg-white shadow-card ring-1 ring-ink/5">
        {img && (
          <div className="relative aspect-[16/9] w-full bg-lavender">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt={task.headline} className="h-full w-full object-cover" />
          </div>
        )}

        <div className="space-y-6 p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            {task.is_demo && <DemoBadge />}
            {(isOwner || !live) && <StatusBadge status={status} />}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-5xl font-extrabold tracking-tight text-brand-500 sm:text-6xl">{formatMoney(task.reward_cents)}</p>
              <p className="mt-1 text-xs font-medium text-ink-muted">Reward paid by the poster, directly to you</p>
            </div>
            {live && task.expires_at && <Countdown expiresAt={task.expires_at} size="lg" />}
          </div>

          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">{task.headline}</h1>
            <p className="mt-3 text-lg leading-relaxed text-ink-soft">{task.description}</p>
          </div>

          <dl className="grid grid-cols-1 gap-3 rounded-3xl bg-lavender p-4 text-sm sm:grid-cols-3 sm:p-5">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-brand-500" aria-hidden />
              <div>
                <dt className="text-xs text-ink-muted">Location</dt>
                <dd className="font-semibold text-ink">{task.location}</dd>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock3 className="h-5 w-5 text-brand-500" aria-hidden />
              <div>
                <dt className="text-xs text-ink-muted">Posted</dt>
                <dd className="font-semibold text-ink" title={formatDateTime(task.published_at ?? task.created_at)}>
                  {task.published_at ? timeAgo(task.published_at) : "Not published yet"}
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <UserRound className="h-5 w-5 text-brand-500" aria-hidden />
              <div>
                <dt className="text-xs text-ink-muted">Posted by</dt>
                <dd className="font-semibold text-ink">{task.poster_name}</dd>
              </div>
            </div>
          </dl>

          {live ? (
            <div className="space-y-3">
              <a
                href={`/t/${task.id}/contact`}
                rel="nofollow noopener"
                className={`${buttonClass.whatsapp} w-full`}
              >
                <WhatsAppIcon className="h-6 w-6" />
                Contact on WhatsApp
              </a>
              <p className="text-center text-xs text-ink-muted">
                Agree on the details and payment directly with the poster. Yalla Ok doesn’t handle the reward.
              </p>
            </div>
          ) : (
            <Notice tone="info" title={statusTitle(status)}>
              {statusText(status, task.duration_minutes)}
            </Notice>
          )}

          {isOwner && (
            <div className="flex flex-wrap gap-2 border-t border-ink/5 pt-5">
              {live && <MarkTakenButton taskId={task.id} />}
              {(status === "draft" || status === "pending_payment") && (
                <Link href={`/pay/${task.id}`} className={buttonClass.primary}>
                  {status === "draft" ? "Pay listing fee" : "View payment"}
                </Link>
              )}
              <Link href="/my" className={buttonClass.secondary}>
                My Tasks
              </Link>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-ink/5 pt-4">
            <ShareButton title={task.headline} />
            {!isOwner && live && !task.is_demo && <ReportTask taskId={task.id} />}
          </div>
        </div>
      </article>
    </div>
  );
}

function statusTitle(s: string) {
  switch (s) {
    case "taken":
      return "This task has been taken";
    case "expired":
      return "This task has expired";
    case "rejected":
      return "This task was not approved";
    case "pending_approval":
      return "Waiting for approval";
    case "pending_payment":
      return "Payment under review";
    default:
      return "Not published yet";
  }
}

function statusText(s: string, duration: number) {
  switch (s) {
    case "taken":
    case "expired":
      return "It’s no longer accepting contacts. Check the live feed for other tasks.";
    case "rejected":
      return "It doesn’t meet our guidelines and isn’t visible to anyone else.";
    case "pending_approval":
      return `A moderator will review it shortly. Once approved it goes live for ${durationLabel(duration)}.`;
    case "pending_payment":
      return `We’re checking your Whish payment. Once confirmed, it goes live for ${durationLabel(duration)}.`;
    default:
      return "Pay the listing fee to publish it.";
  }
}
