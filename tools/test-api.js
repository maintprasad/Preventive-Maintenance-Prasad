#!/usr/bin/env node
/**
 * test-api.js — Uji integrasi api/db.js tanpa Turso asli.
 *
 * Turso dipalsukan dengan SQLite in-memory (node:sqlite, bawaan Node 22+), jadi SQL
 * UPSERT / skema / validasi yang diuji adalah yang sama dengan produksi.
 *
 *   node tools/test-api.js
 */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert/strict');

process.env.TURSO_DATABASE_URL = 'libsql://fake.turso.io';
process.env.TURSO_AUTH_TOKEN = 'fake-token';
process.env.APP_ACCESS_KEY = 'test-key-123456';

// ── Turso palsu: /v2/pipeline di atas SQLite in-memory ──
const db = new DatabaseSync(':memory:');
const toVal = v => v === null || v === undefined ? { type: 'null' } : typeof v === 'number' ? { type: 'integer', value: String(v) } : { type: 'text', value: String(v) };
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const results = [];
  for (const rq of body.requests) {
    if (rq.type !== 'execute') { results.push({ type: 'ok', response: { type: 'close' } }); continue; }
    try {
      const args = (rq.stmt.args || []).map(a => a.type === 'null' ? null : a.type === 'integer' ? Number(a.value) : a.value);
      const st = db.prepare(rq.stmt.sql);
      let rows = [], cols = [], changes = 0;
      if (/^\s*SELECT/i.test(rq.stmt.sql)) {
        rows = st.all(...args);
        cols = rows.length ? Object.keys(rows[0]) : [];
      } else changes = Number(st.run(...args).changes);
      results.push({ type: 'ok', response: { type: 'execute', result: { cols: cols.map(name => ({ name })), rows: rows.map(r => cols.map(c => toVal(r[c]))), affected_row_count: changes } } });
    } catch (e) { results.push({ type: 'error', error: { message: e.message } }); }
  }
  return { ok: true, status: 200, json: async () => ({ results }), text: async () => '' };
};

const handler = require('../api/db.js');
async function call(action, params = {}, deviceId = 'dev-test-1') {
  const req = { method: 'POST', headers: { 'x-app-key': 'test-key-123456', host: 'localhost' }, body: { action, deviceId, ...params }, socket: {} };
  let status = 0, out = null;
  const res = { statusCode: 0, setHeader() {}, end(s) { out = JSON.parse(s); status = this.statusCode; } };
  await handler(req, res);
  return { status, ...out };
}

let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } };

(async () => {
  console.log('API /api/db');

  await t('ping + skema (termasuk tabel master) dibuat otomatis', async () => {
    const r = await call('ping'); assert.equal(r.success, true);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name);
    ['schedules', 'reports', 'signatures', 'templates', 'master', 'locks', 'audit_log'].forEach(n => assert.ok(tables.includes(n), 'tabel ' + n));
  });

  await t('tanpa kunci akses → 401', async () => {
    const req = { method: 'POST', headers: { host: 'localhost' }, body: { action: 'ping' }, socket: {} };
    let st = 0; await handler(req, { setHeader() {}, end() { st = this.statusCode; } });
    assert.equal(st, 401);
  });

  await t('getMaster awal kosong', async () => {
    const r = await call('getMaster'); assert.deepEqual(r.master, { units: [], eqtypes: [] });
  });

  await t('saveMaster: dua perangkat menambah bersamaan → digabung (union), tidak saling menimpa', async () => {
    await call('saveMaster', { kind: 'units', data: [{ name: 'Unit 2', areas: ['Cold Storage'] }] }, 'dev-A');
    await call('saveMaster', { kind: 'units', data: [{ name: 'Unit 2', areas: ['Packing'] }, { name: 'Unit 3', areas: [] }] }, 'dev-B');
    const r = await call('getMaster');
    assert.deepEqual(r.master.units, [{ name: 'Unit 2', areas: ['Cold Storage', 'Packing'] }, { name: 'Unit 3', areas: [] }]);
  });

  await t('saveMaster eqtypes: key tidak valid ditolak diam-diam, yang valid tersimpan', async () => {
    await call('saveMaster', { kind: 'eqtypes', data: [{ key: 'cold_storage', label: 'Cold Storage' }, { key: 'BAD KEY!', label: 'x' }, { key: 'ok_1', label: '' }] });
    const r = await call('getMaster'); assert.deepEqual(r.master.eqtypes, [{ key: 'cold_storage', label: 'Cold Storage' }]);
  });

  await t('saveMaster jenis tidak dikenal → 400', async () => {
    const r = await call('saveMaster', { kind: 'hapus_semua', data: [] }); assert.equal(r.status, 400); assert.equal(r.rejected, true);
  });

  await t('saveTemplate cold_storage 10 item', async () => {
    const items = Array.from({ length: 10 }, (_, i) => 'Item ' + (i + 1));
    assert.equal((await call('saveTemplate', { equipmentType: 'cold_storage', items })).success, true);
    assert.equal((await call('getTemplates')).templates.cold_storage.length, 10);
  });

  await t('bulkUpsert: laporan beserta RCA tersimpan utuh dan terbaca kembali', async () => {
    const rca = { temuan: 'T', penyebab: 'Why 1 → Why 2', tindakan: 'Diganti', pencegahan: 'Jadwal' };
    const report = { id: 'PM-CS-TEST', tagNo: 'TAG-CS-01', date: '2026-06-09', equipmentType: 'cold_storage', equipmentName: 'Cold Storage Room 1',
      unit: 'Unit 2', area: 'Cold Storage', periode: 'Quarterly', week: 2, month: 6, teknisi: 'Aynur', approval: '', notes: 'n',
      ppe: { helm: true }, aktivitas: [{ no: 1, uraian: 'u', yes: false, no_checked: true, keterangan: 'k', rca }], spareParts: [],
      submittedAt: '2026-06-09T03:00:00.000Z', updatedAt: '2026-06-09T03:00:00.000Z' };
    const r = await call('bulkUpsert', { reports: [report] });
    assert.equal(r.count, 1); assert.equal(r.rejected, 0);
    const got = (await call('getReports')).reports.find(x => x.id === 'PM-CS-TEST');
    assert.equal(got.teknisi, 'Aynur');
    assert.deepEqual(JSON.parse(got.aktivitas)[0].rca, rca);
  });

  await t('bulkUpsert master + schedules; UPSERT ulang tidak menggandakan data', async () => {
    const sch = { id: 'SCH-CS-01', unit: 'Unit 2', area: 'Cold Storage', equipment: 'Cold Storage Room 1', tagNo: 'TAG-CS-01', equipmentType: 'cold_storage', periode: 'Quarterly', month: 6, week: 2, updatedAt: '2026-09-08T08:00:00.000Z' };
    for (let i = 0; i < 2; i++) {
      const r = await call('bulkUpsert', { schedules: [sch], master: { units: [{ name: 'Unit 2', areas: ['Cold Storage'] }] } });
      assert.equal(r.rejected, 0);
    }
    const s = (await call('getSchedules')).schedules.filter(x => x.id === 'SCH-CS-01');
    assert.equal(s.length, 1); assert.equal(s[0].periode, 'Quarterly');
    const units = (await call('getMaster')).master.units;
    assert.equal(units.filter(u => u.name === 'Unit 2').length, 1);
  });

  await t('payload seed Cold Storage nyata lolos bulkUpsert tanpa penolakan', async () => {
    // Jalankan seed melalui API palsu: sama dengan `--send`, tapi tanpa jaringan.
    const realFetch = global.fetch;
    const seedSrc = require('fs').readFileSync(require('path').join(__dirname, 'seed-coldstorage.js'), 'utf8');
    assert.ok(seedSrc.includes('bulkUpsert'));
    process.env.PM_URL = 'http://localhost';
    const posted = [];
    global.fetch = async (url, init) => {
      if (String(url).endsWith('/api/db') && !String(url).includes('fake.turso.io')) {
        const body = JSON.parse(init.body);
        const r = await call(body.action, body, body.deviceId);
        posted.push({ ...body, result: r });
        return { ok: r.status === 200, status: r.status, json: async () => r };
      }
      return realFetch(url, init);
    };
    process.env.PM_APP_KEY = 'test-key-123456';
    // jadwal lama (TAG-449, Annual) sudah ada sebelum seed → harus DIPERBARUI, bukan diduplikasi
    await call('saveSchedule', { schedule: { id: 'SCH-410', unit: 'Unit 2', area: 'Cold Storage', equipment: 'Cold Storage 1 Mesin 1', tagNo: 'TAG-449', equipmentType: 'compressor', periode: 'Annual', month: 7, week: 2, notes: 'catatan lama', updatedAt: '2026-07-14T03:20:30.648Z' } });
    const origLog = console.log; console.log = () => {};
    try { await require('./seed-coldstorage.js').main(true); } finally { console.log = origLog; }
    posted.forEach(p => { assert.equal(p.result.success, true); if (p.action === 'bulkUpsert') assert.equal(p.result.rejected, 0); });
    const reps = (await call('getReports')).reports.filter(r => r.id.startsWith('PM-CS-2026'));
    assert.equal(reps.length, 19);
    assert.ok(reps.every(r => r.teknisi === 'Aynur' && JSON.parse(r.aktivitas).length === 12 && JSON.parse(r.aktivitas).every(a => a.keterangan === '')));
    assert.deepEqual([...new Set(reps.map(r => r.equipmentName.slice(0, 14)))].sort(), ['Cold Storage 1', 'Cold Storage 2', 'Cold Storage 3', 'Cold Storage 4']);
    const rcaCount = reps.reduce((n, r) => n + JSON.parse(r.aktivitas).filter(a => a.no_checked && a.rca && a.rca.penyebab).length, 0);
    assert.equal(rcaCount, 7);
    assert.equal((await call('getTemplates')).templates.cold_storage.length, 12);
    const cs = (await call('getSchedules')).schedules.filter(s => /^Cold Storage [1-4] Mesin [1-5]$/.test(s.equipment) && s.equipmentType === 'cold_storage');
    assert.equal(cs.length, 19, 'harus 19 jadwal mesin, tanpa duplikat');
    const old = cs.find(s => s.tagNo === 'TAG-449');
    assert.equal(old.id, 'SCH-410'); assert.equal(old.periode, 'Quarterly'); assert.equal(old.notes, 'catatan lama'); assert.equal(old.month, 6);
    global.fetch = realFetch;
  });

  console.log(`\n${passed} tes lolos${process.exitCode ? ', ADA YANG GAGAL' : ''}`);
})();
