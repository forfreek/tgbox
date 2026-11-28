// Creates only ignored files and a dedicated LOCAL database fixture; never uses --remote.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const app = path.resolve(__dirname, "..");
const root = path.resolve(app, "../..");
const cache = path.join(app, "node_modules/.cache");
const state = path.join(root, ".data/search-admin-stage5");
fs.mkdirSync(cache, { recursive: true });
const config = path.join(cache, "search-admin.wrangler.json");
fs.writeFileSync(
  config,
  JSON.stringify({
    name: "tgbox-admin-local-search-test",
    main: "../../src/worker.ts",
    compatibility_date: "2026-09-15",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: [
      {
        binding: "DB",
        database_name: "local-core-search-test",
        database_id: "00000000-0000-0000-0000-000000000001",
      },
      {
        binding: "ANALYTICS_DB",
        database_name: "local-analytics-search-test",
        database_id: "00000000-0000-0000-0000-000000000002",
        migrations_dir: "../../../../packages/search-analytics/migrations",
      },
    ],
    kv_namespaces: [{ binding: "PUBLIC_CACHE", id: "00000000000000000000000000000001" }],
    vars: {
      ADMIN_DEV_BYPASS: "1",
      SETTINGS_KEY: "local-only-search-admin-test-key-32-chars",
      SEARCH_JOBS_ENABLED: "1",
      CF_ACCESS_TEAM_DOMAIN: "",
      CF_ACCESS_AUD: "",
      ADMIN_IDS: "",
      ADMIN_EMAILS: "",
      BOT_TOKEN: "local-test",
      SITE_URL: "http://127.0.0.1:8794",
    },
  }),
);
fs.writeFileSync(
  path.join(cache, "search-admin.vite.config.ts"),
  `import path from 'node:path';
import {cloudflare} from '@cloudflare/vite-plugin';import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';import tailwind from '@tailwindcss/vite';import {defineConfig} from 'vite';
export default defineConfig({server:{port:8794,strictPort:true,host:'127.0.0.1'},resolve:{alias:{'@':path.resolve('src')}},plugins:[cloudflare({configPath:'node_modules/.cache/search-admin.wrangler.json',remoteBindings:false,viteEnvironment:{name:'ssr'},persistState:{path:path.resolve('../../.data/search-admin-stage5')}}),tanstackStart(),react(),tailwind()]});`,
);
const cli = path.join(path.dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
const run = (args) =>
  execFileSync(
    process.execPath,
    [cli, ...args, "--local", "--config", config, "--persist-to", state],
    { cwd: app, stdio: "pipe" },
  );
run(["d1", "migrations", "apply", "ANALYTICS_DB"]);
const now = Date.now(),
  day = (age) => new Date(now + 28800000 - age * 86400000).toISOString().slice(0, 10);
const tables = [
  "search_daily_stats",
  "search_daily_totals",
  "search_daily_identities",
  "search_identity_days",
  "search_keyword_rules",
  "search_job_runs",
  "search_admin_audit",
  "search_security_daily",
];
let sql = tables.map((table) => `DELETE FROM ${table};`).join("\n");
sql += `UPDATE search_settings SET version=2,value='{"publication":true,"jobs":true}' WHERE id=1;
UPDATE search_control SET publication_key=NULL,publication_config_version=NULL,publication_rules_revision=NULL,lease_token=NULL,lease_until=0 WHERE id=1;\n`;
for (let i = 0; i < 30; i++)
  sql += `INSERT INTO search_daily_stats(day,keyword,display_keyword,source,locale,searches,results,zero_results,updated_at) VALUES('${day(0)}','资源 ${String(i).padStart(2, "0")}','资源 ${i}','website','zh',${i + 1},${i},1,${now});\n`;
sql += `INSERT INTO search_daily_totals(day,source,locale,searches,results,zero_results,identity_days) VALUES('${day(0)}','all','all',465,435,30,1),('${day(0)}','website','all',465,435,30,1),('${day(0)}','all','zh',465,435,30,1);
INSERT INTO search_daily_stats(day,keyword,display_keyword,source,locale,searches,results,verified_searches,eligible_identities,updated_at) VALUES('${day(1)}','真实搜索','真实搜索','bot','zh',5,5,5,5,${now});
INSERT INTO search_daily_totals(day,source,locale,searches,results,identity_days) VALUES('${day(1)}','all','all',5,5,5),('${day(1)}','bot','all',5,5,5),('${day(1)}','all','zh',5,5,5);\n`;
for (let i = 0; i < 5; i++)
  sql += `INSERT INTO search_daily_identities(day,keyword,identity,source,locale,eligible,last_seen_at) VALUES('${day(1)}','真实搜索','${String(i).padStart(64, "0")}','bot','zh',1,${now});
INSERT INTO search_identity_days(day,identity,source,locale) VALUES('${day(1)}','${String(i).padStart(64, "0")}','all','all');\n`;
sql += `INSERT INTO search_identity_days(day,identity,source,locale) VALUES('${day(0)}','${"a".repeat(64)}','all','all');
INSERT INTO search_security_daily(day,reason,count,sampled) VALUES('${day(0)}','limited',3,1);`;
const seed = path.join(cache, "analytics-seed.sql");
fs.writeFileSync(seed, sql);
run(["d1", "execute", "ANALYTICS_DB", "--file", seed]);
const core = path.join(cache, "core-seed.sql");
fs.writeFileSync(
  core,
  "CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY,title TEXT,status TEXT);CREATE TABLE IF NOT EXISTS entry_stats(entry_id INTEGER,members INTEGER);DELETE FROM entries;DELETE FROM entry_stats;INSERT INTO entries VALUES(1,'推荐资源','approved');INSERT INTO entry_stats VALUES(1,100);",
);
run(["d1", "execute", "DB", "--file", core]);
console.log(
  "Prepared dedicated local search Admin fixture; production configs/resources unchanged.",
);
