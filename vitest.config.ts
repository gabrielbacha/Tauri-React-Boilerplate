import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: process.env.TAURI_TEST_ENV_DIR,
  resolve: {
    alias: {
      "@desktop": resolve(import.meta.dirname, "src"),
      "@contracts": resolve(import.meta.dirname, "packages/desktop-contracts/src"),
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "packages/desktop-contracts/src/**/*.test.{ts,tsx}"],
    clearMocks: true,
  },
});
