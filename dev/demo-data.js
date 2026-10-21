// ════════════════════════════════════════════════════════
//  DATA CONTOH — HANYA UNTUK MENGUJI DI LOCALHOST
//
//  Dimuat otomatis bila aplikasi dibuka dari localhost/127.0.0.1 dengan  ?demo=1  (lihat js/20-main.js).
//  Mengisi localStorage browser ini dengan jadwal + laporan contoh, TANPA menyentuh database Turso/Vercel
//  (di localhost memang tidak ada backend). Folder dev/ tidak ikut ke Vercel (.vercelignore).
//
//    http://localhost/PM/?demo=1        → isi data contoh bila penyimpanan masih kosong
//    http://localhost/PM/?demo=reset    → ganti SEMUA data lokal dengan data contoh
// ════════════════════════════════════════════════════════
window.__PM_DEMO__ = function (reset) {
  const hasData = getData(STORE.SCHEDULES).length > 0 || getData(STORE.REPORTS).length > 0;
  if (hasData && !reset) return false;

  const Y = new Date().getFullYear();
  const iso = (m, d, y = Y) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const stamp = (m, d, h = 2) => `${iso(m, d)}T0${h}:00:00.000Z`;

  // [unit, area, nama, tag, tipe, periode, tanggal rencana tahun ini]
  const EQ = [
    ['Unit 1', 'CTP-1', 'Big Gravity', 'TAG-201', 'gravity', 'Quarterly', [iso(3, 9), iso(6, 8), iso(9, 7), iso(12, 7)]],
    ['Unit 1', 'CTP-1', 'Bucket Elevator 1', 'TAG-194', 'bucket_elevator', 'Monthly', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => iso(m, 12))],
    ['Unit 1', 'CTP-1', 'Screw Conveyor 3', 'TAG-210', 'screw_conveyor', 'Annual', [iso(10, 20)]],
    ['Unit 1', 'Prairie', 'Blower Prairie 1', 'TAG-301', 'blower', 'Semi-Annual', [iso(4, 14), iso(10, 13)]],
    ['Unit 1', 'Prairie', 'Dust Collector 2', 'TAG-305', 'dust_collector', 'Annual', [iso(11, 4)]],
    ['Unit 2', 'Peanut', 'Cleaner Peanut A', 'TAG-410', 'cleaner', 'Quarterly', [iso(2, 17), iso(5, 19), iso(8, 18), iso(11, 17)]],
    ['Unit 2', 'Peanut', 'Sheller 1', 'TAG-412', 'sheller', 'Annual', [iso(10, 15)]],
    ['Unit 2', 'Cold Storage', 'Cold Storage 1 Mesin 1', 'TAG-449', 'cold_storage', 'Quarterly', [iso(6, 8), iso(9, 7), iso(12, 7)]],
    ['Unit 2', 'Cold Storage', 'Cold Storage 1 Mesin 2', 'TAG-450', 'cold_storage', 'Quarterly', [iso(6, 9), iso(9, 8), iso(12, 8)]],
    ['Unit 2', 'Cold Storage', 'Cold Storage 2 Mesin 1', 'TAG-454', 'cold_storage', 'Quarterly', [iso(7, 13), iso(10, 12)]],
    ['Unit 2', 'Cold Storage', 'Cold Storage 3 Mesin 1', 'TAG-459', 'cold_storage', 'Quarterly', [iso(8, 10), iso(11, 9)]],
    ['Unit 2', 'Utility', 'Compressor Utility 1', 'TAG-520', 'compressor', 'Monthly', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => iso(m, 21))],
    ['Unit Malang', 'Gudang Malang', 'Blower Malang 1', 'TAG-M01', 'blower', 'Quarterly', [iso(3, 16), iso(6, 15), iso(9, 14), iso(12, 14)]],
    ['Unit Malang', 'Gudang Malang', 'Screw Conveyor Malang 1', 'TAG-M02', 'screw_conveyor', 'Annual', [iso(11, 9)]],
  ];
  const schedules = EQ.map(([unit, area, equipment, tagNo, equipmentType, periode, dates], i) => {
    const d = new Date(dates[0] + 'T00:00:00');
    return { id: 'DEMO-SCH-' + (i + 1), unit, area, equipment, tagNo, equipmentType, periode, month: d.getMonth() + 1, week: getWeekOfMonth(d),
      pic: ['Aynur', 'Firman', 'Lukman', 'Yusuf'][i % 4], lastDone: '', mp: 2, hari: 1, notes: '', startDate: iso(1, 1),
      plan: { [String(Y)]: dates }, createdAt: stamp(1, 1), updatedAt: stamp(1, 1) };
  });

  // Laporan contoh: beberapa equipment sudah di-PM, satu equipment sudah 3× (untuk melihat nomor PM ke-1/2/3)
  const aktivitas = (type, noItems = 0) => (PM_TEMPLATES[type] || []).map((u, i) => ({ no: i + 1, uraian: u, yes: i >= noItems, no_checked: i < noItems, keterangan: '' }));
  const rpt = (i, sch, date, extra = {}) => ({
    id: 'DEMO-PM-' + i, tagNo: sch.tagNo, date, equipmentType: sch.equipmentType, equipmentName: sch.equipment, unit: sch.unit, area: sch.area,
    periode: sch.periode, week: getWeekOfMonth(new Date(date + 'T00:00:00')), month: Number(date.slice(5, 7)), teknisi: sch.pic, approval: '', notes: '',
    ppe: { helm: true, sepatu: true }, aktivitas: aktivitas(sch.equipmentType), spareParts: [], photos: [], submittedAt: date + 'T03:00:00.000Z', updatedAt: date + 'T03:00:00.000Z', ...extra });
  const S = i => schedules[i];
  const reports = [
    rpt(1, S(0), iso(3, 10), { pmNo: 1 }), rpt(2, S(0), iso(6, 9), { pmNo: 2 }),
    rpt(3, S(1), iso(1, 13), { pmNo: 1 }), rpt(4, S(1), iso(2, 12), { pmNo: 2 }), rpt(5, S(1), iso(3, 13), { pmNo: 3 }),
    rpt(6, S(3), iso(4, 15), { pmNo: 1 }),
    rpt(7, S(5), iso(2, 18), { pmNo: 1 }), rpt(8, S(5), iso(5, 20), { pmNo: 2 }),
    rpt(9, S(7), iso(6, 8), { pmNo: 1 }), rpt(10, S(8), iso(6, 9), { pmNo: 1 }),
    rpt(11, S(9), iso(7, 13), { pmNo: 1, aktivitas: aktivitas('cold_storage', 1) }),
    rpt(12, S(12), iso(3, 17), { pmNo: 1, teknisi: 'Aynur' }),   // Unit Malang (format pengesahan 4 peran)
  ];
  reports.forEach(r => {   // contoh RCA pada satu anomali
    const a = r.aktivitas.find(x => x.no_checked);
    if (a) a.rca = { temuan: 'Contoh temuan', penyebab: 'Why 1 → Why 2 → akar penyebab contoh', tindakan: 'Contoh tindakan perbaikan', pencegahan: 'Contoh pencegahan' };
  });
  schedules.forEach(s => { const last = reports.filter(r => r.tagNo === s.tagNo).map(r => r.date).sort().pop(); if (last) s.lastDone = last; });

  setData(STORE.SCHEDULES, schedules);
  setData(STORE.REPORTS, reports);
  return true;
};
