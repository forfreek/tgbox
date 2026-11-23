import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { close, createIndex } from "pagefind";
import { afterAll, beforeAll, expect, test } from "vitest";
import { devSiteData } from "../src/lib/dev-site-data.ts";

const root = path.resolve(import.meta.dirname, "..");
mkdirSync(path.join(root, "node_modules/.cache"), { recursive: true });
const work = mkdtempSync(path.join(root, "node_modules/.cache/summary-pages-"));
const data = structuredClone(devSiteData);
const selected = data.entries[0],
  invalid = data.entries[1];
if (!selected || !invalid) throw new Error("Missing fixture entries");
const text = {
  zh: '本地验收 ZXQAIINTROUNIQUE <script>alert(1)</script> & "引号"。',
  hant: '人工繁中「后台」品牌 & <img src=x onerror="alert(1)">\nhttps://example.com/电报 ZXQAIINTROUNIQUE',
  en: 'Local test ZXQAIINTROUNIQUE <script>alert(1)</script> & "quotes".',
};
selected.aiSummary = text;
// Broken external snapshot content must fall back without failing the build.
const raw = JSON.parse(JSON.stringify(data));
raw.entries[1].aiSummary = { zh: "坏稿", hant: "", en: "" };
const fixture = path.join(work, "data.json");
writeFileSync(fixture, JSON.stringify(raw));
const output = (flag: string) => path.join(work, flag, "client");
beforeAll(() => {
  for (const flag of ["0", "1", "rollback"])
    execFileSync(
      process.execPath,
      [
        path.join(root, "node_modules/astro/bin/astro.mjs"),
        "build",
        "--outDir",
        path.join(work, flag),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          SITE_DATA_PATH: fixture,
          SITE_URL: "https://nav.example.org",
          AI_SUMMARY_DISPLAY: flag === "1" ? "1" : "0",
          TGBOX_BUILD_CACHE_DIR: path.join(work, `cache-${flag === "rollback" ? "1" : flag}`),
        },
        stdio: "pipe",
        maxBuffer: 16 * 1024 * 1024,
      },
    );
}, 180000);
afterAll(async () => {
  await close();
});
const html = (flag: string, locale: string, username = selected.username) =>
  readFileSync(path.join(output(flag), locale, "detail", username, "index.html"), "utf8");
const encode = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const paragraph = (s: string) =>
  s.match(/<p\b[^>]*\sdata-ai-summary(?:[=\s>])[^>]*>[\s\S]*?<\/p>/)?.[0];
test.each([
  ["", text.zh],
  ["en", text.en],
  ["zh-hant", text.hant],
])(
  "renders approved %s as escaped text and retains the original fact paragraph",
  (locale, value) => {
    const off = html("0", locale),
      on = html("1", locale);
    expect(paragraph(off)).toBeUndefined();
    const intro = paragraph(on);
    expect(intro).toBeDefined();
    expect(intro).toContain(encode(value));
    expect(intro).toContain("data-pagefind-ignore");
    expect(intro).not.toMatch(/<(?:script|img)\b/);
    expect(on.match(/<p\b[^>]*data-entry-summary[^>]*>[\s\S]*?<\/p>/)?.[0]).toBe(
      off.match(/<p\b[^>]*data-entry-summary[^>]*>[\s\S]*?<\/p>/)?.[0],
    );
    expect(paragraph(html("1", locale, invalid.username))).toBeUndefined();
  },
);
test("turning display off and rebuilding with the previous on-cache restores original HTML", () => {
  const files = readdirSync(output("0"), { recursive: true })
    .filter((f) => String(f).endsWith(".html"))
    .map(String);
  for (const file of files)
    expect(readFileSync(path.join(output("rollback"), file), "utf8")).toBe(
      readFileSync(path.join(output("0"), file), "utf8"),
    );
});

test("manual Traditional text survives the conversion without exposing payload elsewhere", () => {
  const intro = paragraph(html("1", "zh-hant")) ?? "";
  expect(intro).toContain("「后台」");
  expect(intro).not.toContain("「後臺」");
  expect(intro).toContain("https://example.com/电报");
  expect(html("1", "zh-hant")).toContain('<html lang="zh-Hant"');
});
const seo = (s: string) =>
  s.match(
    /<title>[\s\S]*?<\/title>|<meta\b[^>]*>|<link\b(?=[^>]*rel="(?:canonical|alternate)")[^>]*>|<script\b(?=[^>]*type="application\/ld\+json")[^>]*>[\s\S]*?<\/script>/g,
  );
test("all generated URLs and SEO metadata remain identical with the display toggle", () => {
  const files = (flag: string) =>
    readdirSync(output(flag), { recursive: true })
      .filter((f) => String(f).endsWith(".html"))
      .map(String)
      .sort();
  expect(files("1")).toEqual(files("0"));
  for (const file of files("0")) {
    const on = readFileSync(path.join(output("1"), file), "utf8"),
      off = readFileSync(path.join(output("0"), file), "utf8");
    expect(seo(on)).toEqual(seo(off));
    expect(on.replace(/<p\b[^>]*\sdata-ai-summary(?:[=\s>])[^>]*>[\s\S]*?<\/p>/g, "")).toBe(off);
  }
});
test.each(["detail/*/index.html", "zh-hant/detail/*/index.html"])(
  "actual Pagefind token index and fragments for %s stay byte-identical",
  async (glob) => {
    const manifest = async (flag: string) => {
      const { index, errors } = await createIndex({ forceLanguage: "zh" });
      if (!index) throw new Error(errors.join(";"));
      const added = await index.addDirectory({ path: output(flag), glob });
      expect(added.errors).toEqual([]);
      const files = await index.getFiles();
      expect(files.errors).toEqual([]);
      expect(files.files.some((f) => f.path.startsWith("index/"))).toBe(true);
      expect(files.files.filter((f) => f.path.startsWith("fragment/"))).toHaveLength(
        added.page_count,
      );
      for (const file of files.files) {
        const target = path.join(
          output(flag),
          "pagefind",
          glob.startsWith("zh-hant") ? "zh-hant" : "",
          file.path,
        );
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, file.content);
      }
      // Pagefind filter/entry packaging order is nondeterministic. Compare actual tokens/fragments;
      // the full HTML assertion above also proves all existing filter/metadata source is unchanged.
      return Object.fromEntries(
        files.files
          .filter((f) => f.path.startsWith("index/") || f.path.startsWith("fragment/"))
          .map((f) => [f.path, createHash("sha256").update(f.content).digest("hex")]),
      );
    };
    expect(await manifest("1")).toEqual(await manifest("0"));
  },
  30000,
);
