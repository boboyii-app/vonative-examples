ALTER TABLE incidents ADD COLUMN recording_available INTEGER NOT NULL DEFAULT 0;
ALTER TABLE incidents ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'pending_review'
  CHECK (analysis_status IN ('completed', 'pending_review', 'failed'));
ALTER TABLE incidents ADD COLUMN analysis_error TEXT;

CREATE INDEX IF NOT EXISTS incidents_analysis_status_idx ON incidents(analysis_status);
