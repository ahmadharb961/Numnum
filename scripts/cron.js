// Hourly maintenance trigger for Hostinger's "Node.js" cron jobs, which run this file with the
// app's environment variables loaded. Calls /api/cron on the live site with CRON_SECRET.
const base = (process.env.APP_URL || "").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;

if (!base || !secret) {
  console.error("cron: APP_URL and CRON_SECRET must be set");
  process.exit(1);
}

fetch(`${base}/api/cron`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(280_000) })
  .then(async (res) => {
    const body = await res.text();
    console.log(`cron: ${res.status} ${body.slice(0, 2000)}`);
    if (!res.ok) process.exit(1);
  })
  .catch((err) => {
    console.error("cron: request failed:", err.message);
    process.exit(1);
  });
