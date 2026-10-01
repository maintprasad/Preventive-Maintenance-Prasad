// ════════════════════════════════════════════════════════
//  REPORT LIST
// ════════════════════════════════════════════════════════
let repPage = 0;
const REP_PER_PAGE = 10;
function renderReportList() { repPage=0; renderReportPage(); }
function changeRepPage(dir) { repPage=Math.max(0,repPage+dir); renderReportPage(); }

function onRepUnitChange() {
  const unit = document.getElementById('rep-filter-unit')?.value || '';
  const areaSel = document.getElementById('rep-filter-area');
  if (!areaSel) return;
  const reports = getData(STORE.REPORTS);
  const areas = [...new Set(reports.filter(r => !unit || r.unit === unit).map(r => r.area||'').filter(Boolean))].sort();
  areaSel.innerHTML = '<option value="">Semua Area</option>' + areas.map(a => `<option value="${a}">${a}</option>`).join('');
  renderReportList();
}

function clearRepFilters() {
  ['rep-search','rep-filter-unit','rep-filter-area','rep-filter-type','rep-filter-periode'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const areaSel = document.getElementById('rep-filter-area');
  if (areaSel) {
    const reports = getData(STORE.REPORTS);
    const areas = [...new Set(reports.map(r=>r.area||'').filter(Boolean))].sort();
    areaSel.innerHTML = '<option value="">Semua Area</option>' + areas.map(a=>`<option value="${a}">${a}</option>`).join('');
  }
  renderReportList();
}

async function deleteReport(id) {
  document.getElementById('delete-confirm-msg').textContent = 'Hapus laporan PM ini?';
  resetDeleteConfirmBtn();
  document.getElementById('delete-confirm-btn').onclick = async () => {
    const reports = getData(STORE.REPORTS).filter(r=>r.id!==id);
    setData(STORE.REPORTS, reports);
    closeOverlay('deleteOverlay');
    renderReportPage();
    renderDashboard();
    renderInputPMPage();
    renderOutstandingPage();
    updateSidebarBadges();
    toast('Laporan dihapus','info');
    if (backendEnabled()) await apiOrQueue('deleteReport', { id }, id);
  };
  openOverlay('deleteOverlay');
}

function exportReportsCSV() {
  const reports = getData(STORE.REPORTS);
  if (!reports.length) { toast('Tidak ada laporan','info'); return; }
  const headers = ['ID','Tag No','Tanggal','Unit','Area','Equipment Type','Equipment Name','Periode','Minggu','Teknisi','Approval','Notes','Submitted At'];
  const rows = reports.map(r => [
    r.id,r.tagNo,r.date,r.unit||'',r.area||'',EQ_LABELS[r.equipmentType]||r.equipmentType||'',r.equipmentName,r.periode,r.week||'',r.teknisi,r.approval,r.notes,r.submittedAt
  ].map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','),...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  a.download = `PM_Reports_${todayISO()}.csv`;
  a.click();
  toast('CSV didownload','success');
}

function renderReportPage() {
  const reports = getData(STORE.REPORTS);
  const search = (document.getElementById('rep-search')?.value||'').toLowerCase();
  const unitF = document.getElementById('rep-filter-unit')?.value||'';
  const areaF = document.getElementById('rep-filter-area')?.value||'';
  const typeF = document.getElementById('rep-filter-type')?.value||'';
  const periodeF = document.getElementById('rep-filter-periode')?.value||'';

  let filtered = reports.filter(r => {
    if (search && ![(r.tagNo||''),(r.equipmentName||''),(r.teknisi||''),(r.area||''),(r.unit||'')].some(v=>v.toLowerCase().includes(search))) return false;
    if (unitF && r.unit !== unitF) return false;
    if (areaF && r.area !== areaF) return false;
    if (typeF && r.equipmentType !== typeF) return false;
    if (periodeF && r.periode !== periodeF) return false;
    return true;
  });

  const total = filtered.length;
  // FIX: setelah menghapus laporan terakhir di halaman terakhir (atau data
  // berkurang karena sync), repPage menunjuk halaman kosong → tampil "Belum ada
  // laporan" dan pagination hilang padahal laporan masih ada.
  const lastPage = Math.max(0, Math.ceil(total / REP_PER_PAGE) - 1);
  if (repPage > lastPage) repPage = lastPage;
  const start = repPage * REP_PER_PAGE;
  const paged = filtered.slice(start, start + REP_PER_PAGE);

  document.getElementById('report-count-lbl').textContent = `${total} laporan ditemukan`;

  const container = document.getElementById('report-list');
  if (!paged.length) {
    container.innerHTML = `<div class="empty"><div class="empty-ico">📋</div><div class="empty-msg">Belum ada laporan PM.</div></div>`;
    document.getElementById('rep-pagination').style.display = 'none';
    return;
  }

  const sigs = getLocalSigs();

  container.innerHTML = paged.map(r => {
    const dateFmt = r.date ? new Date(r.date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '—';
    const eqLabel = EQ_LABELS[r.equipmentType]||r.equipmentType||'—';
    const periodeBadgeClass = {Daily:'b-daily',Weekly:'b-weekly',Monthly:'b-monthly',Quarterly:'b-quarterly','Semi-Annual':'b-quarterly',Annual:'b-yearly'}[r.periode]||'b-monthly';
    const aktTotal   = Array.isArray(r.aktivitas) ? r.aktivitas.length : 0;
    const aktDone    = Array.isArray(r.aktivitas) ? r.aktivitas.filter(a=>a.yes||a.no_checked).length : 0;
    const anomaliCnt = Array.isArray(r.aktivitas) ? r.aktivitas.filter(a=>a.no_checked).length : 0;
    const spCount    = Array.isArray(r.spareParts) ? r.spareParts.filter(s=>s&&s.uraian).length : 0;
    const pct        = aktTotal ? Math.round(aktDone/aktTotal*100) : 0;
    const pctColor   = pct===100 ? 'var(--green)' : pct>=60 ? 'var(--orange)' : 'var(--red)';
    const hasSig = sigs[r.id] && (sigs[r.id].spvSig || sigs[r.id].leaderSig);
    const wo     = getWOForReport(r.id);           // WO terkait laporan ini (atau null)
    const woSt   = wo ? (WO_STATUS[wo.status] || WO_STATUS.open) : null;

    const badges = [
      `<span class="badge b-done">✓ Selesai</span>`,
      hasSig   ? `<span class="badge" style="background:rgba(43,108,184,.1);color:var(--blue);border:1px solid rgba(43,108,184,.2);font-size:9px">✍ TTD</span>` : '',
      anomaliCnt > 0 ? `<span class="badge" style="background:rgba(192,57,43,.1);color:var(--red);border:1px solid rgba(192,57,43,.25);font-size:9px">⚠ ${anomaliCnt} Anomali</span>` : '',
      wo ? `<span class="badge" style="background:${woSt.bg};color:${woSt.color};border:1px solid ${woSt.color}33;font-size:9px" title="${escapeHtml(wo.id)}">WO · ${woSt.label}${wo.synced?'':' ⏳'}</span>` : '',
    ].filter(Boolean).join('');

    const checklistBar = aktTotal > 0 ? `
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pctColor};border-radius:2px"></div></div>
        <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:${pctColor};white-space:nowrap">${aktDone}/${aktTotal} (${pct}%)</span>
      </div>` : '';

    // FIX: dulu ketika WO sudah ada, tombolnya hanya dinonaktifkan sehingga
    // pengguna tidak punya cara melihat WO tersebut. Sekarang tombol berubah
    // fungsi menjadi "Lihat WO" yang membuka daftar WO terfilter laporan ini.
    const woBtn = WO_MAINTENANCE && anomaliCnt > 0
      ? `<button class="tbl-btn" style="opacity:.6" title="Fitur Work Order sedang dalam maintenance" onclick="woMaintenanceGuard()">🛠 WO maintenance</button>`
      : anomaliCnt > 0
      ? wo ? `<button class="tbl-btn" style="border-color:rgba(43,108,184,.35);color:var(--blue)" onclick="openWOListModal('${r.id}')">🔎 Lihat WO</button>`
           : `<button class="tbl-btn" style="border-color:rgba(192,57,43,.4);color:var(--red)" onclick="bukaWOdariDaftarLaporan('${r.id}')">⚠ Buat WO</button>`
      : '';

    return `
    <div class="report-item" style="padding:14px 16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px">
        <div style="min-width:0">
          <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.equipmentName||'—'}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--accent);margin-top:1px">${r.tagNo||'—'}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:11px;font-weight:600;color:var(--text2)">${dateFmt}</div>
          <div style="margin-top:4px;display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">${badges}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
        <span style="font-size:11px;color:var(--text3)">🔧 ${eqLabel}</span><span style="color:var(--border)">·</span>
        <span style="font-size:11px;color:var(--text3)">🏭 ${r.unit||'—'}</span><span style="color:var(--border)">·</span>
        <span style="font-size:11px;color:var(--text3)">📍 ${r.area||'—'}</span><span style="color:var(--border)">·</span>
        <span style="font-size:11px;color:var(--text3)">👤 ${r.teknisi||'—'}</span>
        <span class="badge ${periodeBadgeClass}" style="margin-left:2px">${r.periode}</span>
        ${spCount > 0 ? `<span style="font-size:11px;color:var(--accent)">📦 ${spCount} spare part</span>` : ''}
        ${r.week ? `<span style="font-size:11px;color:var(--text3)">W${r.week}</span>` : ''}
      </div>
      ${checklistBar}
      ${r.notes ? `<div style="margin-top:8px;font-size:11px;color:var(--text3);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.notes}">"${r.notes.substring(0,100)}${r.notes.length>100?'...':''}"</div>` : ''}
      <div class="ri-actions" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap">
        <button class="tbl-btn pdf" onclick="downloadPMPDFById('${r.id}')">📄 PDF</button>
        <button class="tbl-btn" style="border-color:rgba(43,108,184,.35);color:var(--blue)" onclick="openSignatureModal('${r.id}')">✍ TTD</button>
        ${woBtn}
        <button class="tbl-btn" style="border-color:rgba(230,126,34,.35);color:var(--orange)" onclick="editReport('${r.id}')">✏ Edit</button>
        <button class="tbl-btn del" onclick="deleteReport('${r.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');

  const pag = document.getElementById('rep-pagination');
  pag.style.display = total > REP_PER_PAGE ? 'flex' : 'none';
  document.getElementById('rep-page-info').textContent = `${start+1}–${Math.min(start+REP_PER_PAGE,total)} dari ${total}`;
  document.getElementById('rep-prev').disabled = repPage === 0;
  document.getElementById('rep-next').disabled = start + REP_PER_PAGE >= total;
}

// ════════════════════════════════════════════════════════
//  RESUME LAPORAN PM
// ════════════════════════════════════════════════════════
function clearResumeFilters() {
  ['res-filter-year','res-filter-month','res-filter-unit','res-filter-periode','res-filter-type']
    .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  renderResumePage();
}

function renderResumePage() {
  const reports = getData(STORE.REPORTS);

  const yearSel = document.getElementById('res-filter-year');
  if (yearSel) {
    const years = [...new Set(reports.map(r => r.date ? new Date(r.date).getFullYear() : null).filter(Boolean))].sort((a,b)=>b-a);
    const curYear = yearSel.value;
    yearSel.innerHTML = '<option value="">Semua Tahun</option>' + years.map(y=>`<option value="${y}">${y}</option>`).join('');
    yearSel.value = curYear;
  }
  const unitSel = document.getElementById('res-filter-unit');
  if (unitSel) {
    const units = [...new Set(reports.map(r=>r.unit||'').filter(Boolean))].sort();
    const cur = unitSel.value;
    unitSel.innerHTML = '<option value="">Semua Unit</option>' + units.map(u=>`<option value="${u}">${u}</option>`).join('');
    unitSel.value = cur;
  }

  const fYear    = parseInt(document.getElementById('res-filter-year')?.value)||0;
  const fMonth   = parseInt(document.getElementById('res-filter-month')?.value)||0;
  const fUnit    = document.getElementById('res-filter-unit')?.value||'';
  const fPeriode = document.getElementById('res-filter-periode')?.value||'';
  const fType    = document.getElementById('res-filter-type')?.value||'';

  let filtered = reports.filter(r => {
    if (!r.date) return false;
    const d = new Date(r.date);
    if (fYear  && d.getFullYear() !== fYear)  return false;
    if (fMonth && (d.getMonth()+1) !== fMonth) return false;
    if (fUnit    && r.unit          !== fUnit)    return false;
    if (fPeriode && r.periode       !== fPeriode) return false;
    if (fType    && r.equipmentType !== fType)    return false;
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  const container = document.getElementById('resume-content');
  if (!filtered.length) {
    container.innerHTML = '<div class="empty"><div class="empty-ico">📊</div><div class="empty-msg">Tidak ada laporan sesuai filter.</div></div>';
    return;
  }

  const allSchedules = getData(STORE.SCHEDULES);
  const schedFiltered = allSchedules.filter(s => {
    if (fUnit    && s.unit    !== fUnit)    return false;
    if (fPeriode && s.periode !== fPeriode) return false;
    return true;
  });
  const totalSchedule = schedFiltered.length;
  const schedDone = schedFiltered.filter(s => hasReport(s, filtered)).length;
  const pctComplete = totalSchedule ? Math.round(schedDone / totalSchedule * 100) : 0;

  const periodLabel = (() => {
    if (fYear && fMonth) return `${MONTHS_ID[fMonth-1]} ${fYear}`;
    if (fYear) return `Tahun ${fYear}`;
    if (fMonth) return MONTHS_ID[fMonth-1];
    return 'Semua Periode';
  })();

  const byType = {};
  filtered.forEach(r => {
    const k = r.equipmentType || 'unknown';
    if (!byType[k]) byType[k] = { label: EQ_LABELS[k]||k, count:0, aktTotal:0, aktDone:0, spCount:0 };
    byType[k].count++;
    byType[k].aktTotal += r.aktivitas?.length||0;
    byType[k].aktDone  += r.aktivitas?.filter(a=>a.yes||a.no_checked).length||0;
    byType[k].spCount  += r.spareParts?.filter(sp=>sp?.uraian).length||0;
  });

  const byUnit = {};
  filtered.forEach(r => {
    const k = r.unit || '(Tanpa Unit)';
    if (!byUnit[k]) byUnit[k] = { count:0, done:0 };
    byUnit[k].count++;
    const allDone = (r.aktivitas?.length||0) > 0 && r.aktivitas.every(a=>a.yes||a.no_checked);
    if (allDone) byUnit[k].done++;
  });

  const byMonth = {};
  if (!fMonth) {
    filtered.forEach(r => {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = `${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
      if (!byMonth[key]) byMonth[key] = { label, count:0 };
      byMonth[key].count++;
    });
  }

  const detailRows = filtered.map((r,i) => {
    const d = r.date ? new Date(r.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    const aktTotal = r.aktivitas?.length||0;
    const aktDone  = r.aktivitas?.filter(a=>a.yes||a.no_checked).length||0;
    const pct      = aktTotal ? Math.round(aktDone/aktTotal*100) : 0;
    const spCount  = r.spareParts?.filter(sp=>sp?.uraian).length||0;
    const ppeKeys  = {helm:'Helm',masker:'Masker',sarungTangan:'Sarung Tangan',earPlug:'Ear Plug',sepatu:'Sepatu',harness:'Harness',lain:'Lain'};
    const ppeStr   = Object.entries(r.ppe||{}).filter(([,v])=>v).map(([k])=>ppeKeys[k]||k).join(', ')||'—';
    const pctColor = pct===100?'var(--green)':pct>=60?'var(--orange)':'var(--red)';
    return `<tr style="background:${i%2===0?'var(--bg3)':'var(--bg2)'}">
      <td style="padding:8px 10px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text3)">${i+1}</td>
      <td style="padding:8px 10px;font-size:12px"><strong>${r.equipmentName||'—'}</strong><br><span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent)">${r.tagNo||'—'}</span></td>
      <td style="padding:8px 10px;font-size:12px">${EQ_LABELS[r.equipmentType]||r.equipmentType||'—'}</td>
      <td style="padding:8px 10px;font-size:12px">${r.unit||'—'}<br><span style="font-size:11px;color:var(--text3)">${r.area||'—'}</span></td>
      <td style="padding:8px 10px;font-size:12px">${d}</td>
      <td style="padding:8px 10px;font-size:12px"><span class="badge ${({Daily:'b-daily',Weekly:'b-weekly',Monthly:'b-monthly',Quarterly:'b-quarterly','Semi-Annual':'b-quarterly',Annual:'b-yearly'}[r.periode]||'b-monthly')}">${r.periode}</span></td>
      <td style="padding:8px 10px;font-size:12px">${r.teknisi||'—'}</td>
      <td style="padding:8px 10px;text-align:center"><div style="font-size:12px;font-weight:700;color:${pctColor}">${pct}%</div><div style="font-size:10px;color:var(--text3)">${aktDone}/${aktTotal}</div></td>
      <td style="padding:8px 10px;text-align:center;font-size:12px">${spCount>0?`<span style="color:var(--accent);font-weight:600">${spCount}</span>`:'—'}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text3);max-width:160px">${ppeStr}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text3)">${r.approval||'—'}</td>
    </tr>`;
  }).join('');

  const typeRows = Object.values(byType).sort((a,b)=>b.count-a.count).map((t,i) => {
    const p = t.aktTotal ? Math.round(t.aktDone/t.aktTotal*100) : 0;
    const c = p===100?'var(--green)':p>=60?'var(--orange)':'var(--red)';
    return `<tr style="background:${i%2===0?'var(--bg3)':'var(--bg2)'}">
      <td style="padding:8px 12px;font-size:13px;font-weight:600">${t.label}</td>
      <td style="padding:8px 12px;text-align:center;font-size:13px;font-weight:700;color:var(--navy)">${t.count}</td>
      <td style="padding:8px 12px;text-align:center;font-size:12px">${t.aktTotal}</td>
      <td style="padding:8px 12px;text-align:center"><span style="font-size:13px;font-weight:700;color:${c}">${p}%</span></td>
      <td style="padding:8px 12px;text-align:center;font-size:12px">${t.spCount>0?`<span style="color:var(--accent);font-weight:600">${t.spCount}</span>`:'—'}</td>
    </tr>`;
  }).join('');

  const unitRows = Object.entries(byUnit).map(([u,v],i) => `
    <tr style="background:${i%2===0?'var(--bg3)':'var(--bg2)'}">
      <td style="padding:8px 12px;font-size:13px;font-weight:600">${u}</td>
      <td style="padding:8px 12px;text-align:center;font-size:13px;font-weight:700;color:var(--navy)">${v.count}</td>
      <td style="padding:8px 12px;text-align:center;font-size:12px;color:var(--green2)">${v.done}</td>
      <td style="padding:8px 12px;text-align:center;font-size:12px;color:var(--text3)">${v.count-v.done}</td>
    </tr>`).join('');

  const monthRows = Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0])).map(([,v],i) => `
    <tr style="background:${i%2===0?'var(--bg3)':'var(--bg2)'}">
      <td style="padding:8px 12px;font-size:13px;font-weight:600">${v.label}</td>
      <td style="padding:8px 12px;text-align:center;font-size:13px;font-weight:700;color:var(--navy)">${v.count}</td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="stat-card c-blue" style="padding:20px 24px"><div class="stat-lbl">Total Equipment Terdaftar</div><div class="stat-val">${totalSchedule}</div><div class="stat-sub">dari Schedule PM</div></div>
      <div class="stat-card c-green" style="padding:20px 24px"><div class="stat-lbl">Total Laporan Masuk</div><div class="stat-val">${filtered.length}</div><div class="stat-sub">${periodLabel}</div></div>
      <div class="stat-card c-green" style="padding:20px 24px"><div class="stat-lbl">Completion Rate</div><div class="stat-val" style="color:${pctComplete===100?'var(--green)':pctComplete>=60?'var(--orange)':'var(--red)'}">${pctComplete}%</div><div class="stat-sub">${schedDone}/${totalSchedule} schedule selesai</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1.4fr 1fr${!fMonth?' 0.8fr':''};gap:14px;margin-bottom:20px">
      <div class="tbl-wrap">
        <div style="padding:12px 14px 8px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--border)">Per Equipment Type</div>
        <table class="data-table"><thead><tr><th>Equipment Type</th><th style="text-align:center">Laporan</th><th style="text-align:center">Aktivitas</th><th style="text-align:center">Completion</th><th style="text-align:center">Spare Parts</th></tr></thead>
          <tbody>${typeRows||'<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text3)">—</td></tr>'}</tbody></table>
      </div>
      <div class="tbl-wrap">
        <div style="padding:12px 14px 8px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--border)">Per Unit</div>
        <table class="data-table"><thead><tr><th>Unit</th><th style="text-align:center">Laporan</th><th style="text-align:center">Full Done</th><th style="text-align:center">Partial</th></tr></thead>
          <tbody>${unitRows||'<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text3)">—</td></tr>'}</tbody></table>
      </div>
      ${!fMonth && monthRows ? `<div class="tbl-wrap">
        <div style="padding:12px 14px 8px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--border)">Per Bulan</div>
        <table class="data-table"><thead><tr><th>Bulan</th><th style="text-align:center">Laporan</th></tr></thead><tbody>${monthRows}</tbody></table>
      </div>` : ''}
    </div>
    <div class="tbl-wrap">
      <div style="padding:12px 14px 8px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
        <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">Detail Laporan (${filtered.length} laporan)</span>
      </div>
      <div style="overflow-x:auto"><table class="data-table" style="min-width:900px">
        <thead><tr><th style="width:36px">NO</th><th>Equipment</th><th>Type</th><th>Unit / Area</th><th>Tanggal</th><th>Periode</th><th>Teknisi</th><th style="text-align:center">Checklist</th><th style="text-align:center">Spare Parts</th><th>PPE</th><th>Approval</th></tr></thead>
        <tbody>${detailRows}</tbody></table></div>
    </div>`;
}
