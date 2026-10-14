#!/usr/bin/env node
/**
 * seed-coldstorage.js — Data awal PM Cold Storage (Unit 2 → Cold Storage).
 *
 * Isi:
 *   - master  : Unit 2 → area "Cold Storage", tipe equipment "Cold Storage"
 *   - template: 10 item checklist PM Cold Storage (diambil dari js/00-config.js)
 *   - schedule: 3 ruang Cold Storage, periode Quarterly (3 bulanan), start Juni / Juli / Agustus
 *   - laporan : PM oleh Aynur — Juni (Room 1), Juli (Room 2), Agustus (Room 3), September (Room 1,
 *               siklus 3 bulanan berikutnya dari Juni). Semua 10 checklist dikerjakan; item
 *               yang ditemukan anomali dilengkapi RCA (temuan, akar penyebab, tindakan, pencegahan).
 *
 * Pemakaian:
 *   node tools/seed-coldstorage.js            → DRY-RUN: validasi lewat normalizer server, tidak mengirim apa pun
 *   PM_URL=https://app-anda.vercel.app PM_APP_KEY=kunci node tools/seed-coldstorage.js --send
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
if (!Array.isArray(CHECKLIST) || CHECKLIST.length !== 10) throw new Error('Checklist cold_storage harus 10 item, dapat: ' + (CHECKLIST && CHECKLIST.length));

const UNIT = 'Unit 2';
const AREA = 'Cold Storage';
const TECH = 'Aynur';

// Sama dengan getWeekOfMonth() di js/01-utils.js
function weekOfMonth(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay() || 7;
  return Math.min(5, Math.ceil((d + firstDay - 1) / 7));
}

const ROOMS = {
  1: { id: 'SCH-CS-01', tag: 'TAG-CS-01', name: 'Cold Storage Room 1', month: 6, week: 2, lastDone: '2026-09-08' },
  2: { id: 'SCH-CS-02', tag: 'TAG-CS-02', name: 'Cold Storage Room 2', month: 7, week: 3, lastDone: '2026-07-14' },
  3: { id: 'SCH-CS-03', tag: 'TAG-CS-03', name: 'Cold Storage Room 3', month: 8, week: 3, lastDone: '2026-08-11' },
};

const schedules = Object.values(ROOMS).map(r => ({
  id: r.id, unit: UNIT, area: AREA, equipment: r.name, tagNo: r.tag, equipmentType: 'cold_storage',
  periode: 'Quarterly', month: r.month, week: r.week, pic: TECH, lastDone: r.lastDone, mp: 1, hari: 1,
  notes: 'PM Cold Storage 3 bulanan. Start siklus bulan ' + r.month + '.',
  startDate: '2026-06-01', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-09-08T08:00:00.000Z',
}));

// ── Hasil PM per ruang. Format item: [status, keterangan, rca?]  status: 'ok' | 'anomali' ──
const ok = (ket) => ['ok', ket];
const bad = (ket, rca) => ['anomali', ket, rca];

const REPORTS_SRC = [
  {
    room: 1, date: '2026-06-09', time: '03:10',
    notes: 'PM triwulan pertama Cold Storage Room 1 (start siklus Juni). Dua temuan sudah ditangani di tempat; PM berikutnya September 2026.',
    spare: [
      { uraian: 'Heater drain line evaporator', spesifikasi: 'Elemen heater drain sesuai tipe evaporator', jumlah: 1 },
      { uraian: 'Gasket pintu cold room', spesifikasi: 'Magnetic gasket, sisi bawah pintu', jumlah: 1 },
    ],
    items: [
      ok('Setpoint 8°C, aktual 8,2°C, RH 41%. Sensor sesuai termometer referensi (selisih 0,2°C)'),
      ok('Coil bersih, es tipis merata, 3 fan normal, getaran dan suara normal'),
      bad('Heater drain line tidak panas, air defrost menggenang di drain pan', {
        temuan: 'Saat uji defrost manual, air lelehan menggenang di drain pan dan sebagian membeku di drain line; heater drain line tidak menghasilkan panas.',
        penyebab: 'Why 1: air defrost tidak mengalir keluar → Why 2: drain line tersumbat es → Why 3: heater drain line tidak menyala → Why 4: elemen heater putus (tahanan tak terhingga saat diukur) → Why 5 (akar): elemen sudah melewati umur pakai dan pengukuran tahanan heater tidak ada dalam prosedur PM sebelumnya.',
        tindakan: 'Es di drain line dicairkan dengan heat gun, heater drain line diganti baru (1 pcs), uji defrost ulang: air mengalir normal ke floor drain.',
        pencegahan: 'Masukkan pengukuran tahanan heater drain & defrost ke uji defrost tiap PM; sediakan 1 pcs heater cadangan.',
      }),
      ok('Fin kondensor bersih, fan normal, tekanan kondensasi 13,5 bar'),
      ok('Oli di 1/2 sight glass, suction 2,1 bar, discharge 13,6 bar, arus R/S/T 15/15/14 A, crankcase heater aktif'),
      ok('Sight glass jernih, filter drier tidak ada beda suhu masuk/keluar, leak test busa sabun lolos'),
      bad('Gasket pintu sisi bawah sobek ±25 cm', {
        temuan: 'Gasket pintu sisi bawah sobek sepanjang ±25 cm; terlihat bunga es di sekitar kusen pintu dan udara luar masuk saat pintu ditutup.',
        penyebab: 'Why 1: ada celah pada pintu → Why 2: gasket sobek → Why 3: tergesek roda trolley/forklift saat keluar masuk → Why 4: sisi bawah pintu tidak punya pelindung → Why 5 (akar): desain area bawah pintu tidak terlindungi dan gasket menjadi getas akibat siklus suhu.',
        tindakan: 'Gasket sisi bawah diganti 1 set, bunga es dibersihkan, rapat pintu diuji dengan kertas — tidak ada celah.',
        pencegahan: 'Pasang kick plate/bumper pelindung di sisi bawah pintu; operator memeriksa gasket tiap bulan.',
      }),
      ok('Panel insulasi utuh, tidak ada kondensasi atau bagian menggelembung, lampu ruang normal'),
      ok('Terminal kencang, kontaktor dan overload normal, controller menampilkan setpoint 8°C'),
      ok('Alarm suhu tinggi aktif pada 12°C (diuji), HP/LP switch trip sesuai setting, release pintu dari dalam berfungsi, area bersih'),
    ],
  },
  {
    room: 2, date: '2026-07-14', time: '02:40',
    notes: 'PM triwulan pertama Cold Storage Room 2 (start siklus Juli). Dua temuan ditangani di tempat; PM berikutnya Oktober 2026.',
    spare: [
      { uraian: 'Skun kabel (pre-insulated lug)', spesifikasi: 'Sesuai ukuran kabel fan evaporator', jumlah: 4 },
    ],
    items: [
      ok('Setpoint 8°C, aktual 8,4°C, RH 39%. Sensor sesuai termometer referensi'),
      ok('Coil bersih, es tipis, 3 fan normal, getaran normal'),
      ok('Defrost berjalan sesuai jadwal, heater defrost dan drain berfungsi, drain pan kering'),
      bad('Fin kondensor tertutup debu, tekanan kondensasi 16,2 bar', {
        temuan: 'Fin kondensor tertutup debu dan serbuk tanaman ±60% permukaan; tekanan discharge 16,2 bar (normal 13–14 bar).',
        penyebab: 'Why 1: tekanan kondensasi tinggi → Why 2: pelepasan panas kondensor berkurang → Why 3: aliran udara terhambat debu pada fin → Why 4: kondensor dekat area bongkar muat berdebu dan tidak dibersihkan sejak PM sebelumnya → Why 5 (akar): tidak ada jadwal pembersihan kondensor berkala di antara PM triwulan.',
        tindakan: 'Unit dimatikan, fin dibersihkan dengan air bertekanan rendah dan sikat lembut, fin bengkok disisir; tekanan kondensasi turun ke 13,8 bar setelah dinyalakan kembali.',
        pencegahan: 'Tambah pembersihan kondensor bulanan oleh operator utilitas; pasang jaring debu kasar di sisi hisap kondensor.',
      }),
      ok('Oli di 1/2 sight glass, suction 2,0 bar, discharge 13,8 bar (setelah pembersihan), arus R/S/T 14/15/14 A'),
      ok('Sight glass jernih, filter drier normal, leak test busa sabun lolos'),
      ok('Gasket pintu utuh dan rapat, engsel dan door closer normal, heater frame pintu menyala'),
      ok('Panel insulasi utuh, tidak ada kondensasi, lampu ruang normal'),
      bad('Terminal kontaktor fan evaporator no. 2 longgar, ada bekas panas', {
        temuan: 'Terminal kabel kontaktor fan evaporator no. 2 longgar, isolasi kabel berubah warna (bekas panas).',
        penyebab: 'Why 1: terminal panas → Why 2: tahanan kontak tinggi → Why 3: baut terminal kendor → Why 4: getaran dan siklus panas-dingin berulang → Why 5 (akar): torsi baut terminal tidak diperiksa berkala sejak instalasi.',
        tindakan: 'Panel di-LOTO, terminal dikencangkan sesuai torsi, kabel yang berubah warna dipotong dan dipasang skun baru; cek suhu terminal dengan infrared 30 menit setelah beroperasi: normal.',
        pencegahan: 'Masukkan pengencangan terminal dan pengukuran suhu terminal (infrared) ke checklist panel setiap PM.',
      }),
      ok('Alarm suhu tinggi aktif pada 12°C (diuji), HP/LP switch trip sesuai setting, release pintu dari dalam berfungsi, area bersih'),
    ],
  },
  {
    room: 3, date: '2026-08-11', time: '03:25',
    notes: 'PM triwulan pertama Cold Storage Room 3 (start siklus Agustus). Suhu ruang sempat di atas setpoint karena kebocoran refrigeran kecil; sudah diperbaiki dan suhu kembali normal. PM berikutnya November 2026.',
    spare: [
      { uraian: 'Refrigeran', spesifikasi: 'Sesuai jenis pada nameplate unit', jumlah: 2 },
      { uraian: 'Flare nut dan pipa tembaga', spesifikasi: 'Sesuai diameter liquid line', jumlah: 1 },
      { uraian: 'Rubber clamp penyangga pipa', spesifikasi: 'Untuk pipa liquid line', jumlah: 3 },
    ],
    items: [
      bad('Setpoint 8°C, aktual 11,4°C, RH 55%', {
        temuan: 'Suhu aktual ruang 11,4°C pada setpoint 8°C (selisih +3,4°C), RH 55%.',
        penyebab: 'Why 1: suhu ruang tidak mencapai setpoint → Why 2: kapasitas pendinginan turun → Why 3: charge refrigeran kurang (sight glass bergelembung) → Why 4: ada kebocoran kecil pada flare fitting liquid line → Why 5 (akar): fitting mengendur akibat getaran dan leak test tidak dilakukan berkala.',
        tindakan: 'Penyebab ditangani lewat perbaikan kebocoran dan pengisian refrigeran (lihat item 6); suhu ruang kembali 8,3°C setelah ±3 jam.',
        pencegahan: 'Leak test dengan detector setiap PM; pasang penyangga pipa untuk meredam getaran; tren suhu data logger dicek mingguan.',
      }),
      ok('Coil bersih, es tipis, 3 fan normal, getaran normal'),
      ok('Defrost berjalan sesuai jadwal, heater defrost dan drain berfungsi, drain pan kering'),
      ok('Fin kondensor bersih, fan normal, tekanan kondensasi 13,2 bar'),
      ok('Oli di 1/2 sight glass, suction 1,9 bar (sebelum pengisian), discharge 13,3 bar, arus R/S/T 14/14/13 A'),
      bad('Sight glass bergelembung, kebocoran flare fitting liquid line dekat TXV', {
        temuan: 'Sight glass bergelembung (flash gas) dan terdeteksi kebocoran kecil di flare fitting liquid line dekat TXV.',
        penyebab: 'Why 1: flash gas di liquid line → Why 2: refrigeran kurang / subcooling rendah → Why 3: refrigeran bocor perlahan → Why 4: flare fitting tidak rapat (mur longgar, flare retak halus) → Why 5 (akar): getaran pipa tanpa penyangga memadai dan pengencangan fitting tidak diperiksa pada PM sebelumnya.',
        tindakan: 'Flare dibuat ulang dan dikencangkan sesuai torsi, uji tekan nitrogen 10 bar 30 menit tidak turun, vakum, lalu isi refrigeran sampai sight glass jernih; indikator moisture filter drier hijau (tidak perlu diganti).',
        pencegahan: 'Tambah clamp penyangga pipa; leak test tiap PM; catat jumlah refrigeran yang ditambahkan untuk memantau tren kebocoran.',
      }),
      ok('Gasket pintu utuh dan rapat, engsel dan door closer normal, heater frame pintu menyala'),
      ok('Panel insulasi utuh, tidak ada kondensasi, lampu ruang normal'),
      ok('Terminal kencang, kontaktor dan overload normal, controller menampilkan setpoint 8°C'),
      ok('Alarm suhu tinggi aktif pada 12°C (diuji), HP/LP switch trip sesuai setting, release pintu dari dalam berfungsi, area bersih'),
    ],
  },
  {
    room: 1, date: '2026-09-08', time: '03:00',
    notes: 'PM triwulan kedua Cold Storage Room 1 (3 bulan setelah Juni). Tindak lanjut temuan Juni: heater drain berfungsi, gasket pengganti baik. PM berikutnya Desember 2026.',
    spare: [
      { uraian: 'Bearing motor fan evaporator', spesifikasi: 'Sesuai tipe motor (bearing sisi belakang)', jumlah: 1 },
      { uraian: 'Grease suhu rendah', spesifikasi: 'Low temperature bearing grease', jumlah: 1 },
    ],
    items: [
      ok('Setpoint 8°C, aktual 8,1°C, RH 40%. Sensor sesuai termometer referensi'),
      bad('Fan evaporator no. 2 berbunyi kasar, getaran lebih tinggi dari fan lain', {
        temuan: 'Fan evaporator no. 2 berbunyi kasar dan getaran terasa lebih tinggi dari dua fan lain (bearing sisi belakang motor).',
        penyebab: 'Why 1: bunyi dan getaran tinggi → Why 2: bearing motor aus → Why 3: grease mengering/terdegradasi → Why 4: grease standar tidak cocok untuk suhu rendah dan bearing tidak pernah dilumasi ulang → Why 5 (akar): tidak ada jadwal relubrikasi bearing fan evaporator dan spesifikasi grease suhu rendah belum ditetapkan.',
        tindakan: 'Bearing motor fan no. 2 diganti dan diberi grease suhu rendah, baut dudukan dikencangkan; getaran normal dan arus 1,1 A sesuai nameplate.',
        pencegahan: 'Tetapkan grease suhu rendah sebagai standar, jadwal relubrikasi 6 bulan, dan cek bunyi/getaran fan tiap kunjungan.',
      }),
      ok('Heater drain (diganti Juni) berfungsi, tahanan 48 Ω, defrost dan drain lancar'),
      ok('Fin kondensor bersih, fan normal, tekanan kondensasi 13,4 bar'),
      ok('Oli di 1/2 sight glass, suction 2,1 bar, discharge 13,5 bar, arus R/S/T 15/15/14 A'),
      ok('Sight glass jernih, filter drier normal, leak test busa sabun lolos'),
      ok('Gasket pengganti (Juni) baik, kick plate terpasang, tidak ada celah; engsel dan heater frame normal'),
      ok('Panel insulasi utuh, tidak ada kondensasi, lampu ruang normal'),
      ok('Terminal kencang, kontaktor dan overload normal, controller menampilkan setpoint 8°C'),
      ok('Alarm suhu tinggi aktif pada 12°C (diuji), HP/LP switch trip sesuai setting, release pintu dari dalam berfungsi, area bersih'),
    ],
  },
];

const reports = REPORTS_SRC.map(r => {
  const room = ROOMS[r.room];
  const [, mm] = r.date.split('-');
  const ts = `${r.date}T${r.time}:00.000Z`;
  return {
    id: `PM-CS-${r.date.replace(/-/g, '').slice(0, 6)}-R${r.room}`,
    tagNo: room.tag, date: r.date, equipmentType: 'cold_storage', equipmentName: room.name,
    unit: UNIT, area: AREA, periode: 'Quarterly', week: weekOfMonth(r.date), month: Number(mm),
    teknisi: TECH, approval: '', notes: r.notes,
    ppe: { helm: true, masker: false, sarungTangan: true, earPlug: false, sepatu: true, harness: false, lain: true },
    aktivitas: r.items.map(([status, ket, rca], idx) => {
      const a = { no: idx + 1, uraian: CHECKLIST[idx], yes: status === 'ok', no_checked: status === 'anomali', keterangan: ket };
      if (rca) a.rca = rca;
      return a;
    }),
    spareParts: r.spare, submittedAt: ts, updatedAt: ts,
  };
});

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
    if (r.aktivitas.length !== 10) throw new Error(r.id + ': checklist harus 10 item');
    r.aktivitas.forEach(a => {
      if (a.yes === a.no_checked) throw new Error(`${r.id} item ${a.no}: harus tepat satu dari Yes/No`);
      if (a.no_checked && !(a.rca && a.rca.temuan && a.rca.penyebab && a.rca.tindakan && a.rca.pencegahan)) throw new Error(`${r.id} item ${a.no}: RCA belum lengkap`);
    });
  });
}

function summary() {
  console.log(`Master   : ${UNIT} → ${AREA}; tipe "Cold Storage" (cold_storage)`);
  console.log(`Template : cold_storage, ${CHECKLIST.length} item`);
  console.log(`Schedule : ${schedules.length} (Quarterly) — ` + schedules.map(s => `${s.equipment} bln ${s.month}`).join(', '));
  reports.forEach(r => {
    const an = r.aktivitas.filter(a => a.no_checked).length;
    console.log(`Laporan  : ${r.date}  ${r.equipmentName}  ${r.teknisi}  checklist ${r.aktivitas.length}/10, anomali+RCA ${an}  (${r.id})`);
  });
}

async function send() {
  const base = (process.env.PM_URL || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Set PM_URL, mis. PM_URL=https://app-anda.vercel.app');
  const post = async body => {
    const res = await fetch(base + '/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Key': process.env.PM_APP_KEY || '' },
      body: JSON.stringify({ deviceId: 'seed-coldstorage', ...body }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || !json.success) throw new Error(`${body.action} gagal: HTTP ${res.status} ${json ? json.message : ''}`);
    return json;
  };
  // Satu batch kecil per langkah supaya kegagalan mudah dilacak.
  for (const [label, body] of [
    ['master', { master: payload.master }],
    ['template', { templates: payload.templates }],
    ['schedule', { schedules: payload.schedules }],
    ['laporan', { reports: payload.reports }],
  ]) {
    const r = await post({ action: 'bulkUpsert', ...body });
    console.log(`✓ ${label}: ${r.count} diterima${r.rejected ? `, ${r.rejected} DITOLAK` : ''}`);
    if (r.rejected) throw new Error(`${label}: ada data ditolak validasi server`);
  }
  console.log('Selesai. Buka aplikasi → klik ↻ Sync untuk menarik data baru.');
}

async function main(sendIt) {
  validate();
  summary();
  if (!sendIt) { console.log('\nDRY-RUN: validasi lolos, tidak ada data dikirim. Tambahkan --send (dan PM_URL / PM_APP_KEY) untuk mengirim.'); return; }
  console.log('');
  await send();
}

module.exports = { payload, validate, main };

if (require.main === module) {
  main(process.argv.includes('--send')).catch(e => { console.error('ERROR:', e.message); process.exit(1); });
}
