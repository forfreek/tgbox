-- Additive only. Old liveness data is intentionally NOT backfilled as verified evidence.
CREATE TABLE entry_health (
 entry_id integer PRIMARY KEY NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
 binding_username text NOT NULL, binding_kind text NOT NULL,
 public_state text NOT NULL DEFAULT 'unverified' CHECK(public_state IN ('unverified','accessible','uncertain','identity_review')),
 observed_at integer, confirmed_at integer, reason text, observation_id text,
 function_state text NOT NULL DEFAULT 'unverified' CHECK(function_state IN ('unverified','responded','no_response','reported_issue')),
 function_at integer, function_observation_id text, function_evidence text CHECK(function_evidence IS NULL OR json_valid(function_evidence)),
 revision integer NOT NULL DEFAULT 0, evidence_seq integer NOT NULL DEFAULT 0,
 identity_reviewed_at integer, evidence_at integer, write_token text, evidence_token text
);
CREATE INDEX entry_health_state ON entry_health(public_state,entry_id);
CREATE TABLE entry_health_evidence (
 entry_id integer NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
 slot integer NOT NULL CHECK(slot >= 0 AND slot < 16),
 observation_id text NOT NULL UNIQUE,
 observed_at integer NOT NULL, source text NOT NULL CHECK(source IN ('tme_profile','manual_function_check','manual_identity_review')),
 evidence text NOT NULL CHECK(json_valid(evidence)),
 PRIMARY KEY(entry_id,slot)
);
CREATE INDEX entry_health_evidence_time ON entry_health_evidence(entry_id,observed_at);
