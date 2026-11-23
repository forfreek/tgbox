#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { buildSiteData, projectedStaticFileCount } from "./build-site-data.ts";
import { createR2MediaReader } from "./r2-media.ts";
import { summaryEntryIds } from "./summary-options.ts";

// Cloudflare static assets allow 20,000 files; leave headroom for assets and non-entry pages.
const STATIC_FILE_WARNING = 18_000;

const { values } = parseArgs({
  options: {
    db: { type: "string" },
    out: { type: "string" },
    "media-base-url": { type: "string" },
    "media-dir": { type: "string" },
    "media-source": { type: "string" },
    "summary-db": { type: "string" },
  },
});

if (!values.db || !values.out) {
  console.error(
    "Usage: snapshot --db <export.sqlite|export.sql> --out <site-data.json> (--media-source r2 | --media-dir DIR) [--media-base-url URL]",
  );
  process.exit(1);
}

if (values["media-source"] && values["media-source"] !== "r2") {
  throw new Error("media-source must be r2");
}
if (Boolean(values["media-dir"]) === Boolean(values["media-source"])) {
  throw new Error("Choose exactly one input: --media-source r2 or --media-dir DIR");
}
const r2 = values["media-source"] === "r2" ? createR2MediaReader() : undefined;
const dbPath = values.db;
const data = await (async () => {
  try {
    return await buildSiteData({
      dbPath,
      mediaBaseUrl: values["media-base-url"],
      mediaDir: values["media-dir"],
      readMedia: r2?.read,
      now: new Date(),
      summaryEntryIds: summaryEntryIds(process.env.AI_SUMMARY_ENTRY_IDS),
      summaryDbPath: values["summary-db"],
    });
  } finally {
    r2?.close();
  }
})();
if (r2) console.log(`snapshot R2 media: ${JSON.stringify(r2.stats)} (bytes = JSON payload only)`);
await writeFile(values.out, JSON.stringify(data));

const { total, channels, groups, bots } = data.stats;
const files = projectedStaticFileCount(data);
console.log(
  `snapshot: ${total} entries (${channels} channels, ${groups} groups, ${bots} bots), ` +
    `${data.categories.length} categories, ${data.tags.length} tags → ${values.out}`,
);
console.log(`snapshot: ~${files} static files projected`);
if (files > STATIC_FILE_WARNING) {
  console.warn(
    `snapshot: WARNING projected static files (${files}) exceed ${STATIC_FILE_WARNING}; the 20,000-file asset limit is near`,
  );
}
