import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against a running stack (Flask API + Next.js).
// Start both first (PM2 on Linux, Start-SkinLab.bat on Windows), then:
//   E2E_BASE_URL=http://127.0.0.1:7313 pnpm test:e2e
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL, channel: process.env.E2E_CHANNEL ?? "chrome", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
