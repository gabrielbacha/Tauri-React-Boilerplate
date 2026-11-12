import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;
const platform = process.env.TAURI_ENV_PLATFORM;
const debug = Boolean(process.env.TAURI_ENV_DEBUG);

// Tauri serves the build from the system webview: WebView2 (Chromium) on Windows, WebKit elsewhere.
export default defineConfig({
  envDir: process.env.TAURI_TEST_ENV_DIR,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@desktop": resolve(import.meta.dirname, "src"),
      "@contracts": resolve(import.meta.dirname, "packages/desktop-contracts/src"),
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: platform === "windows" ? "chrome120" : "safari16",
    minify: !debug,
    sourcemap: debug,
  },
});
