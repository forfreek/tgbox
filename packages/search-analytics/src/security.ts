import { HARD_LIMITS } from "./config.ts";
import { hmac } from "./identity.ts";
import { reserve } from "./quota.ts";
import { type AnalyticsDb, type Observer, observeFailure, readSettings } from "./runtime.ts";
import { beijingDay, DAY_MS } from "./time.ts";

export const securityReasons = [
  "limited",
  "duplicate",
  "turnstile_success",
  "turnstile_failure",
  "invalid_identity",
  "private",
  "anomaly",
] as const;
export type SecurityReason = (typeof securityReasons)[number];
/** Fixed reason-only 1% sample; neither every attack nor every identity creates a row. */
export async function sampleSecurity(
  db: AnalyticsDb,
  secret: string,
  reason: SecurityReason,
  now: number,
  observe: Observer = observeFailure,
) {
  const draw = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  if (draw >= Math.floor(0x100000000 / HARD_LIMITS.securitySampleDenominator)) return;
  try {
    const loaded = await readSettings(db);
    if (!loaded.value.enabled || loaded.value.securitySamplesPerDay === 0) return;
    const key = await hmac(secret, "security-sample", crypto.randomUUID()),
      day = beijingDay(now);
    const r = await reserve(db, {
      kind: "session",
      configVersion: loaded.version,
      eventKey: key,
      digest: key,
      expires: now + 2 * DAY_MS,
      quotas: [
        {
          scope: "security_sample",
          subject: "all",
          window: day,
          maximum: loaded.value.securitySamplesPerDay,
          expires: now + 2 * DAY_MS,
        },
      ],
    });
    if (!r.accepted) return;
    await db
      .prepare(
        "INSERT INTO search_security_daily(day,reason,count,sampled) VALUES(?,?,1,1) ON CONFLICT(day,reason) DO UPDATE SET count=count+1,sampled=1",
      )
      .bind(day, reason)
      .run();
  } catch {
    observe("database");
  }
}
