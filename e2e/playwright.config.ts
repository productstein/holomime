import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  retries: 0,
  reporter: [["list"]],
});
