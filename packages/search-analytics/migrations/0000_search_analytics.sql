-- ONLY tgbox-analytics. Never apply through packages/db/migrations or to tgbox.
CREATE TABLE search_daily_stats (
  day TEXT NOT NULL CHECK(day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  keyword TEXT NOT NULL CHECK(length(keyword) BETWEEN 2 AND 64),
  display_keyword TEXT NOT NULL CHECK(length(display_keyword) BETWEEN 2 AND 64),
  source TEXT NOT NULL CHECK(source IN ('website','miniapp','bot')),
  locale TEXT NOT NULL CHECK(locale IN ('zh','zh-hant','en')),
  searches INTEGER NOT NULL DEFAULT 0 CHECK(searches >= 0),
  results INTEGER NOT NULL DEFAULT 0 CHECK(results >= 0),
  zero_results INTEGER NOT NULL DEFAULT 0 CHECK(zero_results >= 0),
  trending_clicks INTEGER NOT NULL DEFAULT 0 CHECK(trending_clicks >= 0),
  recommended_clicks INTEGER NOT NULL DEFAULT 0 CHECK(recommended_clicks >= 0),
  prefill_searches INTEGER NOT NULL DEFAULT 0 CHECK(prefill_searches >= 0),
  verified_searches INTEGER NOT NULL DEFAULT 0 CHECK(verified_searches >= 0),
  eligible_identities INTEGER NOT NULL DEFAULT 0 CHECK(eligible_identities >= 0),
  updated_at INTEGER NOT NULL CHECK(updated_at >= 0),
  PRIMARY KEY(day,keyword,source,locale),
  CHECK(searches = results + zero_results),
  CHECK(trending_clicks + recommended_clicks + prefill_searches <= searches),
  CHECK(verified_searches <= results),
  CHECK(eligible_identities <= verified_searches)
) WITHOUT ROWID;
CREATE INDEX search_stats_keyword_day ON search_daily_stats(keyword,day);

CREATE TABLE search_daily_identities (
  day TEXT NOT NULL,
  keyword TEXT NOT NULL CHECK(length(keyword) BETWEEN 2 AND 64),
  identity TEXT NOT NULL CHECK(length(identity) = 64 AND identity NOT GLOB '*[^0-9a-f]*'),
  source TEXT NOT NULL CHECK(source IN ('website','miniapp','bot')),
  locale TEXT NOT NULL CHECK(locale IN ('zh','zh-hant','en')),
  eligible INTEGER NOT NULL DEFAULT 0 CHECK(eligible IN (0,1)),
  last_seen_at INTEGER NOT NULL CHECK(last_seen_at >= 0),
  PRIMARY KEY(day,keyword,identity,source,locale)
) WITHOUT ROWID;
CREATE INDEX search_identities_keyword_day ON search_daily_identities(keyword,day);

CREATE TABLE search_identity_days (
  day TEXT NOT NULL,
  identity TEXT NOT NULL CHECK(length(identity) = 64 AND identity NOT GLOB '*[^0-9a-f]*'),
  source TEXT NOT NULL CHECK(source IN ('all','website','miniapp','bot')),
  locale TEXT NOT NULL CHECK(locale IN ('all','zh','zh-hant','en')),
  PRIMARY KEY(day,identity,source,locale)
) WITHOUT ROWID;

CREATE TABLE search_daily_totals (
  day TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('all','website','miniapp','bot')),
  locale TEXT NOT NULL CHECK(locale IN ('all','zh','zh-hant','en')),
  searches INTEGER NOT NULL DEFAULT 0 CHECK(searches >= 0),
  results INTEGER NOT NULL DEFAULT 0 CHECK(results >= 0),
  zero_results INTEGER NOT NULL DEFAULT 0 CHECK(zero_results >= 0),
  identity_days INTEGER NOT NULL DEFAULT 0 CHECK(identity_days >= 0),
  PRIMARY KEY(day,source,locale),
  CHECK(searches = results + zero_results),
  CHECK(identity_days <= searches)
) WITHOUT ROWID;

CREATE TABLE search_event_receipts (
  kind TEXT NOT NULL CHECK(kind IN ('event','turnstile','session')),
  event_key TEXT NOT NULL CHECK(length(event_key) = 64 AND event_key NOT GLOB '*[^0-9a-f]*'),
  payload_digest TEXT NOT NULL CHECK(length(payload_digest) = 64 AND payload_digest NOT GLOB '*[^0-9a-f]*'),
  attempt TEXT NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at > 0),
  PRIMARY KEY(kind,event_key)
) WITHOUT ROWID;
CREATE INDEX search_receipts_expiry ON search_event_receipts(expires_at);

CREATE TABLE search_rate_limits (
  scope TEXT NOT NULL CHECK(scope IN ('global','ip','session_hour','session_day','telegram_day','session_issue','session_issue_global','security_sample')),
  subject TEXT NOT NULL,
  window TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count >= 0),
  expires_at INTEGER NOT NULL CHECK(expires_at > 0),
  PRIMARY KEY(scope,subject,window)
) WITHOUT ROWID;
CREATE INDEX search_rates_expiry ON search_rate_limits(expires_at);

CREATE TABLE search_keyword_rules (
  id INTEGER PRIMARY KEY,
  pattern TEXT NOT NULL CHECK(length(pattern) BETWEEN 2 AND 64),
  match_mode TEXT NOT NULL CHECK(match_mode IN ('exact','contains')),
  status TEXT NOT NULL CHECK(status IN ('blacklist','hidden','pending','approved')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  updated_at INTEGER NOT NULL CHECK(updated_at >= 0),
  UNIQUE(pattern,match_mode)
);

CREATE TABLE search_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  version INTEGER NOT NULL CHECK(version > 0),
  value TEXT NOT NULL CHECK(json_valid(value) AND json_type(value) = 'object'),
  updated_at INTEGER NOT NULL CHECK(updated_at >= 0)
);
INSERT INTO search_settings(id,version,value,updated_at) VALUES(1,1,'{}',0);

CREATE TABLE search_control (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  rules_revision INTEGER NOT NULL DEFAULT 1 CHECK(rules_revision > 0),
  publication_generation INTEGER NOT NULL DEFAULT 0 CHECK(publication_generation >= 0),
  publication_key TEXT,
  publication_rules_revision INTEGER,
  publication_config_version INTEGER,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0 CHECK(lease_until >= 0),
  fence INTEGER NOT NULL DEFAULT 0 CHECK(fence >= 0),
  CHECK((publication_key IS NULL AND publication_rules_revision IS NULL AND publication_config_version IS NULL)
     OR (publication_key IS NOT NULL AND publication_rules_revision IS NOT NULL AND publication_config_version IS NOT NULL
         AND publication_rules_revision > 0 AND publication_config_version > 0))
);
INSERT INTO search_control(id) VALUES(1);

CREATE TABLE search_job_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('cron','manual')),
  status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','superseded')),
  fence INTEGER NOT NULL CHECK(fence > 0),
  started_at INTEGER NOT NULL CHECK(started_at >= 0),
  finished_at INTEGER,
  duration_ms INTEGER CHECK(duration_ms IS NULL OR duration_ms >= 0),
  processed INTEGER NOT NULL DEFAULT 0 CHECK(processed >= 0),
  rows_read INTEGER NOT NULL DEFAULT 0 CHECK(rows_read >= 0),
  rows_written INTEGER NOT NULL DEFAULT 0 CHECK(rows_written >= 0),
  reason TEXT CHECK(reason IS NULL OR reason IN ('database','cache','lease','revision','invalid_payload','cleanup')),
  CHECK((status = 'running' AND finished_at IS NULL) OR (status <> 'running' AND finished_at IS NOT NULL AND finished_at >= started_at))
);
CREATE INDEX search_jobs_started ON search_job_runs(started_at);

CREATE TABLE search_admin_audit (
  id INTEGER PRIMARY KEY,
  actor TEXT NOT NULL CHECK(length(actor) = 64 AND actor NOT GLOB '*[^0-9a-f]*'),
  action TEXT NOT NULL CHECK(action IN ('rule','settings','refresh')),
  target TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  created_at INTEGER NOT NULL CHECK(created_at >= 0)
);
CREATE INDEX search_audit_created ON search_admin_audit(created_at);

CREATE TABLE search_security_daily (
  day TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('limited','duplicate','turnstile_success','turnstile_failure','invalid_identity','private','anomaly')),
  count INTEGER NOT NULL CHECK(count >= 0),
  sampled INTEGER NOT NULL CHECK(sampled IN (0,1)),
  PRIMARY KEY(day,reason)
) WITHOUT ROWID;
