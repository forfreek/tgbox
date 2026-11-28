import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      miniflare: {
        compatibilityDate: "2026-08-15",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB", "ANALYTICS_DB"],
        bindings: {
          CAPACITY_RUN: process.env.TGBOX_CAPACITY === "1",
          CORE_MIGRATIONS: await readD1Migrations(
            path.join(import.meta.dirname, "../../packages/db/migrations"),
          ),
          ANALYTICS_MIGRATIONS: await readD1Migrations(
            path.join(import.meta.dirname, "../../packages/search-analytics/migrations"),
          ),
        },
      },
    }),
  ],
  test: {
    include: ["test/search-analytics.integration.ts", "test/search-capacity.integration.ts"],
  },
}));
