import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL || "postgresql://numnum:numnum@localhost:5432/numnum_test";
  if (!/_test(\?|$)/.test(new URL(url).pathname + (new URL(url).search || ""))) throw new Error("Refusing to run tests against a non-test database");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
