// ════════════════════════════════════════════════════════
//  PDF — laporan tunggal & override untuk membawa tanda tangan
// ════════════════════════════════════════════════════════
let _currentPDFData = null;

function printIframePDF() {
  const iframe = document.getElementById('pdf-preview-iframe');
  if (!iframe?.contentWindow) { toast('Preview belum siap','warning'); return; }
  try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
  catch(e) {
    if (_currentPDFData) {
      const w = window.open('','_blank');
      w.document.write(buildPMFullHTML(JSON.parse(JSON.stringify(_currentPDFData))));
      w.document.close();
      setTimeout(()=>{w.focus();w.print();},350);
    }
  }
}

function downloadPMPDFById(id) {
  const r = getData(STORE.REPORTS).find(x=>x.id===id);
  if (!r) { toast('Laporan tidak ditemukan','error'); return; }
  const sig = getLocalSigs()[id] || null;
  openPDFOverlay(r, sig);
}

function openPDFOverlay(data, sig = null) {
  _currentPDFData = data;
  document.getElementById('pdf-preview-iframe').srcdoc = buildPMFullHTML(JSON.parse(JSON.stringify(data)), sig);
  openOverlay('pdfOverlay');
}

function buildPMBodyContent(data, sig = null) {
  if (typeof data.ppe === 'string') { try{data.ppe=JSON.parse(data.ppe);}catch(e){data.ppe={};} }
  if (typeof data.aktivitas === 'string') { try{data.aktivitas=JSON.parse(data.aktivitas);}catch(e){data.aktivitas=[];} }
  if (typeof data.spareParts === 'string') { try{data.spareParts=JSON.parse(data.spareParts);}catch(e){data.spareParts=[];} }
  const ppeMap = {helm:'Helm',masker:'Masker',sarungTangan:'Sarung Tangan',earPlug:'Ear Plug',sepatu:'Sepatu Safety',harness:'Harness',lain:'PPE Lain'};
  const ppeList = Object.entries(data.ppe||{}).filter(([,v])=>v).map(([k])=>ppeMap[k]||k).join(', ') || '—';
  const aktivitasRows = (data.aktivitas||[]).map((a,i)=>`
    <tr style="background:${i%2===0?'#f9f9f9':'#fff'}">
      <td style="text-align:center;padding:5px 8px;border:1px solid #ddd;font-size:9pt">${a.no||i+1}</td>
      <td style="padding:5px 8px;border:1px solid #ddd;font-size:9pt">${a.uraian||''}</td>
      <td style="text-align:center;padding:5px 8px;border:1px solid #ddd;font-size:11pt;color:${a.yes?'#155724':'#777'}">${a.yes?'✅':'☐'}</td>
      <td style="text-align:center;padding:5px 8px;border:1px solid #ddd;font-size:11pt;color:${a.no_checked?'#721c24':'#777'}">${a.no_checked?'❌':'☐'}</td>
      <td style="padding:5px 8px;border:1px solid #ddd;font-size:9pt">${a.keterangan||''}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:10px;color:#999;font-size:9pt">—</td></tr>';
  const spRows = (Array.isArray(data.spareParts)?data.spareParts:[]).filter(sp=>sp&&sp.uraian).map((sp,i)=>`
    <tr style="background:${i%2===0?'#f9f9f9':'#fff'}">
      <td style="text-align:center;padding:5px 8px;border:1px solid #ddd;font-size:9pt">${i+1}</td>
      <td style="padding:5px 8px;border:1px solid #ddd;font-size:9pt">${sp.uraian}</td>
      <td style="padding:5px 8px;border:1px solid #ddd;font-size:9pt">${sp.spesifikasi||'—'}</td>
      <td style="text-align:center;padding:5px 8px;border:1px solid #ddd;font-size:9pt">${sp.jumlah||0}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:10px;color:#999;font-size:9pt">Tidak ada</td></tr>';
  const formattedDate = data.date ? new Date(data.date).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}) : '—';
  const printDate = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
  const typeLabel = EQ_LABELS[data.equipmentType] || data.equipmentType || '—';
  const spvSigCell = sig?.spvSig ? `<img src="${sig.spvSig}" style="height:58px;max-width:170px;display:block;margin:4px auto">` : '<div style="height:58px;border-bottom:1px solid #bbb;margin:4px 14px"></div>';
  const ldSigCell  = sig?.leaderSig ? `<img src="${sig.leaderSig}" style="height:58px;max-width:170px;display:block;margin:4px auto">` : '<div style="height:58px;border-bottom:1px solid #bbb;margin:4px 14px"></div>';
  const spvDate = sig?.spvAt ? new Date(sig.spvAt).toLocaleDateString('id-ID') : '_______________';
  const ldDate  = sig?.leaderAt ? new Date(sig.leaderAt).toLocaleDateString('id-ID') : '_______________';
  return `
<table style="border:2px solid #1a3a6b;margin-bottom:0"><tr>
  <td style="width:68px;padding:8px 10px;border-right:2px solid #1a3a6b;vertical-align:middle"><div style="width:52px;height:38px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#aaa">LOGO</div></td>
  <td style="text-align:center;padding:8px;border-right:2px solid #1a3a6b;vertical-align:middle"><div style="font-size:13pt;font-weight:900;color:#1a3a6b">PREVENTIVE MAINTENANCE REPORT</div><div style="font-size:8pt;color:#666;margin-top:2px">PT PRASAD SEEDS INDONESIA</div></td>
  <td style="width:136px;padding:8px 10px;font-size:7.5pt;color:#666;text-align:right;vertical-align:top"><div>Form: F-MTC-PM-01</div><div>Rev: 00</div><div style="margin-top:4px">Dicetak: ${printDate}</div></td>
</tr></table>
<table style="border:2px solid #1a3a6b;border-top:none">
  <tr><td class="il">Tag No</td><td class="iv">${data.tagNo||'—'}</td><td class="il">Tanggal</td><td class="iv">${formattedDate}</td></tr>
  <tr><td class="il">Unit</td><td class="iv">${data.unit||'—'}</td><td class="il">Area</td><td class="iv">${data.area||'—'}</td></tr>
  <tr><td class="il">Equipment Type</td><td class="iv">${typeLabel}</td><td class="il">Equipment Name</td><td class="iv">${data.equipmentName||'—'}</td></tr>
  <tr><td class="il">Periode</td><td class="iv">${data.periode||'—'}</td><td class="il">Minggu Ke</td><td class="iv">${data.week||'—'}</td></tr>
</table>
<div class="st">P.P.E — Peralatan Keselamatan Kerja</div>
<table style="border:2px solid #1a3a6b;border-top:none"><tr><td style="padding:7px 10px;font-size:9pt">${ppeList}</td></tr></table>
<div class="st">Aktivitas Checklist</div>
<table style="border:2px solid #1a3a6b;border-top:none">
  <thead><tr><th class="th" style="width:30px">NO</th><th class="th" style="text-align:left">URAIAN AKTIVITAS</th><th class="th" style="width:46px">YES</th><th class="th" style="width:46px">NO</th><th class="th" style="width:160px;text-align:left">KETERANGAN</th></tr></thead>
  <tbody>${aktivitasRows}</tbody>
</table>
<div class="st">Spare Parts / Material Yang Digunakan</div>
<table style="border:2px solid #1a3a6b;border-top:none">
  <thead><tr><th class="th" style="width:30px">NO</th><th class="th" style="text-align:left">URAIAN</th><th class="th" style="text-align:left">SPESIFIKASI</th><th class="th" style="width:60px">JUMLAH</th></tr></thead>
  <tbody>${spRows}</tbody>
</table>
<div class="st">Catatan Tambahan</div>
<table style="border:2px solid #1a3a6b;border-top:none"><tr><td style="padding:7px 10px;min-height:34px;font-size:9pt">${data.notes||'—'}</td></tr></table>
<div class="st">Pengesahan</div>
<table style="border:2px solid #1a3a6b;border-top:none"><tr>
  <td class="sc">
    <div style="font-weight:bold;font-size:8.5pt">Dibuat Oleh<br><span style="font-weight:normal;font-size:8pt">Teknisi Pelaksana</span></div>
    <div style="height:58px;border-bottom:1px solid #bbb;margin:4px 14px;display:flex;align-items:flex-end;justify-content:center;font-size:9pt;padding-bottom:2px">${data.teknisi||''}</div>
    <div style="font-size:8pt;font-weight:600;margin-top:6px">${data.teknisi||'_______________'}</div>
    <div style="font-size:7.5pt;color:#666;margin-top:3px">Tgl: ${formattedDate}</div>
  </td>
  <td class="sc">
    <div style="font-weight:bold;font-size:8.5pt">Disetujui Oleh<br><span style="font-weight:normal;font-size:8pt">Leader Unit</span></div>
    ${spvSigCell}
    <div style="font-size:8pt;font-weight:600;margin-top:6px">${sig?.spvName||data.approval||'_______________'}</div>
    <div style="font-size:7.5pt;color:#666;margin-top:3px">Tgl: ${spvDate}</div>
  </td>
  <td class="sc">
    <div style="font-weight:bold;font-size:8.5pt">Mengetahui<br><span style="font-weight:normal;font-size:8pt">Owner Area</span></div>
    ${ldSigCell}
    <div style="font-size:8pt;font-weight:600;margin-top:6px">${sig?.leaderName||'_______________'}</div>
    <div style="font-size:7.5pt;color:#666;margin-top:3px">Tgl: ${ldDate}</div>
  </td>
</tr></table>
<div class="ft">Report ID: ${data.id||'—'} | PM Dashboard — PT Prasad Seeds Indonesia | Dicetak: ${printDate}</div>`;
}

function buildPMFullHTML(data, sig = null) {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>PM Report — ${data.tagNo||''}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}@page{size:A4 portrait;margin:12mm 14mm}body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111;background:#fff}table{width:100%;border-collapse:collapse}.il{background:#eef3ee;padding:5px 10px;font-weight:600;font-size:8.5pt;width:110px;color:#1a3a6b;border:1px solid #ccc}.iv{padding:5px 10px;font-size:9pt;border:1px solid #ccc}.st{background:#1a3a6b;color:#fff;padding:6px 12px;font-size:9pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-top:10px}.th{background:#1a3a6b;color:rgba(255,255,255,.85);padding:6px 8px;font-size:8pt;letter-spacing:.04em;text-transform:uppercase;border:1px solid #2a4a7b}.sc{padding:10px 12px;border:1px solid #ccc;text-align:center;width:33.3%}.ft{margin-top:8px;padding:4px 0;font-size:7.5pt;color:#999;border-top:1px solid #eee;text-align:center}</style>
</head><body>
${buildPMBodyContent(data, sig)}
</body></html>`;
}

function printAllPMReports() {
  const reports  = getData(STORE.REPORTS);
  const search   = (document.getElementById('rep-search')?.value||'').toLowerCase();
  const unitF    = document.getElementById('rep-filter-unit')?.value||'';
  const areaF    = document.getElementById('rep-filter-area')?.value||'';
  const typeF    = document.getElementById('rep-filter-type')?.value||'';
  const periodeF = document.getElementById('rep-filter-periode')?.value||'';

  let filtered = reports.filter(r => {
    if (search && ![(r.tagNo||''),(r.equipmentName||''),(r.teknisi||''),(r.area||''),(r.unit||'')].some(v=>v.toLowerCase().includes(search))) return false;
    if (unitF    && r.unit          !== unitF)    return false;
    if (areaF    && r.area          !== areaF)    return false;
    if (typeF    && r.equipmentType !== typeF)    return false;
    if (periodeF && r.periode       !== periodeF) return false;
    return true;
  });
  if (!filtered.length) { toast('Tidak ada laporan untuk dicetak (cek filter)','warning'); return; }
  filtered = filtered.slice().sort((a,b) => new Date(b.date) - new Date(a.date));

  const sigs = getLocalSigs();
  const printDate = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  const pages = filtered.map((r, i) => {
    const sig = sigs[r.id] || null;
    const breakStyle = i < filtered.length - 1 ? 'page-break-after:always;' : '';
    return `<div style="${breakStyle}">${buildPMBodyContent(JSON.parse(JSON.stringify(r)), sig)}</div>`;
  }).join('\n');

  const fullHTML = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>Semua Laporan PM — ${printDate}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}@page{size:A4 portrait;margin:12mm 14mm}body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111;background:#fff}table{width:100%;border-collapse:collapse}.il{background:#eef3ee;padding:5px 10px;font-weight:600;font-size:8.5pt;width:110px;color:#1a3a6b;border:1px solid #ccc}.iv{padding:5px 10px;font-size:9pt;border:1px solid #ccc}.st{background:#1a3a6b;color:#fff;padding:6px 12px;font-size:9pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-top:10px}.th{background:#1a3a6b;color:rgba(255,255,255,.85);padding:6px 8px;font-size:8pt;letter-spacing:.04em;text-transform:uppercase;border:1px solid #2a4a7b}.sc{padding:10px 12px;border:1px solid #ccc;text-align:center;width:33.3%}.ft{margin-top:8px;padding:4px 0;font-size:7.5pt;color:#999;border-top:1px solid #eee;text-align:center}
@media print{.no-print{display:none !important}}
</style>
</head><body>
<div class="no-print" style="padding:10px;background:#f4f7f4;border-bottom:2px solid #1a3a6b;display:flex;align-items:center;gap:12px;margin-bottom:14px">
  <button onclick="window.print()" style="background:#1a3a6b;color:#fff;border:none;padding:8px 18px;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">🖨 PRINT / SAVE AS PDF (${filtered.length} dokumen)</button>
  <span style="font-size:11px;color:#666">💡 Setiap laporan otomatis dimulai di halaman baru</span>
  <button onclick="window.close()" style="margin-left:auto;background:none;border:1px solid #ccc;padding:6px 14px;border-radius:5px;cursor:pointer;font-size:11px">✕ Tutup</button>
</div>
${pages}
</body></html>`;

  const w = window.open('','_blank');
  w.document.write(fullHTML);
  w.document.close();
  toast(`🖨 Menyiapkan ${filtered.length} dokumen PM untuk print sekaligus...`, 'success');
  setTimeout(()=>{ w.focus(); w.print(); }, 600);
}

function printResume() {
  const fYear    = parseInt(document.getElementById('res-filter-year')?.value)||0;
  const fMonth   = parseInt(document.getElementById('res-filter-month')?.value)||0;
  const fUnit    = document.getElementById('res-filter-unit')?.value||'';
  const fPeriode = document.getElementById('res-filter-periode')?.value||'';
  const fType    = document.getElementById('res-filter-type')?.value||'';

  let reports = getData(STORE.REPORTS).filter(r => {
    if (!r.date) return false;
    const d = new Date(r.date);
    if (fYear  && d.getFullYear() !== fYear)  return false;
    if (fMonth && (d.getMonth()+1) !== fMonth) return false;
    if (fUnit    && r.unit          !== fUnit)    return false;
    if (fPeriode && r.periode       !== fPeriode) return false;
    if (fType    && r.equipmentType !== fType)    return false;
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  if (!reports.length) { toast('Tidak ada data untuk dicetak','warning'); return; }

  const periodLabel = fYear && fMonth ? `${MONTHS_ID[fMonth-1]} ${fYear}` : fYear ? `Tahun ${fYear}` : fMonth ? MONTHS_ID[fMonth-1] : 'Semua Periode';
  const printDate = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  const totalSP    = reports.reduce((s,r)=>s+(r.spareParts?.filter(sp=>sp?.uraian).length||0),0);
  const totalAkt   = reports.reduce((s,r)=>s+(r.aktivitas?.length||0),0);

  const allSchedules = getData(STORE.SCHEDULES);
  const schedFiltered = allSchedules.filter(s => {
    if (fUnit    && s.unit    !== fUnit)    return false;
    if (fPeriode && s.periode !== fPeriode) return false;
    return true;
  });
  const totalSchedule = schedFiltered.length;
  const donePMIds = new Set(reports.map(r => (r.equipmentName||'').toLowerCase() + '|' + (r.unit||'').toLowerCase()));
  const schedDone = schedFiltered.filter(s => donePMIds.has((s.equipment||'').toLowerCase() + '|' + (s.unit||'').toLowerCase())).length;
  const pct = totalSchedule ? Math.round(schedDone / totalSchedule * 100) : 0;
  const teknisiSet = [...new Set(reports.map(r=>r.teknisi||'').filter(Boolean))];

  const byType = {};
  reports.forEach(r => {
    const k = r.equipmentType||'unknown';
    if (!byType[k]) byType[k]={label:EQ_LABELS[k]||k,count:0,aktTotal:0,aktDone:0,spCount:0};
    byType[k].count++; byType[k].aktTotal+=r.aktivitas?.length||0;
    byType[k].aktDone+=r.aktivitas?.filter(a=>a.yes||a.no_checked).length||0;
    byType[k].spCount+=r.spareParts?.filter(sp=>sp?.uraian).length||0;
  });

  const typeRows = Object.values(byType).sort((a,b)=>b.count-a.count).map((t,i)=>{
    const p=t.aktTotal?Math.round(t.aktDone/t.aktTotal*100):0;
    return `<tr style="background:${i%2===0?'#f7f9f7':'#fff'}"><td>${t.label}</td><td style="text-align:center">${t.count}</td><td style="text-align:center">${t.aktTotal}</td><td style="text-align:center;font-weight:700;color:${p===100?'#2d7a2d':p>=60?'#c97a00':'#b03020'}">${p}%</td><td style="text-align:center">${t.spCount||'—'}</td></tr>`;
  }).join('');

  const detailRows = reports.map((r,i)=>{
    const d=r.date?new Date(r.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'—';
    const aktTotal=r.aktivitas?.length||0; const aktDone=r.aktivitas?.filter(a=>a.yes||a.no_checked).length||0;
    const p=aktTotal?Math.round(aktDone/aktTotal*100):0;
    const sp=r.spareParts?.filter(s=>s?.uraian).map(s=>`${s.uraian}${s.spesifikasi?' ('+s.spesifikasi+')':''} x${s.jumlah||1}`).join('; ')||'—';
    const ppeKeys={helm:'Helm',masker:'Masker',sarungTangan:'Sarung Tangan',earPlug:'Ear Plug',sepatu:'Sepatu',harness:'Harness',lain:'Lain'};
    const ppeStr=Object.entries(r.ppe||{}).filter(([,v])=>v).map(([k])=>ppeKeys[k]||k).join(', ')||'—';
    return `<tr style="background:${i%2===0?'#f7f9f7':'#fff'}"><td style="text-align:center">${i+1}</td><td><strong>${r.equipmentName||'—'}</strong><br><span style="font-size:7.5pt;color:#888">${r.tagNo||''}</span></td>
      <td>${EQ_LABELS[r.equipmentType]||r.equipmentType||'—'}</td><td>${r.unit||'—'}<br><span style="font-size:7.5pt;color:#888">${r.area||'—'}</span></td>
      <td>${d}</td><td>${r.periode||'—'}</td><td>${r.teknisi||'—'}</td>
      <td style="text-align:center;font-weight:700;color:${p===100?'#2d7a2d':p>=60?'#c97a00':'#b03020'}">${p}%<br><span style="font-weight:400;font-size:7.5pt">${aktDone}/${aktTotal}</span></td>
      <td style="font-size:7.5pt">${sp}</td><td style="font-size:7.5pt">${ppeStr}</td><td>${r.approval||'—'}</td></tr>`;
  }).join('');

  const filterDesc = [
    fYear&&fMonth?`Periode: ${MONTHS_ID[fMonth-1]} ${fYear}`:fYear?`Tahun: ${fYear}`:fMonth?`Bulan: ${MONTHS_ID[fMonth-1]}`:'',
    fUnit?`Unit: ${fUnit}`:'', fPeriode?`Frekuensi: ${fPeriode}`:'', fType?`Equipment: ${EQ_LABELS[fType]||fType}`:''
  ].filter(Boolean).join('  |  ') || 'Semua data';

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>Resume PM — ${periodLabel}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}@page{size:A4 landscape;margin:10mm 12mm}body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#111}h1{font-size:13pt;font-weight:900;color:#1a3a6b}h2{font-size:9pt;font-weight:700;color:#1a3a6b;margin:10px 0 5px;text-transform:uppercase;letter-spacing:.05em}table{width:100%;border-collapse:collapse;margin-bottom:10px}th{background:#1a3a6b;color:#fff;padding:5px 7px;font-size:7.5pt;text-align:left;letter-spacing:.04em}td{padding:5px 7px;border-bottom:1px solid #ddd;font-size:8pt;vertical-align:top}
.kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:8px 0 12px}.kpi{border:1px solid #ccc;border-radius:4px;padding:7px 10px;text-align:center}.kpi-val{font-size:18pt;font-weight:900;color:#1a3a6b;line-height:1.1}.kpi-lbl{font-size:7pt;color:#777;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
.hdr-bar{background:#1a3a6b;color:#fff;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;border-radius:4px;margin-bottom:10px}.filter-bar{background:#f4f7f4;border:1px solid #ccc;padding:5px 10px;font-size:7.5pt;color:#555;margin-bottom:10px;border-radius:3px}.footer{margin-top:8px;padding:4px 0;font-size:7pt;color:#aaa;border-top:1px solid #eee;text-align:center}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
<div class="hdr-bar"><div><div style="font-size:7pt;color:rgba(255,255,255,.6);letter-spacing:.08em">PT PRASAD SEEDS INDONESIA — DEPARTEMEN MAINTENANCE</div>
<h1 style="color:#fff;font-size:14pt">RESUME LAPORAN PREVENTIVE MAINTENANCE</h1><div style="font-size:8pt;color:rgba(255,255,255,.75);margin-top:2px">${periodLabel}</div></div>
<div style="text-align:right;font-size:7.5pt;color:rgba(255,255,255,.6)"><div>Dicetak: ${printDate}</div><div style="margin-top:2px">Form: F-MTC-RSM-01 | Rev: 00</div></div></div>
<div class="filter-bar">Filter aktif: ${filterDesc}</div>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${reports.length}</div><div class="kpi-lbl">Total Laporan</div></div>
  <div class="kpi"><div class="kpi-val">${totalAkt}</div><div class="kpi-lbl">Total Aktivitas</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${pct===100?'#2d7a2d':pct>=60?'#c97a00':'#b03020'}">${pct}%</div><div class="kpi-lbl">Completion Rate<br><span style="font-size:7pt;font-weight:400">${schedDone}/${totalSchedule} schedule</span></div></div>
  <div class="kpi"><div class="kpi-val">${totalSP}</div><div class="kpi-lbl">Spare Parts</div></div>
  <div class="kpi"><div class="kpi-val">${teknisiSet.length}</div><div class="kpi-lbl">Teknisi</div></div>
</div>
<h2>Rekapitulasi per Equipment Type</h2>
<table><thead><tr><th>Equipment Type</th><th style="text-align:center">Jml Laporan</th><th style="text-align:center">Total Aktivitas</th><th style="text-align:center">Completion</th><th style="text-align:center">Spare Parts</th></tr></thead><tbody>${typeRows}</tbody></table>
<h2>Detail Laporan PM</h2>
<table><thead><tr><th style="width:24px">No</th><th>Equipment / Tag</th><th>Type</th><th>Unit / Area</th><th>Tanggal</th><th>Periode</th><th>Teknisi</th><th style="text-align:center">Checklist</th><th>Spare Parts</th><th>PPE</th><th>Approval</th></tr></thead><tbody>${detailRows}</tbody></table>
<div class="footer">Resume PM — PT Prasad Seeds Indonesia | ${periodLabel} | Total ${reports.length} laporan | Teknisi: ${teknisiSet.join(', ')||'—'}</div>
</body></html>`;

  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(()=>{w.focus();w.print();},400);
}
