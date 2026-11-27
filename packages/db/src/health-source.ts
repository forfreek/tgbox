import {
  type HealthSourceResult,
  HealthSourceState,
  initialHealthSource,
  nextHealthSource,
} from "@tgbox/shared";
import { compareAndSetSiteState, type Db, getSiteStates } from "./access.ts";
export const healthSources = ["tme_profile", "tme_preview"] as const;
export type HealthSource = (typeof healthSources)[number];
const key = (source: HealthSource) => `health_source_v1:${source}`;
/** One indexed read for both source controls. Invalid stored state fails closed, never resets. */
export async function readHealthSources(db: Db) {
  const stored = await getSiteStates(db, healthSources.map(key));
  return Object.fromEntries(
    healthSources.map((source) => {
      const raw = stored[key(source)];
      return [
        source,
        {
          raw,
          state:
            raw === undefined ? initialHealthSource() : HealthSourceState.parse(JSON.parse(raw)),
        },
      ];
    }),
  ) as Record<HealthSource, { raw: string | undefined; state: HealthSourceState }>;
}
/** CAS fences old invocations; caller reloads on conflict, never overwrites concurrent state. */
export async function recordHealthSource(
  db: Db,
  source: HealthSource,
  previous: { raw: string | undefined; state: HealthSourceState },
  result: HealthSourceResult,
) {
  const next = nextHealthSource(previous.state, result);
  if (next.lastObservedAt === previous.state.lastObservedAt)
    return { accepted: false, subrequests: 0 };
  return {
    accepted: await compareAndSetSiteState(db, key(source), previous.raw, JSON.stringify(next)),
    subrequests: 1,
  };
}
