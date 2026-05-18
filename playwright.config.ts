import { randomUUID } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.CREATOROS_E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${e2ePort}`;
const e2eAuthSecret = process.env.CREATOROS_E2E_AUTH_SECRET ?? `creatoros-e2e-${randomUUID()}`;

process.env.CREATOROS_E2E_AUTH_SECRET = e2eAuthSecret;

const e2eEnv = [
  "CREATOROS_E2E_AUTH_BYPASS=1",
  `CREATOROS_E2E_AUTH_SECRET=${e2eAuthSecret}`,
  "AI_PROVIDER=mock",
  "AI_MODEL=mock-model",
  "CHROME_EXTENSION_ORIGINS=chrome-extension://creatoros-e2e",
  `NEXT_PUBLIC_APP_URL=${baseURL}`,
].join(" ");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  workers: 1,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  // SCA-540 (S-34): split the suite into @api (request-only) and @ui
  // (chromium) projects. Tests tag themselves via @api / @ui in the
  // describe / test title, and grep includes route them to the right
  // project. @api specs hit the live dev server but never spin up a
  // browser, so they're significantly cheaper than the full chromium
  // path. The webServer is shared — both projects need Next running
  // because @api specs exercise route handlers, not pure unit code.
  projects: [
    {
      name: "api",
      grep: /@api/,
      use: {
        baseURL,
      },
    },
    {
      name: "chromium",
      grep: /@ui/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `${e2eEnv} npx pnpm@10.33.2 dev --hostname 127.0.0.1 --port ${e2ePort}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
