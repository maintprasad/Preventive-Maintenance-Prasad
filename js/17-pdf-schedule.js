// ════════════════════════════════════════════════════════
//  SCHEDULE PDF — Plan vs Actual Annual View
// ════════════════════════════════════════════════════════
function openDownloadPDFModal() {
  const schedules = getData(STORE.SCHEDULES);
  if (!schedules.length) { toast('Belum ada schedule PM', 'warning'); return; }
  openOverlay('downloadPdfChoiceOverlay');
}

function _getApprovalNames(unitName) {
  const u = (unitName || '').toLowerCase();
  const isUnit2 = u.includes('2');
  return { unitLabel: isUnit2 ? 'Unit - 2' : 'Unit - 1', disusun: 'Iwan Prasetyo', diperiksa: 'Irawan Krisna Hadi', disetujui: isUnit2 ? 'Wida Laksono' : 'Willy Triyono' };
}

function _buildApprovalPageHTML(unitName, isPlanningOnly) {
  const info = _getApprovalNames(unitName);
  const modeLabel = isPlanningOnly ? 'Planning Schedule' : 'Plan vs Actual';
  const curYear = new Date().getFullYear();
  return `<div style="page-break-after:always;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:600px;padding:30px 40px">
    <div style="text-align:center;margin-bottom:50px">
      <div style="font-size:11pt;font-weight:700;color:#1a3a6b;letter-spacing:.06em">PT PRASAD SEEDS INDONESIA</div>
      <div style="font-size:9pt;color:#888;margin-top:2px">Departemen Maintenance</div>
      <div style="font-size:20pt;font-weight:900;color:#1a3a6b;margin-top:26px;line-height:1.3">Schedule Preventive Maintenance<br>${info.unitLabel}</div>
      <div style="display:inline-block;margin-top:10px;padding:5px 18px;background:#c0392b;color:#fff;font-size:12pt;font-weight:800;letter-spacing:.1em;border-radius:3px">FOR APPROVAL</div>
      <div style="font-size:9pt;color:#888;margin-top:10px">${modeLabel} — Tahun ${curYear}</div>
    </div>
    <table style="width:100%;max-width:640px;border-collapse:collapse"><tr>
      <td style="width:33.34%;text-align:center;border:1px solid #1a3a6b;padding:16px 10px 12px;vertical-align:top"><div style="font-size:9pt;font-weight:700;color:#1a3a6b;margin-bottom:64px">Disusun Oleh</div><div style="border-top:1px solid #999;margin:0 8px;padding-top:6px;font-size:9.5pt;font-weight:700">${info.disusun}</div></td>
      <td style="width:33.33%;text-align:center;border:1px solid #1a3a6b;padding:16px 10px 12px;vertical-align:top"><div style="font-size:9pt;font-weight:700;color:#1a3a6b;margin-bottom:64px">Diperiksa Oleh</div><div style="border-top:1px solid #999;margin:0 8px;padding-top:6px;font-size:9.5pt;font-weight:700">${info.diperiksa}</div></td>
      <td style="width:33.33%;text-align:center;border:1px solid #1a3a6b;padding:16px 10px 12px;vertical-align:top"><div style="font-size:9pt;font-weight:700;color:#1a3a6b;margin-bottom:64px">Disetujui Oleh</div><div style="border-top:1px solid #999;margin:0 8px;padding-top:6px;font-size:9.5pt;font-weight:700">${info.disetujui}</div></td>
    </tr></table>
  </div>`;
}

function downloadSchedulePDF(mode = 'both') {
  const isPlanningOnly = mode === 'planning';
  const schedules = getData(STORE.SCHEDULES);
  const reports   = getData(STORE.REPORTS);
  if (!schedules.length) { toast('Belum ada schedule PM', 'warning'); return; }

  const unitF    = document.getElementById('sch-filter-unit')?.value    || '';
  const areaF    = document.getElementById('sch-filter-area')?.value    || '';
  const periodeF = document.getElementById('sch-filter-periode')?.value || '';
  const statusF  = document.getElementById('sch-filter-status')?.value  || '';
  const searchQ  = (document.getElementById('sch-search')?.value        || '').toLowerCase();

  const filtered = schedules.filter(s => {
    if (unitF    && s.unit    !== unitF)    return false;
    if (areaF    && s.area    !== areaF)    return false;
    if (periodeF && s.periode !== periodeF) return false;
    if (statusF  && getScheduleStatus(s)   !== statusF) return false;
    if (searchQ  && ![(s.equipment||''),(s.unit||''),(s.area||''),(s.tagNo||'')].some(v=>v.toLowerCase().includes(searchQ))) return false;
    return true;
  });
  if (!filtered.length) { toast('Tidak ada schedule untuk filter ini', 'warning'); return; }

  const unitGroups = {};
  filtered.forEach(s => { const u = s.unit || '(Tanpa Unit)'; (unitGroups[u]=unitGroups[u]||[]).push(s); });

  const curYear  = new Date().getFullYear();
  const printDate = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function hasActual(s, m, w) {
    const sTag  = (s.tagNo||'').trim().toLowerCase();
    const sName = (s.equipment||'').trim().toLowerCase();
    const sUnit = (s.unit||'').trim().toLowerCase();
    return reports.some(r => {
      if (!r.date) return false;
      const rd = new Date(r.date);
      if (rd.getMonth() + 1 !== m) return false;
      const rWeek = parseInt(r.week) || getWeekOfMonth(rd);
      if (rWeek !== w) return false;
      if (sTag  && r.tagNo && r.tagNo.trim().toLowerCase() === sTag) return true;
      return (r.equipmentName||'').trim().toLowerCase() === sName && (r.unit||'').trim().toLowerCase() === sUnit;
    });
  }
  function hasPlan(s, m, w) {
    const sMonth = parseInt(s.month) || 0;
    const sWeek  = parseInt(s.week)  || 1;
    if (!sMonth) return false;
    if (s.periode === 'Monthly')     return sMonth === m && sWeek === w;
    if (s.periode === 'Weekly')      return sWeek === w;
    if (s.periode === 'Daily')       return true;
    if (s.periode === 'Quarterly')   return ((m - sMonth) % 3 === 0) && m >= sMonth && sWeek === w;
    if (s.periode === 'Semi-Annual') return ((m - sMonth) % 6 === 0) && m >= sMonth && sWeek === w;
    if (s.periode === 'Annual')      return sMonth === m && sWeek === w;
    return sMonth === m && sWeek === w;
  }

  const weeksPerMonth = Array(12).fill(4);
  filtered.forEach(s => { const sMonth=parseInt(s.month), sWeek=parseInt(s.week); if (sMonth>=1 && sMonth<=12 && sWeek>weeksPerMonth[sMonth-1]) weeksPerMonth[sMonth-1]=sWeek; });
  reports.forEach(r => { if (!r.date) return; const rd=new Date(r.date); const m=rd.getMonth(); const w=parseInt(r.week)||getWeekOfMonth(rd); if (w>weeksPerMonth[m]) weeksPerMonth[m]=w; });
  weeksPerMonth.forEach((w,i) => { if (w < 4) weeksPerMonth[i] = 4; });

  let monthHeaderRow = '<tr>';
  monthHeaderRow += '<th rowspan="2" style="min-width:26px;text-align:center;background:#1a3a6b;color:#fff;border:1px solid #2a4a7b;font-size:7pt;padding:4px 2px">Item</th>';
  monthHeaderRow += '<th rowspan="2" style="min-width:140px;text-align:left;background:#1a3a6b;color:#fff;border:1px solid #2a4a7b;font-size:7pt;padding:4px 6px">Machine / Operation Utilities</th>';
  monthHeaderRow += '<th rowspan="2" style="min-width:48px;text-align:center;background:#1a3a6b;color:#fff;border:1px solid #2a4a7b;font-size:7pt;padding:4px 2px">Activity</th>';
  for (let m = 0; m < 12; m++) monthHeaderRow += `<th colspan="${weeksPerMonth[m]}" style="text-align:center;background:#1a3a6b;color:#fff;border:1px solid #2a4a7b;font-size:7pt;padding:3px 2px">${MONTH_SHORT[m]}</th>`;
  monthHeaderRow += '</tr>';

  let weekHeaderRow = '<tr>';
  for (let m = 0; m < 12; m++) for (let w = 1; w <= weeksPerMonth[m]; w++) weekHeaderRow += `<th style="text-align:center;background:#1e4a80;color:rgba(255,255,255,.8);border:1px solid #2a4a7b;font-size:6.5pt;padding:2px 1px;min-width:18px">${w}</th>`;
  weekHeaderRow += '</tr>';

  function buildCountRow(items) {
    let row = '<tr style="background:#f0f4f0"><td style="text-align:center;border:1px solid #ccc;font-size:7pt;color:#888"></td><td style="padding:3px 6px;border:1px solid #ccc;font-size:7pt;font-weight:700;color:#1a3a6b"></td><td style="text-align:center;border:1px solid #ccc;font-size:7pt"></td>';
    for (let m = 0; m < 12; m++) for (let w = 1; w <= weeksPerMonth[m]; w++) {
      const planCnt = items.filter(s => hasPlan(s, m+1, w)).length;
      const actCnt  = isPlanningOnly ? 0 : items.filter(s => hasActual(s, m+1, w)).length;
      const display = planCnt > 0 ? planCnt : (actCnt > 0 ? actCnt : '');
      row += `<td style="text-align:center;border:1px solid #ccc;font-size:6.5pt;font-weight:700;color:#1a3a6b">${display}</td>`;
    }
    return row + '</tr>';
  }

  let allTablesHTML = '';
  Object.entries(unitGroups).forEach(([unitName, items]) => {
    items.sort((a,b) => { const areaA=a.area||'', areaB=b.area||''; if (areaA!==areaB) return areaA.localeCompare(areaB); return (a.equipment||'').localeCompare(b.equipment||''); });
    const areaGroupsPDF = {};
    items.forEach(s => { const areaKey = s.area || '(Tanpa Area)'; (areaGroupsPDF[areaKey]=areaGroupsPDF[areaKey]||[]).push(s); });
    const totalWeekColsPDF = weeksPerMonth.reduce((a,b)=>a+b, 0);
    const totalColsPDF = 3 + totalWeekColsPDF;

    let dataRows = '';
    Object.entries(areaGroupsPDF).forEach(([areaName, areaItems]) => {
      dataRows += `<tr><td colspan="${totalColsPDF}" style="background:#dce8dc;color:#1a3a6b;font-weight:800;font-size:8pt;padding:5px 8px;border:1px solid #b8ccb8">📍 ${areaName} <span style="font-weight:400;color:#4a6a4a;font-size:7pt">(${areaItems.length} equipment)</span></td></tr>`;
      areaItems.forEach((s, idx) => {
        const rowBg = idx % 2 === 0 ? '#fff' : '#f7faf7';
        const stStatus = getScheduleStatus(s);
        const isOverdueRow = !isPlanningOnly && stStatus === 'overdue';
        const nameStyle = isOverdueRow ? 'padding:3px 6px;border:1px solid #ddd;font-size:7.5pt;color:#c0392b;font-weight:700' : 'padding:3px 6px;border:1px solid #ddd;font-size:7.5pt';
        const overdueTag = isOverdueRow ? ' <span style="font-size:6pt;color:#c0392b;font-weight:700;white-space:nowrap">⚠ OVERDUE</span>' : '';
        let row = `<tr style="background:${rowBg}">`;
        row += `<td style="text-align:center;border:1px solid #ddd;font-size:7.5pt;color:#555">${idx+1}</td>`;
        row += `<td style="${nameStyle}">${s.equipment||'—'}${overdueTag}</td>`;
        row += `<td style="text-align:center;border:1px solid #ddd;font-size:7.5pt;font-weight:700">A</td>`;
        for (let m = 0; m < 12; m++) for (let w = 1; w <= weeksPerMonth[m]; w++) {
          const isPlan = hasPlan(s, m+1, w);
          const isActual = isPlanningOnly ? false : hasActual(s, m+1, w);
          let cellContent = '', cellStyle = 'text-align:center;border:1px solid #ddd;font-size:7pt;font-weight:700;';
          if (isPlan && isActual) { cellContent='P+A'; cellStyle+='background:#2e7d32;color:#fff;'; }
          else if (isPlan) { cellContent='P'; cellStyle+='background:#f9c800;color:#000;'; }
          else if (isActual) { cellContent='A'; cellStyle+='background:#4a9e3f;color:#fff;'; }
          else cellStyle+='background:#fff;color:#ddd;';
          row += `<td style="${cellStyle}">${cellContent}</td>`;
        }
        row += '</tr>';
        dataRows += row;
      });
    });

    const countRow = buildCountRow(items);
    allTablesHTML += _buildApprovalPageHTML(unitName, isPlanningOnly);
    allTablesHTML += `
      <div style="page-break-before:always;margin-bottom:24px">
        <div style="background:#1a3a6b;color:#fff;padding:6px 10px;font-size:9pt;font-weight:700;border-radius:3px 3px 0 0;display:flex;align-items:center;justify-content:space-between">
          <span>🏭 ${unitName}</span><span style="font-size:8pt;font-weight:400;color:rgba(255,255,255,.7)">${items.length} equipment</span>
        </div>
        <table style="border-collapse:collapse;width:100%"><thead>${monthHeaderRow}${weekHeaderRow}</thead><tbody>${dataRows}${countRow}</tbody></table>
      </div>`;
  });

  const legendHTML = isPlanningOnly ? `
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:12px;padding:6px 10px;background:#f4f7f4;border:1px solid #ccc;border-radius:4px;font-size:7.5pt">
      <strong>Keterangan:</strong><span><span style="display:inline-block;width:18px;height:14px;background:#f9c800;border:1px solid #ccc;vertical-align:middle;margin-right:3px"></span>P = Plan (Jadwal PM yang ditetapkan)</span>
      <span style="color:#888">ℹ Dokumen ini hanya menampilkan jadwal, belum menunjukkan status pengerjaan aktual di lapangan.</span></div>` : `
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:12px;padding:6px 10px;background:#f4f7f4;border:1px solid #ccc;border-radius:4px;font-size:7.5pt">
      <strong>Keterangan:</strong><span><span style="display:inline-block;width:18px;height:14px;background:#f9c800;border:1px solid #ccc;vertical-align:middle;margin-right:3px"></span>P = Plan (Terjadwal)</span>
      <span><span style="display:inline-block;width:18px;height:14px;background:#4a9e3f;border:1px solid #ccc;vertical-align:middle;margin-right:3px"></span>A = Actual (Laporan Masuk)</span>
      <span><span style="display:inline-block;width:18px;height:14px;background:#2e7d32;border:1px solid #ccc;vertical-align:middle;margin-right:3px"></span>P+A = Plan & Actual (sama minggu)</span></div>`;

  const filterParts = [];
  if (unitF)    filterParts.push(unitF);
  if (areaF)    filterParts.push(areaF);
  if (periodeF) filterParts.push(periodeF);
  if (statusF)  filterParts.push(statusF === 'done' ? 'On Track' : statusF === 'overdue' ? 'Overdue' : 'Upcoming');
  if (searchQ)  filterParts.push(`"${searchQ}"`);
  const unitLabel = filterParts.length ? filterParts.join(' · ') : 'All Equipment';
  const modeLabel = isPlanningOnly ? 'Planning Only' : 'Plan vs Actual';

  const fullHTML = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>PM ${modeLabel} ${curYear} — ${unitLabel}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}@page{size:A3 landscape;margin:8mm 10mm}body{font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#111;background:#fff}table{border-collapse:collapse;width:100%}tr{page-break-inside:avoid;break-inside:avoid}thead{display:table-header-group}img{max-width:100%}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}}</style>
</head><body>
<div class="no-print" style="padding:10px;background:#f4f7f4;border-bottom:2px solid #1a3a6b;display:flex;align-items:center;gap:12px">
  <button onclick="window.print()" style="background:#1a3a6b;color:#fff;border:none;padding:8px 18px;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">🖨 PRINT / SAVE AS PDF</button>
  <span style="font-size:11px;color:#666">💡 Pilih Save as PDF di dialog print · Gunakan ukuran kertas A3 Landscape</span>
  <button onclick="window.close()" style="margin-left:auto;background:none;border:1px solid #ccc;padding:6px 14px;border-radius:5px;cursor:pointer;font-size:11px">✕ Tutup</button>
</div>
<div style="display:flex;align-items:center;gap:14px;padding:10px 0 8px;border-bottom:2px solid #1a3a6b;margin-bottom:10px">
  <div style="flex-shrink:0"><img src="${document.querySelector('.brand img')?.src || ''}" style="height:40px;width:auto;object-fit:contain"></div>
  <div style="flex:1"><div style="font-size:13pt;font-weight:900;color:#1a3a6b">Preventive Maintenance ${curYear} — ${modeLabel}</div>
  <div style="font-size:9pt;font-weight:600;color:#3a5a3a;margin-top:1px">${isPlanningOnly ? 'Jadwal Tahunan (Planning Only) untuk' : 'Annual Preventive Maintenance plan for'}: ${unitLabel}</div></div>
  <div style="text-align:right;font-size:7.5pt;color:#888"><div>Dicetak: ${printDate}</div><div style="margin-top:2px">Form: F-MTC-PLN-01 | Rev: 00</div></div>
</div>
${legendHTML}
${allTablesHTML}
<div style="margin-top:10px;padding:4px 0;font-size:7pt;color:#aaa;border-top:1px solid #eee;text-align:center">PM Plan ${curYear} — PT Prasad Seeds Indonesia | Dicetak: ${printDate} | Total Equipment: ${filtered.length}</div>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(fullHTML);
  w.document.close();
  setTimeout(() => { w.focus(); }, 300);
}

// ════════════════════════════════════════════════════════
//  REPORT KETERCAPAIAN PM PER UNIT — helper bersama (PDF & Excel)
// ════════════════════════════════════════════════════════
function _monthCategory(total, pct, isFuture) {
  if (total === 0) return 'no-plan';
  if (isFuture) return (pct === 100) ? 'ahead' : 'not-due';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'warning';
  return 'critical';
}
const _CAT_STYLE = {
  'no-plan':  { color:'#bbb',    bg:'#fafafa', label:'Tidak Ada Jadwal' },
  'ahead':    { color:'#7c3aed', bg:'#f3e8fd', label:'Selesai Lebih Awal' },
  'not-due':  { color:'#2b6cb8', bg:'#e3eefc', label:'Belum Waktunya' },
  'good':     { color:'#2e7d32', bg:'#e8f5e8', label:'Tercapai Baik' },
  'warning':  { color:'#c97a00', bg:'#fff4e0', label:'Perlu Perhatian' },
  'critical': { color:'#b03020', bg:'#fdecea', label:'Kritis — Tertinggal' },
};
function _pctColor(pct) { if (pct === null) return _CAT_STYLE['no-plan'].color; if (pct >= 80) return _CAT_STYLE['good'].color; if (pct >= 50) return _CAT_STYLE['warning'].color; return _CAT_STYLE['critical'].color; }
function _pctBg(pct) { if (pct === null) return _CAT_STYLE['no-plan'].bg; if (pct >= 80) return _CAT_STYLE['good'].bg; if (pct >= 50) return _CAT_STYLE['warning'].bg; return _CAT_STYLE['critical'].bg; }
function _pctLabel(pct) { if (pct === null) return _CAT_STYLE['no-plan'].label; if (pct >= 80) return _CAT_STYLE['good'].label; if (pct >= 50) return _CAT_STYLE['warning'].label; return _CAT_STYLE['critical'].label; }

function _buildUnitAreaBreakdownHTML(unitFilter) {
  const schedules = getData(STORE.SCHEDULES);
  const scope = unitFilter ? schedules.filter(s => s.unit === unitFilter) : schedules;
  if (!scope.length) return '';
  const units = [...new Set(scope.map(s => s.unit || '(Tanpa Unit)'))].sort();
  let html = '';
  units.forEach((unit, uIdx) => {
    const unitSchedules = scope.filter(s => (s.unit || '(Tanpa Unit)') === unit);
    const areas = [...new Set(unitSchedules.map(s => s.area || '(Tanpa Area)'))].sort();
    const unitClosed = unitSchedules.filter(s => hasReport(s)).length;
    const unitPct = unitSchedules.length ? Math.round(unitClosed / unitSchedules.length * 100) : 0;
    if (uIdx > 0) html += `<div style="page-break-before:always"></div>`;
    html += `<div class="section-title">🏭 Detail per Area — ${unit}<span style="float:right;font-size:8pt;font-weight:700;color:${_pctColor(unitPct)}">${unitClosed}/${unitSchedules.length} PM Selesai (${unitPct}%)</span></div>`;
    areas.forEach(area => {
      const items = unitSchedules.filter(s => (s.area || '(Tanpa Area)') === area);
      const closedCount = items.filter(s => hasReport(s)).length;
      const pct = items.length ? Math.round(closedCount / items.length * 100) : 0;
      const sorted = [...items].sort((a,b) => (hasReport(a)?1:0) - (hasReport(b)?1:0));
      const rows = sorted.map((s, i) => {
        const closed = hasReport(s);
        const statusLabel = closed ? '✅ Sudah PM' : '⏳ Belum PM';
        const statusColor = closed ? '#2e7d32' : '#b03020';
        const statusBg = closed ? '#e8f5e8' : '#fdecea';
        return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fbf9'}">
          <td style="text-align:left;border:1px solid #eee;font-size:7.5pt;color:#888;padding:3px 6px">${i+1}</td>
          <td style="border:1px solid #eee;font-size:8pt;padding:3px 6px;${closed?'':'font-weight:700;color:#b03020'}">${s.equipment || '—'}</td>
          <td style="border:1px solid #eee;font-size:7.5pt;padding:3px 6px;color:#666">${s.tagNo || '—'}</td>
          <td style="text-align:center;border:1px solid #eee;font-size:7.5pt;padding:3px 6px">${MONTHS_ID[(parseInt(s.month)||1)-1]}</td>
          <td style="text-align:center;border:1px solid #eee;padding:3px 6px"><span style="font-size:7.5pt;font-weight:700;color:${statusColor};background:${statusBg};padding:2px 9px;border-radius:10px;white-space:nowrap">${statusLabel}</span></td>
        </tr>`;
      }).join('');
      html += `<div style="margin-bottom:12px;border:1px solid #ddd;border-radius:6px;overflow:hidden;page-break-inside:avoid">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:${_pctBg(pct)};border-bottom:1px solid #ddd">
          <div style="font-weight:700;font-size:9pt;color:#1a3a6b">📍 ${area}</div><div style="font-size:8.5pt;font-weight:800;color:${_pctColor(pct)}">${pct}% &nbsp;(${closedCount}/${items.length} selesai)</div>
        </div>
        <table style="margin-bottom:0"><thead><tr>
          <th style="text-align:left;width:32px;background:#eef3ee;color:#1a3a6b;font-size:7pt;padding:4px 6px">No</th>
          <th style="text-align:left;background:#eef3ee;color:#1a3a6b;font-size:7pt;padding:4px 6px">Equipment</th>
          <th style="text-align:left;width:85px;background:#eef3ee;color:#1a3a6b;font-size:7pt;padding:4px 6px">Tag No</th>
          <th style="text-align:center;width:80px;background:#eef3ee;color:#1a3a6b;font-size:7pt;padding:4px 6px">Bulan Plan</th>
          <th style="text-align:center;width:95px;background:#eef3ee;color:#1a3a6b;font-size:7pt;padding:4px 6px">Status</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    });
  });
  return html;
}

function _computeCompletionStats(unitFilter) {
  const schedules = getData(STORE.SCHEDULES);
  const scope = unitFilter ? schedules.filter(s => s.unit === unitFilter) : schedules;
  const units = [...new Set(scope.map(s => s.unit || '(Tanpa Unit)'))].sort();
  const curMonth = new Date().getMonth() + 1;
  const statsByUnit = {};
  let grandPlan = 0, grandDone = 0;
  units.forEach(unit => {
    const monthly = [];
    let planYear = 0, doneYear = 0;
    for (let m = 1; m <= 12; m++) {
      const plan = scope.filter(s => (s.unit || '(Tanpa Unit)') === unit && (parseInt(s.month) || 0) === m);
      const done = plan.filter(s => hasReport(s));
      const total = plan.length, completed = done.length;
      const pct = total ? Math.round(completed / total * 100) : null;
      const isFuture = m > curMonth;
      const category = _monthCategory(total, pct, isFuture);
      monthly.push({ total, completed, pct, isFuture, category });
      planYear += total; doneYear += completed;
    }
    const yearPct = planYear ? Math.round(doneYear / planYear * 100) : null;
    statsByUnit[unit] = { monthly, planYear, doneYear, yearPct };
    grandPlan += planYear; grandDone += doneYear;
  });
  const grandPct = grandPlan ? Math.round(grandDone / grandPlan * 100) : 0;
  return { units, statsByUnit, grandPlan, grandDone, grandPct, curMonth };
}

function _buildCompletionChartImage(units, statsByUnit) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1100; canvas.height = 440;
    canvas.style.position = 'fixed'; canvas.style.left = '-9999px';
    document.body.appendChild(canvas);
    const colors = ['#2b6cb8','#4a9e3f','#e67e22','#7c3aed','#c0392b','#2a7a5a'];
    const datasets = units.map((u, i) => ({ label: u, data: statsByUnit[u].monthly.map(m => m.pct), borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length], spanGaps: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 5, borderWidth: 2.5 }));
    const chart = new Chart(canvas, {
      type: 'line',
      data: { labels: MONTHS_ID.map(m => m.slice(0,3)), datasets },
      options: { responsive:false, animation:false,
        plugins: { legend:{position:'bottom',labels:{font:{size:13},color:'#333',padding:14}}, title:{display:true,text:'Tren % Ketercapaian PM per Unit — Sepanjang Tahun',font:{size:16,weight:'bold'},color:'#1a3a6b',padding:{bottom:14}} },
        scales: { y:{min:0,max:100,ticks:{callback:v=>v+'%',font:{size:11}},grid:{color:'#eee'},title:{display:true,text:'% Ketercapaian'}}, x:{grid:{display:false},ticks:{font:{size:11}}} }
      }
    });
    setTimeout(() => { const img = canvas.toDataURL('image/png', 1.0); chart.destroy(); canvas.remove(); resolve(img); }, 350);
  });
}

async function downloadCompletionReportPDF() {
  const schedules = getData(STORE.SCHEDULES);
  if (!schedules.length) { toast('Belum ada schedule PM', 'warning'); return; }
  const unitF = document.getElementById('sch-filter-unit')?.value || '';
  const { units, statsByUnit, grandPlan, grandDone, grandPct } = _computeCompletionStats(unitF);
  if (!units.length) { toast('Tidak ada data untuk filter unit ini', 'warning'); return; }

  toast('📊 Menyiapkan grafik & laporan...', 'info');
  const chartImg = await _buildCompletionChartImage(units, statsByUnit);
  const printDate = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  const curYear = new Date().getFullYear();

  const unitCardsHTML = units.map(u => {
    const st = statsByUnit[u]; const pct = st.yearPct;
    return `<div style="border:1px solid #ccc;border-left:5px solid ${_pctColor(pct)};border-radius:6px;padding:12px 16px;background:#fff">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:10.5pt;font-weight:800;color:#1a3a6b">🏭 ${u}</div>
        <div style="font-size:7.5pt;font-weight:700;padding:2px 8px;border-radius:10px;background:${_pctBg(pct)};color:${_pctColor(pct)}">${_pctLabel(pct)}</div>
      </div>
      <div style="font-size:24pt;font-weight:900;color:${_pctColor(pct)};line-height:1">${pct===null?'—':pct+'%'}</div>
      <div style="font-size:8pt;color:#666;margin-top:4px">✅ <strong>${st.doneYear}</strong> dari <strong>${st.planYear}</strong> jadwal PM sudah selesai (Closed)</div>
      <div style="font-size:8pt;color:${st.planYear-st.doneYear>0?'#b03020':'#888'};margin-top:2px">${st.planYear-st.doneYear>0 ? `⚠ ${st.planYear-st.doneYear} PM masih Outstanding (belum dikerjakan)` : '🎉 Semua PM sudah selesai'}</div>
    </div>`;
  }).join('');

  let headerRow = '<tr><th style="text-align:left;min-width:160px">Unit</th>';
  MONTHS_ID.forEach(m => { headerRow += `<th style="text-align:center;min-width:56px">${m.slice(0,3)}</th>`; });
  headerRow += '<th style="text-align:center;min-width:75px;background:#132c52">Rata-rata<br>Setahun</th></tr>';

  let bodyRows = '';
  units.forEach((unit, idx) => {
    const rowBg = idx % 2 === 0 ? '#fff' : '#f7faf7';
    const st = statsByUnit[unit];
    const cells = st.monthly.map(m => {
      const style = _CAT_STYLE[m.category];
      if (m.total === 0) return `<td style="text-align:center;border:1px solid #ddd;background:${style.bg};color:${style.color};font-size:8pt;padding:4px 2px">—</td>`;
      const label = (m.category === 'not-due') ? `<span style="font-size:7pt">Belum<br>Waktunya</span>` : `${m.pct}%`;
      const sub = `<div style="font-size:6pt;color:#888;font-weight:400">${m.completed}/${m.total} PM</div>`;
      return `<td style="text-align:center;border:1px solid #ddd;background:${style.bg};color:${style.color};font-weight:700;font-size:8pt;padding:4px 2px">${label}${sub}</td>`;
    }).join('');
    bodyRows += `<tr style="background:${rowBg}"><td style="padding:5px 8px;border:1px solid #ddd;font-weight:700;font-size:8.5pt;color:#1a3a6b">🏭 ${unit}</td>${cells}
      <td style="text-align:center;border:1px solid #ddd;background:${_pctBg(st.yearPct)};color:${_pctColor(st.yearPct)};font-weight:800;font-size:9pt">${st.yearPct === null ? '—' : st.yearPct + '%'}<div style="font-size:6.5pt;color:#888;font-weight:400">${st.doneYear}/${st.planYear} PM</div></td></tr>`;
  });

  const areaBreakdownHTML = _buildUnitAreaBreakdownHTML(unitF);

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Report Ketercapaian PM — ${curYear}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}@page{size:A4 landscape;margin:10mm 12mm}body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#111}table{width:100%;border-collapse:collapse;margin-bottom:14px}th{background:#1a3a6b;color:#fff;padding:6px 4px;font-size:7.5pt;letter-spacing:.03em}
.hdr-bar{background:#1a3a6b;color:#fff;padding:10px 14px;border-radius:4px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between}.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}.kpi{border:1px solid #ccc;border-radius:5px;padding:10px 14px;text-align:center}.kpi-val{font-size:20pt;font-weight:900;color:#1a3a6b}.kpi-lbl{font-size:7.5pt;color:#777;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
.section-title{font-size:9.5pt;font-weight:800;color:#1a3a6b;margin:14px 0 8px;padding-bottom:4px;border-bottom:2px solid #1a3a6b;text-transform:uppercase;letter-spacing:.03em}.unit-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:6px}
.legend-bar{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:10px;padding:7px 12px;background:#f4f7f4;border:1px solid #ccc;border-radius:4px;font-size:7.5pt}.footer{margin-top:10px;padding:5px 0;font-size:7pt;color:#aaa;border-top:1px solid #eee;text-align:center}
@media print{.no-print{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.unit-card-grid,table{page-break-inside:avoid}}</style></head><body>
<div class="no-print" style="padding:10px;background:#f4f7f4;border-bottom:2px solid #1a3a6b;display:flex;align-items:center;gap:12px;margin-bottom:14px">
  <button onclick="window.print()" style="background:#1a3a6b;color:#fff;border:none;padding:8px 18px;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">🖨 PRINT / SAVE AS PDF</button>
  <span style="font-size:11px;color:#666">💡 % dihitung dari Planning Month + Status Closed (bukan tanggal laporan)</span>
  <button onclick="window.close()" style="margin-left:auto;background:none;border:1px solid #ccc;padding:6px 14px;border-radius:5px;cursor:pointer;font-size:11px">✕ Tutup</button>
</div>
<div class="hdr-bar"><div><div style="font-size:7pt;color:rgba(255,255,255,.6);letter-spacing:.08em">PT PRASAD SEEDS INDONESIA — DEPARTEMEN MAINTENANCE</div>
<div style="font-size:13pt;font-weight:900">REPORT KETERCAPAIAN PREVENTIVE MAINTENANCE ${curYear}</div>
<div style="font-size:8pt;color:rgba(255,255,255,.75);margin-top:2px">Seberapa banyak jadwal PM yang sudah benar-benar selesai (Closed), per unit per bulan${unitF?' — '+unitF:''}</div></div>
<div style="text-align:right;font-size:7.5pt;color:rgba(255,255,255,.6)"><div>Dicetak: ${printDate}</div><div style="margin-top:2px">Form: F-MTC-KPI-01 | Rev: 00</div></div></div>
<div class="section-title">Ringkasan Keseluruhan</div>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${grandPlan}</div><div class="kpi-lbl">Total PM Dijadwalkan</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#2e7d32">${grandDone}</div><div class="kpi-lbl">Sudah Selesai (Closed)</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${grandPlan-grandDone>0?'#b03020':'#2e7d32'}">${grandPlan-grandDone}</div><div class="kpi-lbl">Belum Selesai (Outstanding)</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${_pctColor(grandPct)}">${grandPct}%</div><div class="kpi-lbl">Ketercapaian Keseluruhan</div></div>
</div>
<div class="section-title">Ketercapaian per Unit</div><div class="unit-card-grid">${unitCardsHTML}</div>
<div class="section-title">Grafik Tren Bulanan</div>
<div style="text-align:center;margin-bottom:10px"><img src="${chartImg}" style="max-width:100%;height:auto;border:1px solid #eee;border-radius:6px"></div>
<div class="section-title">Tabel Detail per Bulan</div>
<div class="legend-bar"><strong>Keterangan warna:</strong>
  <span><span style="display:inline-block;width:16px;height:12px;background:#e8f5e8;border:1px solid #2e7d32;vertical-align:middle;margin-right:3px"></span>🟩 ≥80% — Tercapai Baik (bulan sudah berjalan/lewat)</span>
  <span><span style="display:inline-block;width:16px;height:12px;background:#fff4e0;border:1px solid #c97a00;vertical-align:middle;margin-right:3px"></span>🟨 50–79% — Perlu Perhatian</span>
  <span><span style="display:inline-block;width:16px;height:12px;background:#fdecea;border:1px solid #b03020;vertical-align:middle;margin-right:3px"></span>🟥 &lt;50% — Kritis, Tertinggal</span>
  <span><span style="display:inline-block;width:16px;height:12px;background:#f3e8fd;border:1px solid #7c3aed;vertical-align:middle;margin-right:3px"></span>🟪 Selesai Lebih Awal</span>
  <span><span style="display:inline-block;width:16px;height:12px;background:#e3eefc;border:1px solid #2b6cb8;vertical-align:middle;margin-right:3px"></span>🔵 Belum Waktunya</span>
  <span><span style="display:inline-block;width:16px;height:12px;background:#fafafa;border:1px solid #bbb;vertical-align:middle;margin-right:3px"></span>⬜ Tidak ada PM dijadwalkan</span>
</div>
<table><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>
<div style="font-size:7.5pt;color:#666;margin-bottom:8px"><strong>Cara membaca laporan ini:</strong> Angka % menunjukkan persentase PM yang dijadwalkan pada bulan tersebut (Planning Month) yang statusnya sudah <em>Closed</em>. Bulan yang sudah berjalan/lewat dinilai merah/kuning/hijau; bulan yang masih di depan ditandai "Belum Waktunya" (biru) atau "Selesai Lebih Awal" (ungu) bila semua PM-nya sudah dikerjakan mendahului jadwal.</div>
<div style="page-break-before:always"></div>
${areaBreakdownHTML}
<div class="footer">Report Ketercapaian PM — PT Prasad Seeds Indonesia | Tahun ${curYear} | Dicetak: ${printDate}</div>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 500);
}
