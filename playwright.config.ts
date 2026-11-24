import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a seeded database with DEMO_PASSWORD_LOGIN=true (demo users sign in with the bootstrap password).
 *   npm run db:seed && npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "off",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 180_000, env: { DEMO_PASSWORD_LOGIN: "true", DISABLE_EVENTS: "false" } },
});
