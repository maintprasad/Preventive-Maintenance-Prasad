// ════════════════════════════════════════════════════════
//  REPORT KETERCAPAIAN PM — EXPORT EXCEL (.xlsx, berwarna)
// ════════════════════════════════════════════════════════
async function exportCompletionReportExcel() {
  if (typeof ExcelJS === 'undefined') { toast('Library Excel belum siap, coba lagi sebentar', 'error'); return; }

  const unitF = document.getElementById('sch-filter-unit')?.value || '';
  const { units, statsByUnit, grandPlan, grandDone, grandPct } = _computeCompletionStats(unitF);
  if (!units.length) { toast('Tidak ada data untuk filter unit ini', 'warning'); return; }

  toast('📗 Menyiapkan file Excel...', 'info');
  const curYear = new Date().getFullYear();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PM Dashboard — PT Prasad Seeds Indonesia';
  wb.created = new Date();

  const ws = wb.addWorksheet('Ketercapaian PM ' + curYear, { views: [{ state: 'frozen', ySplit: 6, xSplit: 1 }] });

  const NAVY='FF1A3A6B', GREEN='FF2E7D32', GREEN_BG='FFE8F5E8', ORANGE='FFC97A00', ORANGE_BG='FFFFF4E0',
        RED='FFB03020', RED_BG='FFFDECEA', GRAY_BG='FFFAFAFA', WHITE='FFFFFFFF',
        PURPLE='FF7C3AED', PURPLE_BG='FFF3E8FD', BLUE='FF2B6CB8', BLUE_BG='FFE3EEFC';

  function fillForCategory(cat) { switch (cat) { case 'good': return GREEN_BG; case 'warning': return ORANGE_BG; case 'critical': return RED_BG; case 'ahead': return PURPLE_BG; case 'not-due': return BLUE_BG; default: return GRAY_BG; } }
  function fontColorForCategory(cat) { switch (cat) { case 'good': return GREEN; case 'warning': return ORANGE; case 'critical': return RED; case 'ahead': return PURPLE; case 'not-due': return BLUE; default: return 'FF999999'; } }
  function fillFor(pct) { if (pct === null) return GRAY_BG; if (pct >= 80) return GREEN_BG; if (pct >= 50) return ORANGE_BG; return RED_BG; }
  function fontColorFor(pct) { if (pct === null) return 'FF999999'; if (pct >= 80) return GREEN; if (pct >= 50) return ORANGE; return RED; }

  ws.mergeCells('A1:N1');
  ws.getCell('A1').value = `REPORT KETERCAPAIAN PREVENTIVE MAINTENANCE ${curYear}${unitF ? ' — ' + unitF : ''}`;
  ws.getCell('A1').font = { size: 14, bold: true, color: { argb: WHITE } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 26;

  ws.mergeCells('A2:N2');
  ws.getCell('A2').value = 'PT Prasad Seeds Indonesia — Departemen Maintenance | % dihitung dari Planning Month + Status Closed (bukan tanggal laporan)';
  ws.getCell('A2').font = { size: 9, italic: true, color: { argb: 'FF666666' } };

  ws.mergeCells('A3:N3');
  ws.getCell('A3').value = `Dicetak: ${new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})}`;
  ws.getCell('A3').font = { size: 8, color: { argb: 'FF999999' } };

  ws.getCell('A5').value = 'Total PM Dijadwalkan'; ws.getCell('B5').value = grandPlan;
  ws.getCell('D5').value = 'Sudah Selesai (Closed)'; ws.getCell('E5').value = grandDone;
  ws.getCell('G5').value = 'Belum Selesai (Outstanding)'; ws.getCell('H5').value = grandPlan - grandDone;
  ws.getCell('J5').value = 'Ketercapaian Keseluruhan'; ws.getCell('K5').value = grandPct / 100; ws.getCell('K5').numFmt = '0%';
  ['A5','D5','G5','J5'].forEach(c => { ws.getCell(c).font = { size: 9, bold: true, color: { argb: 'FF555555' } }; });
  ['B5','E5','H5','K5'].forEach(c => { ws.getCell(c).font = { size: 12, bold: true, color: { argb: NAVY } }; });

  const headerRowIdx = 7;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.getCell(1).value = 'Unit';
  MONTHS_ID.forEach((m, i) => { headerRow.getCell(2 + i).value = m; });
  headerRow.getCell(14).value = 'Rata-rata Setahun';
  headerRow.eachCell(cell => { cell.font = { bold: true, color: { argb: WHITE }, size: 9 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; });
  headerRow.height = 20;
  ws.getColumn(1).width = 22;
  for (let c = 2; c <= 13; c++) ws.getColumn(c).width = 11;
  ws.getColumn(14).width = 14;

  units.forEach((unit, idx) => {
    const st = statsByUnit[unit];
    const row = ws.getRow(headerRowIdx + 1 + idx);
    row.getCell(1).value = unit;
    row.getCell(1).font = { bold: true, color: { argb: NAVY }, size: 10 };

    st.monthly.forEach((m, mi) => {
      const cell = row.getCell(2 + mi);
      if (m.total === 0) { cell.value = '—'; cell.font = { color: { argb: 'FF999999' }, size: 9 }; }
      else if (m.category === 'not-due') {
        cell.value = 'Belum Waktunya';
        cell.font = { bold: true, color: { argb: fontColorForCategory('not-due') }, size: 8 };
        cell.note = `${m.completed} dari ${m.total} PM sudah selesai — bulan ini belum berjalan`;
      } else {
        cell.value = m.pct / 100; cell.numFmt = '0%';
        cell.font = { bold: true, color: { argb: fontColorForCategory(m.category) }, size: 10 };
        cell.note = m.category === 'ahead' ? `${m.completed} dari ${m.total} PM sudah selesai — dikerjakan lebih awal dari jadwal` : `${m.completed} dari ${m.total} PM sudah selesai`;
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillForCategory(m.category) } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top:{style:'thin',color:{argb:'FFDDDDDD'}}, bottom:{style:'thin',color:{argb:'FFDDDDDD'}}, left:{style:'thin',color:{argb:'FFDDDDDD'}}, right:{style:'thin',color:{argb:'FFDDDDDD'}} };
    });

    const yearCell = row.getCell(14);
    if (st.yearPct === null) yearCell.value = '—';
    else { yearCell.value = st.yearPct / 100; yearCell.numFmt = '0%'; }
    yearCell.font = { bold: true, size: 11, color: { argb: fontColorFor(st.yearPct) } };
    yearCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillFor(st.yearPct) } };
    yearCell.alignment = { horizontal: 'center', vertical: 'middle' };
    row.height = 18;
  });

  const ws2 = wb.addWorksheet('Detail Equipment');
  ws2.columns = [
    { header: 'Unit', key: 'unit', width: 18 }, { header: 'Area', key: 'area', width: 18 },
    { header: 'Equipment', key: 'equipment', width: 28 }, { header: 'Tag No', key: 'tag', width: 14 },
    { header: 'Bulan Planning', key: 'month', width: 16 }, { header: 'Status', key: 'status', width: 14 },
  ];
  ws2.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: WHITE }, size: 10 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; });
  const allSchedules = getData(STORE.SCHEDULES).filter(s => !unitF || s.unit === unitF);
  allSchedules.forEach(s => {
    const closed = hasReport(s);
    const row = ws2.addRow({ unit: s.unit||'—', area: s.area||'—', equipment: s.equipment||'—', tag: s.tagNo||'—', month: MONTHS_ID[(parseInt(s.month)||1)-1], status: closed?'Closed':'Outstanding' });
    const statusCell = row.getCell(6);
    statusCell.font = { bold: true, color: { argb: closed ? GREEN : RED } };
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: closed ? GREEN_BG : RED_BG } };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Report_Ketercapaian_PM_${curYear}${unitF ? '_' + unitF.replace(/\s+/g,'_') : ''}.xlsx`;
  a.click();
  toast('📗 File Excel berhasil didownload', 'success');
}
