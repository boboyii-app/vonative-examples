CREATE TABLE IF NOT EXISTS allowed_call_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('assistant', 'workflow')),
  source_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  UNIQUE(source_type, source_id)
);

CREATE TABLE IF NOT EXISTS call_source_audit (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS allowed_call_sources_enabled_idx ON allowed_call_sources(enabled);
