import { timingSafeEqual } from "node:crypto";
import { runBillingMaintenance, runMonthlyBilling } from "@/server/billing";
import { recoverStuckJobs, runPendingJobs } from "@/server/jobs";
import { previousPeriod } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Scheduled maintenance. Call hourly from your scheduler with
 *   Authorization: Bearer $CRON_SECRET
 * On the 1st of the month (UTC) it issues invoices for the previous month
 * (idempotent — safe to call repeatedly).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return new Response("Unauthorized", { status: 401 });
  const now = new Date();
  const out: Record<string, unknown> = {};
  await recoverStuckJobs();
  out.jobs = await runPendingJobs(20);
  if (now.getUTCDate() <= 3) out.invoices = await runMonthlyBilling(previousPeriod(now));
  out.maintenance = await runBillingMaintenance(now);
  return Response.json(out);
}
