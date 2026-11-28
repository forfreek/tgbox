import { type AnalyticsDb, usage } from "./runtime.ts";

export type Quota = {
  scope:
    | "global"
    | "ip"
    | "session_hour"
    | "session_day"
    | "telegram_day"
    | "session_issue"
    | "session_issue_global"
    | "security_sample";
  subject: string;
  window: string;
  maximum: number;
  expires: number;
};
export const withinQuotas = `NOT EXISTS (
  SELECT 1 FROM json_each(p.quotas) q
  LEFT JOIN search_rate_limits r ON r.scope=json_extract(q.value,'$.scope')
    AND r.subject=json_extract(q.value,'$.subject') AND r.window=json_extract(q.value,'$.window')
  WHERE COALESCE(r.count,0) >= json_extract(q.value,'$.maximum')
)`;

/** Receipt fence owns all effects. Duplicate attempts may read but cannot write any counters. */
export const ownsReceipt = `EXISTS(SELECT 1 FROM search_event_receipts e WHERE e.kind=p.kind AND e.event_key=p.event_key AND e.attempt=p.attempt)`;
export const quotaIncrement = `INSERT INTO search_rate_limits(scope,subject,window,count,expires_at)
 SELECT json_extract(q.value,'$.scope'),json_extract(q.value,'$.subject'),json_extract(q.value,'$.window'),1,json_extract(q.value,'$.expires')
 FROM p,json_each(p.quotas) q WHERE ${ownsReceipt}
 ON CONFLICT(scope,subject,window) DO UPDATE SET count=count+1`;

export const receiptContext = `WITH p AS (SELECT
 json_extract(?1,'$.kind') kind,json_extract(?1,'$.eventKey') event_key,
 json_extract(?1,'$.digest') digest,json_extract(?1,'$.attempt') attempt,
 json_extract(?1,'$.expires') expires,json_extract(?1,'$.quotas') quotas,
 json_extract(?1,'$.configVersion') config_version,json_extract(?1,'$.website') website,
 json_extract(?1,'$.turnstile') turnstile)`;

/** Used for issuance and challenge budgets; successful reservations are deliberately not refunded. */
export async function reserve(
  db: AnalyticsDb,
  input: {
    kind: "session" | "turnstile";
    eventKey: string;
    digest: string;
    expires: number;
    quotas: Quota[];
    configVersion: number;
    website?: boolean;
    turnstile?: boolean;
  },
) {
  const payload = JSON.stringify({ ...input, attempt: crypto.randomUUID() });
  const result = await db.batch([
    db
      .prepare(`${receiptContext} INSERT INTO search_event_receipts(kind,event_key,payload_digest,attempt,expires_at)
      SELECT kind,event_key,digest,attempt,expires FROM p WHERE ${withinQuotas}
      AND EXISTS(SELECT 1 FROM search_settings s WHERE s.id=1 AND s.version=p.config_version AND json_extract(s.value,'$.enabled')=1
        AND (COALESCE(p.website,0)=0 OR json_extract(s.value,'$.website')=1)
        AND (COALESCE(p.turnstile,0)=0 OR json_extract(s.value,'$.turnstile')=1))
      ON CONFLICT(kind,event_key) DO NOTHING`)
      .bind(payload),
    db.prepare(`${receiptContext} ${quotaIncrement}`).bind(payload),
  ]);
  return { accepted: result[0]?.meta.changes === 1, usage: usage(result) };
}
