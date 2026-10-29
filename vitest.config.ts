import { defineConfig } from "vitest/config";
import path from "node:path";

const testDb = process.env.TEST_DATABASE_URL || "postgresql://numnum:numnum@localhost:5432/numnum_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: testDb, STORAGE_DIR: "./storage-test", SESSION_SECRET: "test-secret-0123456789" },
    fileParallelism: false,
    testTimeout: 30000,
  },
});
