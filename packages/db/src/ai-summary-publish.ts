import type { Db } from "./access.ts";
import { summarySourceGuardQuery } from "./ai-summary.ts";

/** Contract 2 stores machine zh/en; hant is derived from zh only in the static build. */
export async function publishSummaryRevision(
  db: Db,
  data: {
    entryId: number;
    revisionId: string;
    fingerprint: string;
    guard: string;
    zh: string;
    en: string;
  },
  now: number,
) {
  const candidate = `SELECT r.entry_id,? AS zh,? AS en,j.fingerprint,r.id AS revision_id
    FROM ai_summary_revisions r JOIN ai_summary_jobs j ON j.id=r.job_id
    JOIN ai_summary_sources s ON s.entry_id=r.entry_id JOIN ai_summary_settings c ON c.id=1
    WHERE r.id=? AND r.entry_id=? AND j.status='succeeded' AND s.locked=0
    AND r.generation=s.generation AND r.edit_version=s.edit_version
    AND j.fingerprint=s.fingerprint AND j.fingerprint=? AND j.source_guard=s.source_guard
    AND j.source_guard=? AND j.source_guard=(${summarySourceGuardQuery})
    AND c.enabled=1 AND c.model=j.model AND c.prompt_version=j.prompt_version AND c.params_version=j.params_version
    AND json_extract(r.output,'$.status')='ok'
    AND NOT EXISTS(SELECT 1 FROM ai_summary_reviews h WHERE h.entry_id=r.entry_id)`;
  const args = [
    data.zh,
    data.en,
    data.revisionId,
    data.entryId,
    data.fingerprint,
    data.guard,
    data.entryId,
  ];
  const changed = `p.entry_id IS NULL OR p.zh IS NOT n.zh OR p.hant IS NOT n.zh
    OR p.en IS NOT n.en OR p.fingerprint IS NOT n.fingerprint OR p.contract_version!=2`;
  const results = await db.$client.batch([
    db.$client
      .prepare(`INSERT INTO site_state(key,value) SELECT 'dirty_since',?
      WHERE EXISTS(SELECT 1 FROM (${candidate}) n LEFT JOIN ai_summary_public p ON p.entry_id=n.entry_id
      WHERE ${changed}) ON CONFLICT(key) DO NOTHING`)
      .bind(String(now), ...args),
    db.$client
      .prepare(`INSERT INTO audit_log(actor,action,target,payload,created_at)
      SELECT 'ai-summary','ai_summary.auto_publish',cast(n.entry_id AS TEXT),json_object('revisionId',n.revision_id),?
      FROM (${candidate}) n LEFT JOIN ai_summary_public p ON p.entry_id=n.entry_id WHERE ${changed}`)
      .bind(now, ...args),
    db.$client
      .prepare(`INSERT INTO ai_summary_public(entry_id,zh,hant,en,fingerprint,contract_version)
      SELECT entry_id,zh,zh,en,fingerprint,2 FROM (${candidate}) WHERE true
      ON CONFLICT(entry_id) DO UPDATE SET zh=excluded.zh,hant=excluded.hant,en=excluded.en,
      fingerprint=excluded.fingerprint,contract_version=2
      WHERE ai_summary_public.zh IS NOT excluded.zh OR ai_summary_public.hant IS NOT excluded.hant
      OR ai_summary_public.en IS NOT excluded.en OR ai_summary_public.fingerprint IS NOT excluded.fingerprint
      OR ai_summary_public.contract_version!=2`)
      .bind(...args),
  ]);
  return results[2]?.meta.changes === 1;
}
