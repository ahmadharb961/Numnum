// Monthly invoicing + reminders. Safe to run any number of times.
//   npm run billing:run               → invoices for the previous month + reminders
//   npm run billing:run -- 2026-10    → invoices for a specific closed month
import { runBillingMaintenance, runMonthlyBilling } from "../src/server/billing";
import { previousPeriod } from "../src/lib/utils";
import { prisma } from "../src/server/db";

async function main() {
  const period = process.argv[2] || previousPeriod();
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Period must be YYYY-MM");
  const results = await runMonthlyBilling(period);
  console.table(results);
  console.log(await runBillingMaintenance());
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
