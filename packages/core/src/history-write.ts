import {
  beginHistoryWrite,
  type Db,
  type Entry,
  finishHistoryWrite,
  getHistoryWrite,
  getPublicRevision,
  type HistoryWrite,
} from "@tgbox/db";
import { MemberPoint } from "@tgbox/shared";
import { HISTORY_BYTE_LIMIT, HISTORY_POINT_LIMIT } from "./history-normalization.ts";

type Media = Pick<R2Bucket, "get" | "put">;
const empty = { subrequests: 0, r2Writes: 0, rowsWritten: 0 };

async function pointsFrom(object: R2ObjectBody | null) {
  if (object && object.size > HISTORY_BYTE_LIMIT) throw new Error("History write source oversized");
  const parsed = MemberPoint.array().safeParse(object ? await object.json().catch(() => null) : []);
  const points = parsed.success ? parsed.data : [];
  if (points.length > HISTORY_POINT_LIMIT) throw new Error("History write point limit reached");
  return points;
}

/** Replay the persisted point against its original ETag. A crash never requires guessing whether put succeeded. */
export async function recoverHistoryWrite(
  db: Db,
  media: Media,
  write: HistoryWrite,
  source?: { object: R2ObjectBody | null; points: MemberPoint[] },
) {
  const cost = { ...empty };
  const key = `history/${write.username}.json`;
  const object = source === undefined ? await media.get(key) : source.object;
  if (source === undefined) cost.subrequests++;
  if (object?.customMetadata?.historyWriteToken !== write.token) {
    if ((object?.etag ?? null) !== write.baseEtag)
      throw new Error("History write source conflict; intent retained");
    const points = source ? [...source.points] : await pointsFrom(object);
    if (points.length >= HISTORY_POINT_LIMIT) throw new Error("History write point limit reached");
    points.push({ t: new Date(write.sampledAt).toISOString(), members: write.members });
    const saved = await media.put(key, JSON.stringify(points), {
      onlyIf: write.baseEtag === null ? { etagDoesNotMatch: "*" } : { etagMatches: write.baseEtag },
      httpMetadata: { contentType: "application/json" },
      customMetadata: { historyWriteToken: write.token },
    });
    cost.subrequests++;
    if (!saved) return { ...cost, status: "pending" as const };
    cost.r2Writes++;
  }
  cost.rowsWritten += await finishHistoryWrite(db, write);
  cost.subrequests++;
  return { ...cost, status: "recovered" as const };
}

/** Existing intents are drained even after disabling new writes. */
export async function appendHistorySafely(
  db: Db,
  media: Media,
  entry: Entry,
  members: number,
  now: number,
  enabled: boolean,
) {
  const existing = await getHistoryWrite(db, entry.id);
  if (existing) {
    const result = await recoverHistoryWrite(db, media, existing);
    return { ...result, subrequests: result.subrequests + 1, handled: true };
  }
  if (!enabled) return { ...empty, subrequests: 1, handled: false };
  const revision = await getPublicRevision(db);
  const object = await media.get(`history/${entry.username}.json`);
  const points = await pointsFrom(object);
  const last = points.at(-1);
  if (last && now - Date.parse(last.t) < 7 * 86400000)
    return { ...empty, subrequests: 3, handled: true };
  if (points.length >= HISTORY_POINT_LIMIT) throw new Error("History write point limit reached");
  const begun = await beginHistoryWrite(
    db,
    {
      entryId: entry.id,
      username: entry.username,
      listedAt: entry.listedAt,
      token: crypto.randomUUID(),
      baseEtag: object?.etag ?? null,
      sampledAt: now,
      members,
    },
    revision,
  );
  if (!begun.write) throw new Error("History write source changed; retry");
  const result = await recoverHistoryWrite(db, media, begun.write, { object, points });
  return {
    ...result,
    subrequests: result.subrequests + 5,
    rowsWritten: result.rowsWritten + begun.rowsWritten,
    handled: true,
  };
}
