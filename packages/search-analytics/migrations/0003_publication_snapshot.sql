-- ONLY tgbox-analytics. Publication metadata is private D1 state, never public KV content.
ALTER TABLE search_job_runs ADD COLUMN published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1));
ALTER TABLE search_job_runs ADD COLUMN ranking_json TEXT NOT NULL DEFAULT '[]'
  CHECK(json_valid(ranking_json) AND json_type(ranking_json) = 'array');
