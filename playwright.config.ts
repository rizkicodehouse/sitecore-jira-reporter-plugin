import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3002",
    permissions: ["display-capture"],
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev",
    port: 3002,
    reuseExistingServer: !process.env.CI
  }
});
