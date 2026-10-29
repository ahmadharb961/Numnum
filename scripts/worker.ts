// Background worker: processes queued jobs (video transcoding) continuously.
//   npm run worker
import { recoverStuckJobs, runPendingJobs } from "../src/server/jobs";

async function main() {
  console.log("[worker] started");
  for (;;) {
    try {
      await recoverStuckJobs();
      const n = await runPendingJobs(10);
      if (n) console.log(`[worker] processed ${n} job(s)`);
    } catch (e) {
      console.error("[worker]", e);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

void main();
