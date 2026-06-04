import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config.
 *
 * Expects the backend on http://localhost:5000 and the Next dev server
 * on http://localhost:3000. Playwright's `webServer` block boots Next
 * automatically; the backend is the operator's responsibility — run
 * `cd backend && flask --app wsgi run -p 5000` (or
 * `scripts\start-all.ps1` on the deployed Windows host) in another
 * shell first.
 *
 * Run: `npm run e2e` (headless) or `npm run e2e:headed` for debug.
 * First-time setup also needs `npx playwright install chromium`.
 */
const FRONTEND = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Suite is small; per-test isolation matters more than parallelism.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: FRONTEND,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Cookie-auth path (Phase 1) — same-origin via Next dev's rewrite.
    extraHTTPHeaders: { Accept: "application/json, text/html" },
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Only auto-start Next when we're not already pointing at a running
  // host (CI service, manual `npm start`). The backend isn't booted
  // here — see the file header.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
