import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so unit tests don't boot the Cloudflare/TanStack Start plugins.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["src/**/*.test.ts"] },
});
