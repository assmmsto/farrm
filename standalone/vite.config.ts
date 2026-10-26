import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Standalone build configuration — the single-HTML-file and the Capacitor APK
 * both come from THIS config, completely bypassing TanStack Start/Nitro (the
 * hosted-preview pipeline in vite.config.ts stays untouched).
 *
 * Contracts that matter:
 * - Root = project root so Tailwind v4 automatic content detection scans src/**.
 * - "@/lib/client-api" is aliased to the direct-fetch implementation: the
 *   user's own OpenAI-compatible proxy answers CORS, no server functions needed.
 * - base "./" + gigantic assetsInlineLimit → fonts land as base64 in the CSS
 *   and all asset URLs are relative, so the output works from file:// and from
 *   the Android WebView.
 * - publicDir false: platform files under public/__grok are preview-only.
 */
export default defineConfig({
  base: "./",
  publicDir: false,
  resolve: {
    alias: [
      {
        find: /^@\/lib\/client-api$/,
        replacement: fileURLToPath(new URL("../src/lib/direct-api.ts", import.meta.url)),
      },
      {
        find: /^@\//,
        replacement: `${fileURLToPath(new URL("../src", import.meta.url))}/`,
      },
    ],
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist-standalone",
    emptyOutDir: true,
    assetsInlineLimit: 100 * 1024 * 1024,
    rollupOptions: {
      input: fileURLToPath(new URL("./index.html", import.meta.url)),
    },
  },
});
