import { readFile, rm } from "node:fs/promises";
/** Optional public-only export. Partial files from failed exports are never consumed. */
export async function optionalSummaryExport(
  file: string,
  exportTable: (file: string) => void,
): Promise<string> {
  try {
    await rm(file, { force: true });
    exportTable(file);
    return await readFile(file, "utf8");
  } catch {
    console.warn("AI summary projection unavailable; using existing summaries");
    return "";
  } finally {
    await rm(file, { force: true }).catch(() => {
      console.warn("Optional AI export cleanup failed; file will not be reused");
    });
  }
}
