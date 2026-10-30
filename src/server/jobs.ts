import "server-only";
import { prisma } from "./db";
import { processVideoAsset } from "./media";

// Small DB-backed job queue. Jobs are kicked in-process right after enqueueing
// and are also picked up by `npm run worker` (recommended in production so
// video processing never competes with web requests).

type JobType = "process_video";

export async function enqueue(type: JobType, payload: Record<string, unknown>) {
  const job = await prisma.job.create({ data: { type, payload: payload as object } });
  if (process.env.INLINE_JOBS !== "false") void runPendingJobs().catch((e) => console.error("[jobs]", e));
  return job;
}

let running = false;

export async function runPendingJobs(max = 10): Promise<number> {
  if (running) return 0;
  running = true;
  let done = 0;
  try {
    for (let i = 0; i < max; i++) {
      // claim one job atomically
      const claimed = await prisma.$queryRaw<{ id: string }[]>`
        UPDATE jobs SET status = 'RUNNING', attempts = attempts + 1, "updatedAt" = NOW()
        WHERE id = (
          SELECT id FROM jobs WHERE status = 'PENDING' AND "runAfter" <= NOW()
          ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
        ) RETURNING id`;
      if (!claimed.length) break;
      const job = await prisma.job.findUniqueOrThrow({ where: { id: claimed[0].id } });
      try {
        await handle(job.type as JobType, job.payload as Record<string, string>);
        await prisma.job.update({ where: { id: job.id }, data: { status: "DONE" } });
      } catch (e) {
        const msg = (e as Error).message?.slice(0, 1000) ?? "error";
        const retry = job.attempts < 3 && !(e as { status?: number }).status;
        await prisma.job.update({ where: { id: job.id }, data: { status: retry ? "PENDING" : "FAILED", lastError: msg, runAfter: new Date(Date.now() + 30_000 * job.attempts) } });
        if (!retry) await onJobFailed(job.type as JobType, job.payload as Record<string, string>, msg);
      }
      done++;
    }
  } finally {
    running = false;
  }
  return done;
}

async function handle(type: JobType, payload: Record<string, string>) {
  if (type === "process_video") {
    const reel = await prisma.reel.findUniqueOrThrow({ where: { id: payload.reelId } });
    const out = await processVideoAsset(reel.videoAssetId);
    await prisma.reel.update({
      where: { id: reel.id },
      data: {
        status: "READY",
        videoUrl: out.videoUrl,
        posterUrl: reel.posterUrl ?? out.posterUrl, // keep a custom thumbnail if one was uploaded
        durationSec: out.durationSec,
        processingError: null,
        ...((payload.publish === "1" || reel.autoPublish) && reel.visibility === "DRAFT" ? { visibility: "PUBLISHED", publishedAt: new Date() } : {}),
      },
    });
  }
}

async function onJobFailed(type: JobType, payload: Record<string, string>, msg: string) {
  if (type === "process_video") {
    await prisma.reel.update({ where: { id: payload.reelId }, data: { status: "FAILED", processingError: msg } });
  }
}

/** Requeue jobs stuck in RUNNING (e.g. after a crash). */
export async function recoverStuckJobs() {
  await prisma.job.updateMany({ where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } }, data: { status: "PENDING" } });
}
