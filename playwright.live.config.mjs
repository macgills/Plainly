import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.live.test.mjs",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: {
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  reporter: "list",
});
