import { HARD_LIMITS } from "./config.ts";

export type BoundaryReason = "method" | "origin" | "content_type" | "body_size" | "invalid_json";
export class BoundaryError extends Error {
  constructor(public readonly reason: BoundaryReason) {
    super("Invalid analytics request");
  }
}
/** Stream limit applies even to absent, lying, or chunked Content-Length. */
export async function readAnalyticsJson(
  request: Request,
  origins: ReadonlySet<string>,
): Promise<unknown> {
  if (request.method !== "POST") throw new BoundaryError("method");
  const origin = request.headers.get("Origin");
  if (!origin || !origins.has(origin)) throw new BoundaryError("origin");
  if (
    request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    throw new BoundaryError("content_type");
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > HARD_LIMITS.bodyBytes))
    throw new BoundaryError("body_size");
  if (!request.body) throw new BoundaryError("invalid_json");
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > HARD_LIMITS.bodyBytes) {
        await reader.cancel().catch(() => {
          throw new BoundaryError("body_size");
        });
        throw new BoundaryError("body_size");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new BoundaryError("invalid_json");
  }
}
