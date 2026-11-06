import { defineConfig, devices } from "@playwright/test";

// E2E_PORT overrides the port when 3100 is taken on the machine (Docker and WSL relays often bind it).
const PORT = Number(process.env.E2E_PORT) || 3100;

/**
 * Golden path E2E against a production build, using an isolated embedded
 * database (.data/e2e) and the labelled FIXTURE payment provider. Real PayPal
 * Sandbox checkout is covered by the manual checklist in docs/JUDGE_TESTING.md.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      APP_BASE_URL: `http://localhost:${PORT}`,
      // Separate build folder so the E2E build never collides with a running `next dev`.
      NEXT_DIST_DIR: ".next-e2e",
      PGLITE_DATA_DIR: ".data/e2e",
      PAYPAL_ENV: "sandbox",
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
      FIXTURE_PAYMENTS: "enabled",
      AI_PROVIDER: "offline-fixture",
      DEMO_RESET: "enabled",
    },
  },
});
