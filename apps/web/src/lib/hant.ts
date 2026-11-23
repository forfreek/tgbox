import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { toHant } from "@tgbox/hant";
import { localizePath } from "../i18n/locale.ts";

// Links to other sites keep their exact bytes: a converted character in a URL is a different URL.
// Site paths are converted with the page, so a `/?q=…` search link matches the Traditional index.
const EXTERNAL_URL_ATTR = /(\s(?:href|src)=")((?!\/(?!\/)|#)[^"]*)(")/g;
// Only generated plain-text AI paragraphs: escaped '<' stays text, no nested markup protected.
const APPROVED_TEXT =
  /<p\b(?=[^>]*\sdata-ai-summary(?:="true")?(?:\s|>))(?=[^>]*\sdata-ai-summary-preserve="true"(?:\s|>))[^>]*>[^<]*<\/p>/g;

/** A rendered zh page in Traditional Chinese, leaving external URLs untouched. */
export function toTraditionalPage(html: string): string {
  // Markdown has root-relative links, while the surrounding Astro template is localized already.
  html = html.replace(
    /(<article\b[^>]*data-guide-content[^>]*>)([\s\S]*?)(<\/article>)/g,
    (_, open: string, body: string, close: string) =>
      open +
      body.replace(
        /(\shref=")(\/(?!\/)[^"]*)(")/g,
        (_, start: string, href: string, end: string) =>
          start + localizePath(href, "zh-hant") + end,
      ) +
      close,
  );
  let out = "";
  let end = 0;
  for (const match of html.matchAll(APPROVED_TEXT)) {
    out += convertChunk(html.slice(end, match.index)) + match[0];
    end = match.index + match[0].length;
  }
  return out + convertChunk(html.slice(end));
}

function convertChunk(html: string): string {
  let out = "";
  let last = 0;
  for (const match of html.matchAll(EXTERNAL_URL_ATTR)) {
    const valueStart = match.index + (match[1]?.length ?? 0);
    out += toHant(html.slice(last, valueStart)) + (match[2] ?? "");
    last = valueStart + (match[2]?.length ?? 0);
  }
  return out + toHant(html.slice(last));
}

/** Converts every HTML page and JSON file under `dir` in place; returns how many there were. */
export async function convertTraditionalPages(dir: string): Promise<number> {
  const files = (await readdir(dir, { recursive: true })).filter((file) =>
    /\.(html|json)$/.test(file),
  );
  for (const file of files) {
    const target = path.join(dir, file);
    await writeFile(target, toTraditionalPage(await readFile(target, "utf8")));
  }
  return files.length;
}
