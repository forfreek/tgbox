declare namespace Cloudflare {
  interface Env {
    ANALYTICS_DB: D1Database;
    ANALYTICS_MIGRATIONS: import("cloudflare:test").D1Migration[];
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
