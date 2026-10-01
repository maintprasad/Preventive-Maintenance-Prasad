// ════════════════════════════════════════════════════════
//  api/db.js — Vercel Serverless Function
//  SATU-SATUNYA pintu dari aplikasi PM ke database Turso.
//
//  Kenapa SQL ada di sini dan tidak di index.html:
//  token Turso memberi akses PENUH ke database (termasuk DROP TABLE). Apa pun
//  yang ditaruh di HTML/JS bisa dibaca siapa saja lewat "View Source". Jadi
//  browser hanya mengirim NAMA AKSI + data ({action:'saveReport', report:{…}}),
//  dan semua SQL — tetap/berparameter, tidak pernah dirakit dari input — hidup
//  di file ini, dijalankan di server Vercel dengan token dari Environment
//  Variable.
//
//  Lapisan pengamanan:
//   1. Token Turso hanya di Environment Variable Vercel (tidak di repo/HTML).
//   2. Whitelist aksi — tidak ada endpoint "jalankan SQL bebas".
//   3. Semua query memakai parameter (?), nama kolom dari daftar tetap →
//      kebal SQL injection.
//   4. Validasi & normalisasi setiap field (format id, angka, tanggal, panjang
//      teks, ukuran JSON, format gambar TTD); teks dinetralkan dari < > ".
//   5. APP_ACCESS_KEY (opsional, sangat disarankan): kunci akses bersama yang
//      diminta sekali di tiap perangkat — tanpa kunci → 401.
//   6. Cek Origin: request dari website lain ditolak (403).
//   7. Timestamp dari klien dibatasi (tidak boleh di masa depan) supaya satu
//      perangkat tidak bisa "menang selamanya" saat merge.
//   8. Hapus = soft delete (deletedAt) → bisa dipulihkan, dan tersinkron ke
//      semua perangkat; semua penulisan dicatat di audit_log.
//
//  Environment Variables (Vercel → Project → Settings → Environment Variables):
//    TURSO_DATABASE_URL   libsql://nama-db-org.turso.io
//    TURSO_AUTH_TOKEN     token dari: turso db tokens create nama-db
//    APP_ACCESS_KEY       kunci akses aplikasi (bebas, min. 12 karakter)
//    ALLOWED_ORIGINS      (opsional) mis. https://pm-prasad.vercel.app,https://pm.domainanda.com
// ════════════════════════════════════════════════════════
'use strict';
const crypto = require('crypto');

const TURSO_URL   = (process.env.TURSO_DATABASE_URL || '').trim().replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN || '').trim();
const APP_KEY     = (process.env.APP_ACCESS_KEY || '').trim();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);

const LOCK_TTL_MS     = 15 * 60 * 1000;   // samakan dengan LOCK_TTL_MS di js/00-config.js
const SYNC_OVERLAP_MS = 60 * 1000;        // tarik ulang 60 dtk terakhir — tutup celah tulis bersamaan
const PERIODES  = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual'];
const ID_RE     = /^[A-Za-z0-9._:-]{1,80}$/;
const EQTYPE_RE = /^[a-z0-9_]{0,40}$/;
const PNG_RE    = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

// ════════════════════════════════════════════════════════
//  SKEMA — dibuat otomatis saat function pertama kali jalan (IF NOT EXISTS),
//  jadi tidak perlu menjalankan SQL manual. Salinan yang sama ada di
//  sql/schema.sql untuk referensi / dijalankan lewat turso db shell.
//  Kolom memakai nama camelCase yang sama dengan field di aplikasi.
//  serverAt = waktu SERVER saat baris terakhir ditulis → dipakai untuk sync
//  inkremental (perangkat hanya menarik yang berubah sejak sync terakhir).
// ════════════════════════════════════════════════════════
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS schedules (
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
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
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
  )`,
  `CREATE TABLE IF NOT EXISTS signatures (
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
  )`,
  `CREATE TABLE IF NOT EXISTS templates (
    equipmentType TEXT PRIMARY KEY,
    items         TEXT NOT NULL DEFAULT '[]',
    updatedAt     TEXT NOT NULL,
    updatedBy     TEXT,
    serverAt      TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS locks (
    scheduleId    TEXT PRIMARY KEY,
    equipmentName TEXT NOT NULL DEFAULT '',
    deviceId      TEXT NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    acquiredAt    TEXT NOT NULL,
    heartbeatAt   TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    at       TEXT NOT NULL,
    deviceId TEXT,
    ip       TEXT,
    action   TEXT NOT NULL,
    recordId TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_schedules_serverAt ON schedules(serverAt)`,
  `CREATE INDEX IF NOT EXISTS idx_reports_serverAt   ON reports(serverAt)`,
  `CREATE INDEX IF NOT EXISTS idx_reports_date       ON reports(date)`,
  `CREATE INDEX IF NOT EXISTS idx_signatures_serverAt ON signatures(serverAt)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_at           ON audit_log(at)`
];

const SCHEDULE_COLS = ['id','unit','area','equipment','tagNo','equipmentType','periode','month','week','pic',
  'lastDone','mp','hari','notes','startDate','takeoverAt','takeoverFrom','takeoverReason',
  'createdAt','updatedAt','deletedAt','updatedBy','serverAt'];
const REPORT_COLS = ['id','tagNo','date','equipmentType','equipmentName','unit','area','periode','week','month',
  'teknisi','approval','notes','ppe','aktivitas','spareParts','submittedAt','updatedAt','deletedAt','updatedBy','serverAt'];
const SIGNATURE_COLS = ['pmId','tagNo','equipmentName','tanggal','spvName','spvSignature','spvSignedAt',
  'leaderName','leaderSignature','leaderSignedAt','updatedAt','updatedBy','serverAt'];
const TEMPLATE_COLS = ['equipmentType','items','updatedAt','updatedBy','serverAt'];

// UPSERT dengan penjaga "yang lebih baru menang": baris di server hanya
// ditimpa kalau updatedAt kiriman >= yang tersimpan, dan record yang sudah
// dihapus tidak hidup lagi oleh kiriman lama dari antrian offline.
function upsertSql(table, cols, pk, { keep = [], softDelete = false } = {}) {
  const sets = cols.filter(c => c !== pk && !keep.includes(c)).map(c => `${c} = excluded.${c}`).join(', ');
  let guard = `excluded.updatedAt >= ${table}.updatedAt`;
  if (softDelete) guard += ` AND (${table}.deletedAt IS NULL OR excluded.updatedAt > ${table}.deletedAt)`;
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
          ON CONFLICT(${pk}) DO UPDATE SET ${sets} WHERE ${guard}`;
}
const SQL = {
  upsertSchedule:  upsertSql('schedules',  SCHEDULE_COLS,  'id',            { keep: ['createdAt'], softDelete: true }),
  upsertReport:    upsertSql('reports',    REPORT_COLS,    'id',            { softDelete: true }),
  upsertSignature: upsertSql('signatures', SIGNATURE_COLS, 'pmId'),
  upsertTemplate:  upsertSql('templates',  TEMPLATE_COLS,  'equipmentType'),
};

// ════════════════════════════════════════════════════════
//  KLIEN TURSO (HTTP API /v2/pipeline — tanpa dependency npm)
// ════════════════════════════════════════════════════════
function toArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
  return { type: 'text', value: String(v) };
}
function fromValue(v) {
  if (!v || v.type === 'null') return null;
  if (v.type === 'integer') return Number(v.value);
  return v.value;   // text / float / blob(base64)
}

async function runPipeline(stmts) {
  const body = {
    requests: [
      ...stmts.map(s => ({ type: 'execute', stmt: { sql: s.sql, args: (s.args || []).map(toArg) } })),
      { type: 'close' }
    ]
  };
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return stmts.map((_, i) => {
    const r = data.results && data.results[i];
    if (!r || r.type !== 'ok') throw new Error('Turso: ' + ((r && r.error && r.error.message) || 'query gagal'));
    const result = r.response.result;
    const cols = result.cols.map(c => c.name);
    return {
      rows: result.rows.map(row => Object.fromEntries(row.map((v, j) => [cols[j], fromValue(v)]))),
      changes: result.affected_row_count || 0
    };
  });
}
const query = async (sql, args) => (await runPipeline([{ sql, args }]))[0];

let _schemaReady = null;
function ensureSchema() {
  if (!_schemaReady) {
    _schemaReady = runPipeline(SCHEMA.map(sql => ({ sql }))).catch(e => { _schemaReady = null; throw e; });
  }
  return _schemaReady;
}

// ════════════════════════════════════════════════════════
//  VALIDASI & NORMALISASI INPUT
// ════════════════════════════════════════════════════════
class BadRequest extends Error {}
const bad = msg => new BadRequest(msg);

function neutralize(s) {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/</g, '‹').replace(/>/g, '›').replace(/"/g, '″');
}
function neutralizeDeep(v) {
  if (typeof v === 'string') return neutralize(v);
  if (Array.isArray(v)) return v.map(neutralizeDeep);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) if (/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(k)) out[k] = neutralizeDeep(v[k]);
    return out;
  }
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
  return null;
}
const text = (v, max = 300) => (v === null || v === undefined) ? '' : neutralize(String(v)).slice(0, max).trim();

function id(v, label = 'id') {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!ID_RE.test(s)) throw bad(`${label} tidak valid`);
  return s;
}
function optInt(v, min, max) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}
// 'YYYY-MM-DD'. Data lama dari Google Sheets kadang datang sebagai datetime
// UTC (mis. 2025-03-02T17:00:00.000Z = 3 Maret WIB) → dikonversi ke tanggal WIB.
const _wib = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
function dateStr(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : _wib.format(d);
}
// Timestamp ISO. Kosong/rusak → sekarang. Masa depan (jam HP salah / sengaja)
// → dipotong ke sekarang, supaya tidak "menang" atas semua edit berikutnya.
function stamp(v, nowIso) {
  const d = v ? new Date(v) : null;
  if (!d || isNaN(d.getTime())) return nowIso;
  return d.getTime() > Date.parse(nowIso) + 5 * 60 * 1000 ? nowIso : d.toISOString();
}
const optStamp = (v, nowIso) => (v ? stamp(v, nowIso) : null);

function jsonField(v, kind, maxItems, maxBytes) {
  let parsed = v;
  if (typeof v === 'string') { try { parsed = JSON.parse(v || (kind === 'array' ? '[]' : '{}')); } catch { throw bad('JSON rusak'); } }
  if (parsed === null || parsed === undefined) parsed = kind === 'array' ? [] : {};
  if (kind === 'array' && !Array.isArray(parsed)) throw bad('harus berupa array');
  if (kind === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed))) throw bad('harus berupa object');
  if (kind === 'array' && parsed.length > maxItems) throw bad(`maksimal ${maxItems} item`);
  const out = JSON.stringify(neutralizeDeep(parsed));
  if (out.length > maxBytes) throw bad('data terlalu besar');
  return out;
}
function png(v) {
  if (!v) return '';
  const s = String(v);
  if (s.length > 400000 || !PNG_RE.test(s)) throw bad('gambar tanda tangan tidak valid');
  return s;
}
function periode(v) { return PERIODES.includes(v) ? v : 'Monthly'; }
function eqType(v) { const s = String(v || '').trim(); return EQTYPE_RE.test(s) ? s : ''; }

function normSchedule(s, ctx) {
  if (!s || typeof s !== 'object') throw bad('schedule kosong');
  const equipment = text(s.equipment, 200);
  if (!equipment) throw bad('nama equipment wajib diisi');
  return {
    id: id(s.id), unit: text(s.unit, 100), area: text(s.area, 100), equipment,
    tagNo: text(s.tagNo, 60), equipmentType: eqType(s.equipmentType), periode: periode(s.periode),
    month: optInt(s.month, 1, 12), week: optInt(s.week, 1, 6), pic: text(s.pic, 100),
    lastDone: dateStr(s.lastDone), mp: optInt(s.mp, 0, 999), hari: optInt(s.hari, 0, 999),
    notes: text(s.notes, 2000), startDate: dateStr(s.startDate),
    takeoverAt: optStamp(s.takeoverAt, ctx.now), takeoverFrom: s.takeoverFrom ? text(s.takeoverFrom, 60) : null,
    takeoverReason: s.takeoverReason ? text(s.takeoverReason, 500) : null,
    createdAt: stamp(s.createdAt || s.startDate || s.updatedAt, ctx.now), updatedAt: stamp(s.updatedAt, ctx.now),
    deletedAt: null, updatedBy: ctx.deviceId, serverAt: ctx.now
  };
}
function normReport(r, ctx) {
  if (!r || typeof r !== 'object') throw bad('laporan kosong');
  return {
    id: id(r.id), tagNo: text(r.tagNo, 60), date: dateStr(r.date), equipmentType: eqType(r.equipmentType),
    equipmentName: text(r.equipmentName, 200), unit: text(r.unit, 100), area: text(r.area, 100),
    periode: r.periode ? periode(r.periode) : '', week: optInt(r.week, 1, 6), month: optInt(r.month, 1, 12),
    teknisi: text(r.teknisi, 100), approval: text(r.approval, 100), notes: text(r.notes, 3000),
    ppe: jsonField(r.ppe, 'object', 0, 2000),
    aktivitas: jsonField(r.aktivitas, 'array', 200, 100000),
    spareParts: jsonField(r.spareParts, 'array', 100, 30000),
    submittedAt: optStamp(r.submittedAt, ctx.now), updatedAt: stamp(r.updatedAt || r.submittedAt, ctx.now),
    deletedAt: null, updatedBy: ctx.deviceId, serverAt: ctx.now
  };
}
function normSignature(s, ctx) {
  if (!s || typeof s !== 'object') throw bad('tanda tangan kosong');
  return {
    pmId: id(s.pmId, 'pmId'), tagNo: text(s.tagNo, 60), equipmentName: text(s.equipmentName, 200), tanggal: dateStr(s.tanggal),
    spvName: text(s.spvName, 100), spvSignature: png(s.spvSignature), spvSignedAt: s.spvSignedAt ? stamp(s.spvSignedAt, ctx.now) : '',
    leaderName: text(s.leaderName, 100), leaderSignature: png(s.leaderSignature), leaderSignedAt: s.leaderSignedAt ? stamp(s.leaderSignedAt, ctx.now) : '',
    updatedAt: stamp(s.updatedAt, ctx.now), updatedBy: ctx.deviceId, serverAt: ctx.now
  };
}
function normTemplate(type, items, ctx) {
  const t = String(type || '').trim();
  if (!t || !EQTYPE_RE.test(t)) throw bad('equipmentType tidak valid');
  if (!Array.isArray(items)) throw bad('items harus array');
  if (items.length > 100) throw bad('maksimal 100 item checklist');
  const clean = items.map(i => text(i, 300)).filter(Boolean);
  return { equipmentType: t, items: JSON.stringify(clean), updatedAt: ctx.now, updatedBy: ctx.deviceId, serverAt: ctx.now };
}

const argsOf = (obj, cols) => cols.map(c => obj[c]);
const audit = (ctx, action, recordId) => ({
  sql: 'INSERT INTO audit_log (at, deviceId, ip, action, recordId) VALUES (?, ?, ?, ?, ?)',
  args: [ctx.now, ctx.deviceId, ctx.ip, action, recordId || null]
});
const sinceArg = since => {
  const t = since ? Date.parse(since) : NaN;
  return isNaN(t) ? '' : new Date(t - SYNC_OVERLAP_MS).toISOString();
};

// ════════════════════════════════════════════════════════
//  AKSI (whitelist) — nama & bentuk balasan sama dengan backend GAS lama
// ════════════════════════════════════════════════════════
async function pullTable(table, since, ctx) {
  const s = sinceArg(since);
  const [live, dead] = await runPipeline([
    { sql: `SELECT * FROM ${table} WHERE deletedAt IS NULL AND serverAt > ? ORDER BY serverAt`, args: [s] },
    { sql: `SELECT id FROM ${table} WHERE deletedAt IS NOT NULL AND serverAt > ?`, args: [s] }
  ]);
  const rows = live.rows.map(r => { delete r.deletedAt; delete r.updatedBy; delete r.serverAt; return r; });
  return { rows, deleted: dead.rows.map(r => r.id), cursor: ctx.now };
}

const ACTIONS = {
  async ping(_, ctx) { await query('SELECT 1'); return { ts: ctx.now }; },

  async getSchedules(b, ctx) {
    const { rows, deleted, cursor } = await pullTable('schedules', b.since, ctx);
    rows.forEach(r => { if (r.mp === null) r.mp = ''; if (r.hari === null) r.hari = ''; });
    return { schedules: rows, deleted, cursor };
  },
  async getReports(b, ctx) {
    const { rows, deleted, cursor } = await pullTable('reports', b.since, ctx);
    return { reports: rows, deleted, cursor };
  },

  async saveSchedule(b, ctx) {
    const s = normSchedule(b.schedule, ctx);
    await runPipeline([{ sql: SQL.upsertSchedule, args: argsOf(s, SCHEDULE_COLS) }, audit(ctx, 'saveSchedule', s.id)]);
    return { id: s.id };
  },
  async saveReport(b, ctx) {
    const r = normReport(b.report, ctx);
    await runPipeline([{ sql: SQL.upsertReport, args: argsOf(r, REPORT_COLS) }, audit(ctx, 'saveReport', r.id)]);
    return { id: r.id };
  },
  async deleteSchedule(b, ctx) {
    const sid = id(b.id);
    await runPipeline([
      { sql: 'UPDATE schedules SET deletedAt = ?, updatedAt = ?, serverAt = ?, updatedBy = ? WHERE id = ? AND deletedAt IS NULL', args: [ctx.now, ctx.now, ctx.now, ctx.deviceId, sid] },
      { sql: 'DELETE FROM locks WHERE scheduleId = ?', args: [sid] },
      audit(ctx, 'deleteSchedule', sid)
    ]);
    return {};
  },
  async deleteReport(b, ctx) {
    const rid = id(b.id);
    await runPipeline([
      { sql: 'UPDATE reports SET deletedAt = ?, updatedAt = ?, serverAt = ?, updatedBy = ? WHERE id = ? AND deletedAt IS NULL', args: [ctx.now, ctx.now, ctx.now, ctx.deviceId, rid] },
      audit(ctx, 'deleteReport', rid)
    ]);
    return {};
  },

  // ── Lock per equipment: satu statement UPSERT bersyarat = atomik, tanpa race ──
  async acquireLock(b, ctx) {
    const sid = id(b.scheduleId, 'scheduleId');
    const cutoff = new Date(Date.parse(ctx.now) - LOCK_TTL_MS).toISOString();
    const [, cur] = await runPipeline([
      { sql: `INSERT INTO locks (scheduleId, equipmentName, deviceId, name, acquiredAt, heartbeatAt) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(scheduleId) DO UPDATE SET equipmentName = excluded.equipmentName, deviceId = excluded.deviceId,
                name = excluded.name, acquiredAt = excluded.acquiredAt, heartbeatAt = excluded.heartbeatAt
              WHERE locks.deviceId = excluded.deviceId OR locks.heartbeatAt < ?`,
        args: [sid, text(b.equipmentName, 200), ctx.deviceId, text(b.name, 100), ctx.now, ctx.now, cutoff] },
      { sql: 'SELECT * FROM locks WHERE scheduleId = ?', args: [sid] }
    ]);
    const l = cur.rows[0];
    if (l && l.deviceId !== ctx.deviceId) {
      return { success: false, lockedBy: l.deviceId, lockedByName: l.name, acquiredAt: l.acquiredAt };
    }
    return {};
  },
  async releaseLock(b, ctx) {
    const cutoff = new Date(Date.parse(ctx.now) - LOCK_TTL_MS).toISOString();
    await query('DELETE FROM locks WHERE scheduleId = ? AND (deviceId = ? OR heartbeatAt < ?)', [id(b.scheduleId, 'scheduleId'), ctx.deviceId, cutoff]);
    return {};
  },
  async heartbeatLock(b, ctx) {
    const r = await query('UPDATE locks SET heartbeatAt = ? WHERE scheduleId = ? AND deviceId = ?', [ctx.now, id(b.scheduleId, 'scheduleId'), ctx.deviceId]);
    return r.changes ? {} : { success: false, message: 'lock tidak ditemukan / bukan pemilik' };
  },
  async getLocks(_, ctx) {
    const cutoff = new Date(Date.parse(ctx.now) - LOCK_TTL_MS).toISOString();
    const [, cur] = await runPipeline([
      { sql: 'DELETE FROM locks WHERE heartbeatAt < ?', args: [cutoff] },
      { sql: 'SELECT scheduleId, equipmentName, deviceId, name, acquiredAt, heartbeatAt FROM locks' }
    ]);
    return { locks: cur.rows };
  },

  async saveSignature(b, ctx) {
    const s = normSignature(b.signature, ctx);
    await runPipeline([{ sql: SQL.upsertSignature, args: argsOf(s, SIGNATURE_COLS) }, audit(ctx, 'saveSignature', s.pmId)]);
    return {};
  },
  async getSignatures(b, ctx) {
    const r = await query('SELECT * FROM signatures WHERE serverAt > ? ORDER BY serverAt', [sinceArg(b.since)]);
    r.rows.forEach(x => { delete x.updatedBy; delete x.serverAt; });
    return { signatures: r.rows, cursor: ctx.now };
  },

  async getTemplates() {
    const r = await query('SELECT equipmentType, items FROM templates');
    const templates = {};
    r.rows.forEach(x => { try { templates[x.equipmentType] = JSON.parse(x.items); } catch { /* lewati baris rusak */ } });
    return { templates };
  },
  async saveTemplate(b, ctx) {
    const t = normTemplate(b.equipmentType, b.items, ctx);
    await runPipeline([{ sql: SQL.upsertTemplate, args: argsOf(t, TEMPLATE_COLS) }, audit(ctx, 'saveTemplate', t.equipmentType)]);
    return {};
  },
  // Kompatibilitas antrian lama (versi sebelumnya mengirim per item).
  async deleteTemplateItem(b, ctx) {
    const type = String(b.equipmentType || '');
    const r = await query('SELECT items FROM templates WHERE equipmentType = ?', [type]);
    if (!r.rows.length) return {};
    let items = [];
    try { items = JSON.parse(r.rows[0].items); } catch {}
    const target = text(b.item, 300);
    return ACTIONS.saveTemplate({ equipmentType: type, items: items.filter(i => i !== target) }, ctx);
  },

  // ── Migrasi / impor massal (dipakai migrateFromSheets() di 04-sync.js) ──
  async bulkUpsert(b, ctx) {
    const lim = (arr, n, label) => {
      if (arr === undefined) return [];
      if (!Array.isArray(arr)) throw bad(`${label} harus array`);
      if (arr.length > n) throw bad(`maksimal ${n} ${label} per request`);
      return arr;
    };
    const stmts = [];
    let rejected = 0;
    const tryAdd = fn => { try { stmts.push(fn()); } catch (e) { if (e instanceof BadRequest) rejected++; else throw e; } };

    lim(b.schedules, 200, 'schedules').forEach(s => tryAdd(() => ({ sql: SQL.upsertSchedule, args: argsOf(normSchedule(s, ctx), SCHEDULE_COLS) })));
    lim(b.reports, 200, 'reports').forEach(r => tryAdd(() => ({ sql: SQL.upsertReport, args: argsOf(normReport(r, ctx), REPORT_COLS) })));
    lim(b.signatures, 30, 'signatures').forEach(s => tryAdd(() => ({ sql: SQL.upsertSignature, args: argsOf(normSignature(s, ctx), SIGNATURE_COLS) })));
    if (b.templates !== undefined) {
      if (!b.templates || typeof b.templates !== 'object' || Array.isArray(b.templates)) throw bad('templates harus object');
      const entries = Object.entries(b.templates);
      if (entries.length > 60) throw bad('terlalu banyak template');
      entries.forEach(([type, items]) => tryAdd(() => ({ sql: SQL.upsertTemplate, args: argsOf(normTemplate(type, items, ctx), TEMPLATE_COLS) })));
    }
    if (stmts.length) await runPipeline([...stmts, audit(ctx, 'bulkUpsert', `${stmts.length} rows`)]);
    return { count: stmts.length, rejected };
  }
};
ACTIONS.updateSchedule = ACTIONS.saveSchedule;   // nama lama dari antrian offline versi sebelumnya

// ════════════════════════════════════════════════════════
//  HANDLER HTTP
// ════════════════════════════════════════════════════════
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(obj));
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;              // request same-origin non-CORS (mis. sendBeacon lama) / server-ke-server
  const o = origin.replace(/\/+$/, '');
  if (ALLOWED_ORIGINS.length) return ALLOWED_ORIGINS.includes(o);
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  try { return new URL(o).host === host; } catch { return false; }
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body);
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Gunakan POST' });
  if (!originAllowed(req)) return send(res, 403, { success: false, message: 'Origin tidak diizinkan' });

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { success: false, rejected: true, message: 'Body bukan JSON' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { success: false, rejected: true, message: 'Body tidak valid' });

  if (APP_KEY) {
    const key = req.headers['x-app-key'] || body.appKey || '';
    if (!safeEqual(key, APP_KEY)) return send(res, 401, { success: false, message: 'Kunci akses salah' });
  }
  if (!TURSO_URL || !TURSO_TOKEN) return send(res, 500, { success: false, message: 'Server belum dikonfigurasi (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN)' });

  const action = typeof body.action === 'string' ? body.action : '';
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!fn) return send(res, 400, { success: false, rejected: true, message: 'Aksi tidak dikenal' });

  const ctx = {
    now: new Date().toISOString(),
    deviceId: ID_RE.test(String(body.deviceId || '')) ? String(body.deviceId) : 'unknown',
    ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 45)
  };

  try {
    await ensureSchema();
    const out = await fn(body, ctx);
    return send(res, 200, { success: true, ...out });
  } catch (e) {
    if (e instanceof BadRequest) return send(res, 400, { success: false, rejected: true, message: e.message });
    console.error('[api/db]', action, e);
    return send(res, 500, { success: false, message: 'Database error' });   // detail hanya di log Vercel
  }
};

// Diekspor untuk pengujian lokal (tools/test-api.js)
module.exports._internal = { SCHEMA, normSchedule, normReport, normSignature, normTemplate, neutralize };
