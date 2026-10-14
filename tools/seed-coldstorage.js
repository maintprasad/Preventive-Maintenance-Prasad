#!/usr/bin/env node
/**
 * seed-coldstorage.js — Data awal PM Cold Storage (Unit 2 → Cold Storage).
 *
 * Penamaan mengikuti data yang sudah ada di database: "Cold Storage <n> Mesin <m>" dengan tag asli
 * (CS1: TAG-449..453, CS2: TAG-454..458, CS3: TAG-459..462, CS4: TAG-463..467 = 19 mesin).
 *
 * Isi:
 *   - master  : Unit 2 → area "Cold Storage", tipe equipment "Cold Storage"
 *   - template: 12 item checklist PM Cold Storage (diambil dari js/00-config.js)
 *   - schedule: jadwal mesin yang SUDAH ADA (dicocokkan lewat Tag No) DIPERBARUI jadi tipe Cold Storage,
 *               periode Quarterly (3 bulanan), bulan start: CS1 Juni, CS2 Juli, CS3 Agustus, CS4 September.
 *               Field lain (id, catatan, createdAt, dll.) dipertahankan. Mesin yang belum punya jadwal dibuat baru.
 *   - laporan : PM lengkap oleh Aynur — seluruh 19 mesin CS1 (Juni) s/d CS4 (September), 12 checklist
 *               per mesin. Item yang ditemukan anomali dilengkapi RCA (temuan, akar penyebab,
 *               tindakan, pencegahan).
 *
 * Pemakaian:
 *   node tools/seed-coldstorage.js            → DRY-RUN: validasi lewat normalizer server, tidak mengirim apa pun
 *   PM_URL=https://app-anda.vercel.app PM_APP_KEY=kunci node tools/seed-coldstorage.js --send
 *
 * PERHATIAN: --send menolak berjalan bila laporan seed (PM-CS-*) sudah ada di database, supaya tidak ada laporan ganda dan
 * data yang sudah diedit/ditandatangani di aplikasi tidak tertimpa. Gunakan --force hanya bila memang ingin menimpa.
 *
 * Aman diulang: server memakai UPSERT berdasarkan id (yang lebih baru menang), master digabung (union).
 * Data dikirim lewat /api/db (bulkUpsert) sehingga melewati validasi + audit_log yang sama dengan aplikasi.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// ── Checklist: satu sumber kebenaran = PM_TEMPLATES.cold_storage di js/00-config.js ──
const CHECKLIST = vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', '00-config.js'), 'utf8') + '\n;PM_TEMPLATES.cold_storage', {});
if (!Array.isArray(CHECKLIST) || CHECKLIST.length !== 12) throw new Error('Checklist cold_storage harus 12 item, dapat: ' + (CHECKLIST && CHECKLIST.length));

const UNIT = 'Unit 2';
const AREA = 'Cold Storage';
const TECH = 'Aynur';
const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Sama dengan getWeekOfMonth() di js/01-utils.js
function weekOfMonth(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay() || 7;
  return Math.min(5, Math.ceil((d + firstDay - 1) / 7));
}

// Tanggal PM per CS: mesin 1, 2, 3 dikerjakan berurutan dalam 3 hari kerja.
const CS = {
  1: { month: 6, firstTag: 449, days: ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'] },   // 5 mesin
  2: { month: 7, firstTag: 454, days: ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17'] },   // 5 mesin
  3: { month: 8, firstTag: 459, days: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'] },                 // 4 mesin
  4: { month: 9, firstTag: 463, days: ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'] },   // 5 mesin
};
const nameOf = (c, m) => `Cold Storage ${c} Mesin ${m}`;
const nextMonthOf = month => BULAN[((month + 2) % 12) + 1];   // +3 bulan

// ── Temuan (anomali) + RCA. Kunci "cs.mesin" → { itemKe: [keterangan, rca] } ──
const RCA = {
  heaterDrain: ['Heater drain line tidak panas, air defrost menggenang di drain pan', {
    temuan: 'Saat uji defrost manual, air lelehan menggenang di drain pan dan sebagian membeku di drain line; heater drain line tidak menghasilkan panas.',
    penyebab: 'Why 1: air defrost tidak mengalir keluar → Why 2: drain line tersumbat es → Why 3: heater drain line tidak menyala → Why 4: elemen heater putus (tahanan tak terhingga saat diukur) → Why 5 (akar): elemen sudah melewati umur pakai dan pengukuran tahanan heater tidak ada dalam prosedur PM sebelumnya.',
    tindakan: 'Es di drain line dicairkan dengan heat gun, heater drain line diganti baru (1 pcs), uji defrost ulang: air mengalir normal ke floor drain.',
    pencegahan: 'Masukkan pengukuran tahanan heater drain & defrost ke uji defrost tiap PM; sediakan 1 pcs heater cadangan.',
  }],
  gasket: ['Gasket pintu sisi bawah sobek ±25 cm', {
    temuan: 'Gasket pintu sisi bawah sobek sepanjang ±25 cm; terlihat bunga es di sekitar kusen pintu dan udara luar masuk saat pintu ditutup.',
    penyebab: 'Why 1: ada celah pada pintu → Why 2: gasket sobek → Why 3: tergesek roda trolley/forklift saat keluar masuk → Why 4: sisi bawah pintu tidak punya pelindung → Why 5 (akar): desain area bawah pintu tidak terlindungi dan gasket menjadi getas akibat siklus suhu.',
    tindakan: 'Gasket sisi bawah diganti 1 set, bunga es dibersihkan, rapat pintu diuji dengan kertas — tidak ada celah.',
    pencegahan: 'Pasang kick plate/bumper pelindung di sisi bawah pintu; operator memeriksa gasket tiap bulan.',
  }],
  kondensor: ['Fin kondensor tertutup debu, tekanan kondensasi 16,2 bar', {
    temuan: 'Fin kondensor tertutup debu dan serbuk tanaman ±60% permukaan; tekanan discharge 16,2 bar (normal 13–14 bar).',
    penyebab: 'Why 1: tekanan kondensasi tinggi → Why 2: pelepasan panas kondensor berkurang → Why 3: aliran udara terhambat debu pada fin → Why 4: kondensor dekat area bongkar muat berdebu dan tidak dibersihkan sejak PM sebelumnya → Why 5 (akar): tidak ada jadwal pembersihan kondensor berkala di antara PM triwulan.',
    tindakan: 'Unit dimatikan, fin dibersihkan dengan air bertekanan rendah dan sikat lembut, fin bengkok disisir; tekanan kondensasi turun ke 13,8 bar setelah dinyalakan kembali.',
    pencegahan: 'Tambah pembersihan kondensor bulanan oleh operator utilitas; pasang jaring debu kasar di sisi hisap kondensor.',
  }],
  terminal: ['Terminal kontaktor fan evaporator longgar, ada bekas panas', {
    temuan: 'Terminal kabel kontaktor fan evaporator longgar, isolasi kabel berubah warna (bekas panas).',
    penyebab: 'Why 1: terminal panas → Why 2: tahanan kontak tinggi → Why 3: baut terminal kendor → Why 4: getaran dan siklus panas-dingin berulang → Why 5 (akar): torsi baut terminal tidak diperiksa berkala sejak instalasi.',
    tindakan: 'Panel di-LOTO, terminal dikencangkan sesuai torsi, kabel yang berubah warna dipotong dan dipasang skun baru; cek suhu terminal dengan infrared 30 menit setelah beroperasi: normal.',
    pencegahan: 'Masukkan pengencangan terminal dan pengukuran suhu terminal (infrared) ke checklist panel setiap PM.',
  }],
  suhu: ['', {
    temuan: 'Suhu aktual ruang 15,4°C pada setpoint 12°C (selisih +3,4°C), RH 58% (di atas target < 40%).',
    penyebab: 'Why 1: suhu ruang tidak mencapai setpoint → Why 2: kapasitas pendinginan turun → Why 3: charge refrigeran kurang (sight glass bergelembung) → Why 4: ada kebocoran kecil pada flare fitting liquid line → Why 5 (akar): fitting mengendur akibat getaran dan leak test tidak dilakukan berkala.',
    tindakan: 'Penyebab ditangani lewat perbaikan kebocoran dan pengisian refrigeran (lihat item 6); suhu ruang kembali 12,3°C dan RH turun ke 39% setelah ±3 jam stabil.',
    pencegahan: 'Leak test dengan detector setiap PM; pasang penyangga pipa untuk meredam getaran; tren suhu data logger dicek mingguan.',
  }],
  refrigeran: ['Sight glass bergelembung, kebocoran flare fitting liquid line dekat TXV', {
    temuan: 'Sight glass bergelembung (flash gas) dan terdeteksi kebocoran kecil di flare fitting liquid line dekat TXV.',
    penyebab: 'Why 1: flash gas di liquid line → Why 2: refrigeran kurang / subcooling rendah → Why 3: refrigeran bocor perlahan → Why 4: flare fitting tidak rapat (mur longgar, flare retak halus) → Why 5 (akar): getaran pipa tanpa penyangga memadai dan pengencangan fitting tidak diperiksa pada PM sebelumnya.',
    tindakan: 'Flare dibuat ulang dan dikencangkan sesuai torsi, uji tekan nitrogen 10 bar 30 menit tidak turun, vakum, lalu isi refrigeran sampai sight glass jernih; indikator moisture filter drier hijau (tidak perlu diganti).',
    pencegahan: 'Tambah clamp penyangga pipa; leak test tiap PM; catat jumlah refrigeran yang ditambahkan untuk memantau tren kebocoran.',
  }],
  bearingFan: ['Fan evaporator berbunyi kasar, getaran lebih tinggi dari fan lain', {
    temuan: 'Salah satu fan evaporator berbunyi kasar dan getarannya lebih tinggi dari fan lain (bearing sisi belakang motor).',
    penyebab: 'Why 1: bunyi dan getaran tinggi → Why 2: bearing motor aus → Why 3: grease mengering/terdegradasi → Why 4: grease standar tidak cocok untuk suhu rendah dan bearing tidak pernah dilumasi ulang → Why 5 (akar): tidak ada jadwal relubrikasi bearing fan evaporator dan spesifikasi grease suhu rendah belum ditetapkan.',
    tindakan: 'Bearing motor fan diganti dan diberi grease suhu rendah, baut dudukan dikencangkan; getaran normal dan arus sesuai nameplate.',
    pencegahan: 'Tetapkan grease suhu rendah sebagai standar, jadwal relubrikasi 6 bulan, dan cek bunyi/getaran fan tiap kunjungan.',
  }],
};
// "cs.mesin": { nomorItem: kunci RCA }
const TEMUAN = {
  '1.1': { 3: 'heaterDrain', 8: 'gasket' },
  '2.2': { 4: 'kondensor', 10: 'terminal' },
  '3.3': { 1: 'suhu', 6: 'refrigeran' },
  // CS4 Mesin 1 (TAG-463): tanpa temuan/RCA — di aplikasi laporan ini sudah dibersihkan (semua YES) dan diberi nama "Mesin 5".
};
// Suku cadang yang terpakai pada mesin yang punya temuan
const SPARE = {
  '1.1': [
    { uraian: 'Heater drain line evaporator', spesifikasi: 'Elemen heater drain sesuai tipe evaporator', jumlah: 1 },
    { uraian: 'Gasket pintu cold room', spesifikasi: 'Magnetic gasket, sisi bawah pintu', jumlah: 1 },
  ],
  '2.2': [{ uraian: 'Skun kabel (pre-insulated lug)', spesifikasi: 'Sesuai ukuran kabel fan evaporator', jumlah: 4 }],
  '3.3': [
    { uraian: 'Refrigeran', spesifikasi: 'Sesuai jenis pada nameplate unit', jumlah: 2 },
    { uraian: 'Flare nut dan pipa tembaga', spesifikasi: 'Sesuai diameter liquid line', jumlah: 1 },
    { uraian: 'Rubber clamp penyangga pipa', spesifikasi: 'Untuk pipa liquid line', jumlah: 3 },
  ],
};

const machines = [];   // daftar mesin untuk pembentukan jadwal
const reports = [];
for (const c of Object.keys(CS).map(Number)) {
  const cs = CS[c];
  for (let m = 1; m <= cs.days.length; m++) {
    const date = cs.days[m - 1];
    const week = weekOfMonth(date);
    const key = `${c}.${m}`;
    const tag = `TAG-${cs.firstTag + m - 1}`;
    const temuan = TEMUAN[key] || {};
    const ts = `${date}T0${2 + m}:15:00.000Z`;

    machines.push({ c, m, tag, date, week, ts, month: cs.month });

    const aktivitas = CHECKLIST.map((uraian, i) => {
      const no = i + 1;
      const rcaKey = temuan[no];
      const a = { no, uraian, yes: !rcaKey, no_checked: !!rcaKey, keterangan: '' };   // kolom keterangan sengaja dikosongkan (permintaan); isi sendiri bila perlu
      if (rcaKey) a.rca = RCA[rcaKey][1];
      return a;
    });
    const nTemuan = Object.keys(temuan).length;

    reports.push({
      id: `PM-CS-${date.slice(0, 7).replace('-', '')}-CS${c}M${m}`,
      tagNo: tag, date, equipmentType: 'cold_storage', equipmentName: nameOf(c, m),
      unit: UNIT, area: AREA, periode: 'Quarterly', week, month: cs.month,
      teknisi: TECH, approval: '',
      notes: `PM triwulan ${nameOf(c, m)} (siklus start ${BULAN[cs.month]}); PM berikutnya ${nextMonthOf(cs.month)} 2026. ` +
        (nTemuan ? `${nTemuan} temuan ditangani di tempat (lihat RCA).` : 'Tidak ada temuan, semua checklist OK.'),
      ppe: { helm: true, masker: false, sarungTangan: true, earPlug: false, sepatu: true, harness: false, lain: true },
      aktivitas, spareParts: SPARE[key] || [], submittedAt: ts, updatedAt: new Date().toISOString(),
    });
  }
}

// Bangun daftar jadwal. existing = jadwal dari database (dicocokkan lewat Tag No) → diperbarui,
// field lain dipertahankan. Tanpa existing (dry-run/uji) semua dibuat baru.
function buildSchedules(existing = []) {
  const byTag = new Map(existing.filter(s => s && s.tagNo).map(s => [String(s.tagNo).trim().toLowerCase(), s]));
  const now = new Date().toISOString();
  return machines.map(({ c, m, tag, date, week, month }) => {
    const cur = byTag.get(tag.toLowerCase());
    return {
      ...(cur || {}),
      id: cur ? cur.id : `SCH-CS${c}-M${m}`,
      unit: UNIT, area: AREA, equipment: nameOf(c, m), tagNo: tag, equipmentType: 'cold_storage',
      periode: 'Quarterly', month, week,
      pic: (cur && cur.pic) || TECH, lastDone: date,
      notes: (cur && cur.notes) || `PM Cold Storage 3 bulanan. Siklus start ${BULAN[month]}, berikutnya ${nextMonthOf(month)}.`,
      startDate: (cur && cur.startDate) || '2026-06-01',
      createdAt: (cur && cur.createdAt) || '2026-06-01T00:00:00.000Z',
      updatedAt: now,
    };
  });
}
const schedules = buildSchedules();

const payload = {
  master: { units: [{ name: UNIT, areas: [AREA] }], eqtypes: [{ key: 'cold_storage', label: 'Cold Storage' }] },
  templates: { cold_storage: CHECKLIST },
  schedules,
  reports,
};

// ── Validasi lewat normalizer server (sama persis dengan yang dipakai /api/db) ──
function validate() {
  const { normSchedule, normReport, normTemplate, normMasterData } = require('../api/db.js')._internal;
  const ctx = { now: new Date().toISOString(), deviceId: 'seed-coldstorage' };
  schedules.forEach(s => normSchedule(s, ctx));
  reports.forEach(r => normReport(r, ctx));
  normTemplate('cold_storage', CHECKLIST, ctx);
  normMasterData('units', payload.master.units);
  normMasterData('eqtypes', payload.master.eqtypes);
  reports.forEach(r => {
    if (r.aktivitas.length !== CHECKLIST.length) throw new Error(r.id + ': checklist harus ' + CHECKLIST.length + ' item');
    r.aktivitas.forEach(a => {
      if (a.yes === a.no_checked) throw new Error(`${r.id} item ${a.no}: harus tepat satu dari Yes/No`);
      if (a.no_checked && !(a.rca && a.rca.temuan && a.rca.penyebab && a.rca.tindakan && a.rca.pencegahan)) throw new Error(`${r.id} item ${a.no}: RCA belum lengkap`);
    });
  });
}

function summary() {
  console.log(`Master   : ${UNIT} → ${AREA}; tipe "Cold Storage" (cold_storage)`);
  console.log(`Template : cold_storage, ${CHECKLIST.length} item`);
  console.log(`Schedule : ${schedules.length} mesin (Quarterly) — ` + [1, 2, 3, 4].map(c => `CS${c}: ${machines.filter(x => x.c === c).length} mesin bln ${CS[c].month}`).join(', '));
  reports.forEach(r => {
    const an = r.aktivitas.filter(a => a.no_checked).length;
    console.log(`Laporan  : ${r.date}  ${r.equipmentName}  ${r.teknisi}  checklist ${r.aktivitas.length}/${CHECKLIST.length}, anomali+RCA ${an}  (${r.id})`);
  });
}

// poster(body) → JSON hasil. Default: HTTP ke PM_URL/api/db. Bisa diganti (mis. uji in-process).
function httpPoster() {
  const base = (process.env.PM_URL || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Set PM_URL, mis. PM_URL=https://app-anda.vercel.app');
  return async body => {
    const res = await fetch(base + '/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Key': process.env.PM_APP_KEY || '' },
      body: JSON.stringify({ deviceId: 'seed-coldstorage', ...body }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || !json.success) throw new Error(`${body.action} gagal: HTTP ${res.status} ${json ? json.message : ''}`);
    return json;
  };
}

async function send(poster, force = false) {
  const post = poster || httpPoster();
  // Pengaman: jangan membuat laporan ganda / menimpa laporan yang sudah diedit & ditandatangani di aplikasi.
  const existingReports = (await post({ action: 'getReports' })).reports || [];
  const already = existingReports.filter(r => String(r.id).startsWith('PM-CS-'));
  if (already.length && !force) {
    throw new Error(`Database sudah berisi ${already.length} laporan seed Cold Storage (PM-CS-*). Dibatalkan agar tidak ada laporan ganda / data yang diedit tertimpa. Jalankan dengan --force bila memang ingin menimpa.`);
  }
  // Ambil jadwal yang sudah ada supaya mesin Cold Storage diperbarui, bukan diduplikasi.
  const cur = await post({ action: 'getSchedules' });
  const existing = (cur.schedules || []).filter(s => s.area === AREA || machines.some(x => x.tag === s.tagNo));
  const toSend = buildSchedules(existing);
  const updated = toSend.filter(s => existing.some(e => e.id === s.id)).length;
  console.log(`Jadwal ada di database: ${updated} diperbarui, ${toSend.length - updated} dibuat baru`);
  payload.schedules = toSend;
  // Satu batch kecil per langkah supaya kegagalan mudah dilacak.
  for (const [label, body] of [
    ['master', { master: payload.master }],
    ['template', { templates: payload.templates }],
    ['schedule', { schedules: toSend }],
    ['laporan', { reports: payload.reports }],
  ]) {
    const r = await post({ action: 'bulkUpsert', ...body });
    console.log(`✓ ${label}: ${r.count} diterima${r.rejected ? `, ${r.rejected} DITOLAK` : ''}`);
    if (r.rejected) throw new Error(`${label}: ada data ditolak validasi server`);
  }
  console.log('Selesai. Buka aplikasi → klik ↻ Sync untuk menarik data baru.');
}

async function main(sendIt, poster, force = false) {
  validate();
  summary();
  if (!sendIt) { console.log('\nDRY-RUN: validasi lolos, tidak ada data dikirim. Tambahkan --send (dan PM_URL / PM_APP_KEY) untuk mengirim.'); return; }
  console.log('');
  await send(poster, force);
}

module.exports = { payload, validate, main };

if (require.main === module) {
  main(process.argv.includes('--send'), undefined, process.argv.includes('--force')).catch(e => { console.error('ERROR:', e.message); process.exit(1); });
}
