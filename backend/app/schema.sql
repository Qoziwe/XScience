-- Backend data model (§4.4, §4.2, §4.3, §16.3).
-- Analyses and reports are never deleted or edited (safety log):
-- only INSERT is allowed for them, except for the report transmission status (§11.4).

-- The full analysis record (§4.2). record is the entire JSON object; individual
-- columns are broken out for queries (listing, filtering by sector, ship aggregation).
CREATE TABLE IF NOT EXISTS analyses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  operator_id TEXT,
  sector      TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'manual',
  verdict     TEXT NOT NULL,
  risk_score  INTEGER NOT NULL,
  ext_score   INTEGER NOT NULL,
  confidence  INTEGER NOT NULL,
  record      TEXT NOT NULL,
  acked_at    TEXT,
  acked_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_analyses_sector ON analyses(sector, id);

-- §4.3 — report for Earth. Only the transmission status changes (§11.4).
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id),
  sector      TEXT NOT NULL,
  verdict     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  author      TEXT NOT NULL,
  status      TEXT NOT NULL,       -- queued | sent | failed
  sent_at     TEXT,
  channel     TEXT NOT NULL DEFAULT 'mock',
  content     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_analysis ON reports(analysis_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- §18.3 — protection against duplicates from double-clicks/retries.
CREATE TABLE IF NOT EXISTS idempotency (
  key          TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  analysis_id  INTEGER NOT NULL REFERENCES analyses(id),
  created_at   TEXT NOT NULL,
  PRIMARY KEY (key, user_id)
);

-- §17.1 — trained ML models (weights + metrics). Only one is active.
CREATE TABLE IF NOT EXISTS ml_models (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind       TEXT NOT NULL,
  version    TEXT NOT NULL,
  params     TEXT NOT NULL,
  metrics    TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 0
);

-- §4.5, §17.3, §18.7 — flame photos. The file lives outside the web root; the DB holds only metadata.
CREATE TABLE IF NOT EXISTS photos (
  id          TEXT PRIMARY KEY,
  analysis_id INTEGER REFERENCES analyses(id),
  file_name   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  mime        TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT,
  annotation  TEXT NOT NULL DEFAULT '{}',
  recognition TEXT
);
CREATE INDEX IF NOT EXISTS idx_photos_analysis ON photos(analysis_id);
