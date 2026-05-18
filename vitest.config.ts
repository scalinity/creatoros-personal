import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    passWithNoTests: false,
    // SCA-538 (S-32): coverage configuration. Run via `pnpm test:coverage`
    // (script added to package.json). Thresholds are intentionally lenient
    // today — purpose is to make regressions visible, not to gate CI yet.
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts", "components/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "tests/**",
        "node_modules/**",
        ".next/**",
        "lib/testing/**",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
