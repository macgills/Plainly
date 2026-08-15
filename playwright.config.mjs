import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.test.mjs",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { trace: "retain-on-failure" },
  reporter: process.env.CI ? "github" : "list",
});
