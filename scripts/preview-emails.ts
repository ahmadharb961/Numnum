// Writes the restaurant welcome / confirm emails as HTML files to look at them.
//   npx tsx --tsconfig tsconfig.json --require ./scripts/cli-shim.cjs scripts/preview-emails.ts <out-dir>
import { writeFileSync } from "node:fs";
import { welcomeEmail } from "../src/server/restaurant-emails";

const out = process.argv[2] || ".";
const data = { ownerName: "Karim Haddad", restaurantName: "Burger House", ratePct: "14%", dueDays: 10, graceDays: 7, whishName: "numnum SAL", whishNumber: "96170123456", loginEmail: "karim@burgerhouse.lb" };
for (const lang of ["en", "ar"]) {
  const m = welcomeEmail(data, lang);
  writeFileSync(`${out}/welcome-${lang}.html`, m.html);
  writeFileSync(`${out}/welcome-${lang}.txt`, `${m.subject}\n\n${m.text}`);
  console.log(lang, "subject:", m.subject);
}
