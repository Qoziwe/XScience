-- Модель данных бэкенда (§4.4, §4.2, §4.3, §16.3).
-- Анализы и отчёты не удаляются и не редактируются (журнал безопасности):
-- для них разрешён только INSERT, кроме статуса передачи отчёта (§11.4).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret   TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'operator',
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  -- password_ok = пройден шаг 1, ждём код; authenticated = вход завершён (§4.4)
  stage         TEXT NOT NULL,
  csrf_token    TEXT NOT NULL,
  code_attempts INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- §6.5 — журнал всех попыток входа.
CREATE TABLE IF NOT EXISTS login_attempts (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  login  TEXT NOT NULL,
  ip     TEXT NOT NULL,
  at     TEXT NOT NULL,
  result TEXT NOT NULL  -- bad_password | bad_code | ok | locked
);
CREATE INDEX IF NOT EXISTS idx_attempts_login ON login_attempts(login, at);
CREATE INDEX IF NOT EXISTS idx_attempts_ip ON login_attempts(ip, at);

-- Полная запись анализа (§4.2). record — весь объект JSON; отдельные столбцы
-- вынесены для выборок (список, фильтр по сектору, агрегация корабля).
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

-- §4.3 — отчёт для Земли. Меняется только статус передачи (§11.4).
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

-- §18.3 — защита от дублей при двойном клике/ретрае.
CREATE TABLE IF NOT EXISTS idempotency (
  key          TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  analysis_id  INTEGER NOT NULL REFERENCES analyses(id),
  created_at   TEXT NOT NULL,
  PRIMARY KEY (key, user_id)
);

-- §17.1 — обученные ML-модели (веса + метрики). Активная одна.
CREATE TABLE IF NOT EXISTS ml_models (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind       TEXT NOT NULL,
  version    TEXT NOT NULL,
  params     TEXT NOT NULL,
  metrics    TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 0
);

-- §4.5, §17.3, §18.7 — фото пламени. Файл лежит вне веб-корня, в БД только метаданные.
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
