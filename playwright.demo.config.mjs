import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.demo.test.mjs",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  reporter: "list",
});
