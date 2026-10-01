-- ════════════════════════════════════════════════════════
-- Skema database Turso (libSQL / SQLite) untuk aplikasi PM.
--
-- TIDAK WAJIB dijalankan manual: api/db.js membuat tabel ini otomatis
-- (CREATE TABLE IF NOT EXISTS) saat pertama kali dipanggil.
-- File ini dihasilkan dari konstanta SCHEMA di api/db.js — kalau skema
-- diubah, ubah di sana.
--
-- Jalankan manual (opsional):  turso db shell <nama-db> < sql/schema.sql
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schedules (
  id             TEXT PRIMARY KEY,
  unit           TEXT NOT NULL DEFAULT '',
  area           TEXT NOT NULL DEFAULT '',
  equipment      TEXT NOT NULL DEFAULT '',
  tagNo          TEXT NOT NULL DEFAULT '',
  equipmentType  TEXT NOT NULL DEFAULT '',
  periode        TEXT NOT NULL DEFAULT 'Monthly',
  month          INTEGER CHECK (month IS NULL OR month BETWEEN 1 AND 12),
  week           INTEGER CHECK (week  IS NULL OR week  BETWEEN 1 AND 6),
  pic            TEXT NOT NULL DEFAULT '',
  lastDone       TEXT NOT NULL DEFAULT '',
  mp             INTEGER,
  hari           INTEGER,
  notes          TEXT NOT NULL DEFAULT '',
  startDate      TEXT NOT NULL DEFAULT '',
  takeoverAt     TEXT,
  takeoverFrom   TEXT,
  takeoverReason TEXT,
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL,
  deletedAt      TEXT,
  updatedBy      TEXT,
  serverAt       TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS reports (
  id             TEXT PRIMARY KEY,
  tagNo          TEXT NOT NULL DEFAULT '',
  date           TEXT NOT NULL DEFAULT '',
  equipmentType  TEXT NOT NULL DEFAULT '',
  equipmentName  TEXT NOT NULL DEFAULT '',
  unit           TEXT NOT NULL DEFAULT '',
  area           TEXT NOT NULL DEFAULT '',
  periode        TEXT NOT NULL DEFAULT '',
  week           INTEGER,
  month          INTEGER,
  teknisi        TEXT NOT NULL DEFAULT '',
  approval       TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  ppe            TEXT NOT NULL DEFAULT '{}',
  aktivitas      TEXT NOT NULL DEFAULT '[]',
  spareParts     TEXT NOT NULL DEFAULT '[]',
  submittedAt    TEXT,
  updatedAt      TEXT NOT NULL,
  deletedAt      TEXT,
  updatedBy      TEXT,
  serverAt       TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS signatures (
  pmId            TEXT PRIMARY KEY,
  tagNo           TEXT NOT NULL DEFAULT '',
  equipmentName   TEXT NOT NULL DEFAULT '',
  tanggal         TEXT NOT NULL DEFAULT '',
  spvName         TEXT NOT NULL DEFAULT '',
  spvSignature    TEXT NOT NULL DEFAULT '',
  spvSignedAt     TEXT NOT NULL DEFAULT '',
  leaderName      TEXT NOT NULL DEFAULT '',
  leaderSignature TEXT NOT NULL DEFAULT '',
  leaderSignedAt  TEXT NOT NULL DEFAULT '',
  updatedAt       TEXT NOT NULL,
  updatedBy       TEXT,
  serverAt        TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS templates (
  equipmentType TEXT PRIMARY KEY,
  items         TEXT NOT NULL DEFAULT '[]',
  updatedAt     TEXT NOT NULL,
  updatedBy     TEXT,
  serverAt      TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS locks (
  scheduleId    TEXT PRIMARY KEY,
  equipmentName TEXT NOT NULL DEFAULT '',
  deviceId      TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  acquiredAt    TEXT NOT NULL,
  heartbeatAt   TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS audit_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       TEXT NOT NULL,
  deviceId TEXT,
  ip       TEXT,
  action   TEXT NOT NULL,
  recordId TEXT
  );

CREATE INDEX IF NOT EXISTS idx_schedules_serverAt ON schedules(serverAt);

CREATE INDEX IF NOT EXISTS idx_reports_serverAt   ON reports(serverAt);

CREATE INDEX IF NOT EXISTS idx_reports_date       ON reports(date);

CREATE INDEX IF NOT EXISTS idx_signatures_serverAt ON signatures(serverAt);

CREATE INDEX IF NOT EXISTS idx_audit_at           ON audit_log(at);
