-- The legacy latitude/longitude columns stay non-null for prior installations.
-- Sentinel renders only these nullable geocoded columns, so no unresolved call
-- is ever placed at a fabricated location.
ALTER TABLE incidents ADD COLUMN geocoded_latitude REAL;
ALTER TABLE incidents ADD COLUMN geocoded_longitude REAL;
ALTER TABLE incidents ADD COLUMN reported_address TEXT;
ALTER TABLE incidents ADD COLUMN geocoding_status TEXT NOT NULL DEFAULT 'not_requested'
  CHECK (geocoding_status IN ('matched', 'ambiguous', 'unresolved', 'not_requested', 'verified'));
ALTER TABLE incidents ADD COLUMN geocoding_confidence REAL;
ALTER TABLE incidents ADD COLUMN geocoding_provider TEXT;
ALTER TABLE incidents ADD COLUMN geocoding_feature_id TEXT;
CREATE INDEX IF NOT EXISTS incidents_geocoding_status_idx ON incidents(geocoding_status);
