-- Sentinel NG incident storage. JSON snapshots on incidents make reads simple for
-- the demo, while the child tables provide queryable/auditable D1 records.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('security', 'medical', 'disaster')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('new', 'acknowledged', 'assigned', 'escalated', 'resolved')),
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  summary TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 0,
  unverified INTEGER NOT NULL DEFAULT 1,
  escalation_ready INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  assigned_to TEXT,
  call_id TEXT UNIQUE,
  recording_reference TEXT,
  facts_json TEXT NOT NULL DEFAULT '[]',
  transcript_json TEXT NOT NULL DEFAULT '[]',
  timeline_json TEXT NOT NULL DEFAULT '[]',
  related_reports_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS incidents_updated_at_idx ON incidents(updated_at DESC);
CREATE INDEX IF NOT EXISTS incidents_severity_idx ON incidents(severity);
CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents(status);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS incident_facts (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  at TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL,
  revised INTEGER NOT NULL DEFAULT 0,
  revision_of TEXT,
  source_event_id TEXT
);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operator_actions (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  related_report_id TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  assignee TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS related_report_links (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL,
  title TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'reviewed', 'not_duplicate', 'linked')),
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  event_json TEXT NOT NULL
);
