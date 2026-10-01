// ════════════════════════════════════════════════════════
//  PM FORM
// ════════════════════════════════════════════════════════
function loadPMTemplate() {
  const type = document.getElementById('pm-equipment-type').value;
  const section = document.getElementById('pm-aktivitas-section');
  const tbody = document.getElementById('pm-aktivitas-tbody');
  if (!type || !PM_TEMPLATES[type]) {
    section.style.display = 'none';
    tbody.innerHTML = '';
    const elDone  = document.getElementById('checklist-done-count');
    const elTotal = document.getElementById('checklist-total-count');
    const elBar   = document.getElementById('checklist-progress-bar');
    const elPct   = document.getElementById('checklist-progress-pct');
    if (elDone)  elDone.textContent  = '0';
    if (elTotal) elTotal.textContent = '0';
    if (elBar)   elBar.style.width   = '0%';
    if (elPct)   elPct.textContent   = '0%';
    return;
  }
  section.style.display = 'block';
  tbody.innerHTML = PM_TEMPLATES[type].map((item, i) => `
    <tr>
      <td style="text-align:center;width:32px;font-size:11px;color:var(--text3)">${i+1}</td>
      <td style="font-size:12px;padding:6px 10px">${escapeHtml(item)}</td>
      <td style="text-align:center;padding:4px"><input type="checkbox" class="pm-yes" name="akt_${i}" onchange="toggleAkt(this,'yes')"></td>
      <td style="text-align:center;padding:4px"><input type="checkbox" class="pm-no" name="akt_${i}" onchange="toggleAkt(this,'no')"></td>
      <td style="padding:4px"><input type="text" class="aktivitas-ket pm-keterangan" placeholder="Catatan..."></td>
    </tr>`).join('');
  const woBar = document.getElementById('wo-summary-bar');
  if (woBar) woBar.style.display = 'none';
  _updateChecklistProgress();
}

function toggleAkt(cb, val) {
  const row = cb.closest('tr');
  if (val==='yes') row.querySelectorAll('.pm-no').forEach(c=>c.checked=false);
  else row.querySelectorAll('.pm-yes').forEach(c=>c.checked=false);
  _updateWOBar();
  _updateChecklistProgress();
}

function _updateChecklistProgress() {
  const rows = document.querySelectorAll('#pm-aktivitas-tbody tr');
  const total = rows.length;
  let done = 0, anomali = 0;
  rows.forEach(row => {
    const isYes = row.querySelector('.pm-yes')?.checked;
    const isNo  = row.querySelector('.pm-no')?.checked;
    if (isYes || isNo) done++;
    if (isNo) anomali++;
  });
  const pct = total ? Math.round(done / total * 100) : 0;
  const elDone  = document.getElementById('checklist-done-count');
  const elTotal = document.getElementById('checklist-total-count');
  const elBar   = document.getElementById('checklist-progress-bar');
  const elPct   = document.getElementById('checklist-progress-pct');
  if (!elDone) return;
  elDone.textContent  = done;
  elTotal.textContent = total;
  elPct.textContent   = pct + '%';
  const barColor = anomali > 0 ? 'var(--orange)' : 'var(--green)';
  elBar.style.width      = pct + '%';
  elBar.style.background = barColor;
  elPct.style.color      = pct === 100 ? (anomali > 0 ? 'var(--orange)' : 'var(--green)') : 'var(--text3)';

  const wrap = document.getElementById('checklist-progress-wrap');
  let badge  = document.getElementById('checklist-done-badge');
  if (pct === 100 && total > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'checklist-done-badge';
      badge.style.cssText = 'font-family:"IBM Plex Mono",monospace;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;white-space:nowrap';
      wrap.appendChild(badge);
    }
    if (anomali > 0) { badge.textContent='⚠ '+anomali+' Anomali'; badge.style.background='rgba(230,126,34,.12)'; badge.style.color='var(--orange)'; badge.style.border='1px solid rgba(230,126,34,.3)'; }
    else { badge.textContent='✓ Semua OK'; badge.style.background='rgba(74,158,63,.1)'; badge.style.color='var(--green2)'; badge.style.border='1px solid rgba(74,158,63,.25)'; }
  } else if (badge) badge.remove();
}

function addSP() {
  const container = document.getElementById('pm-spareparts-container');
  const n = container.children.length + 1;
  const div = document.createElement('div');
  div.className = 'sparepart-row';
  div.innerHTML = `<div class="sp-num">${n}</div>
    <input type="text" class="sp-input pm-sp-uraian" placeholder="Uraian">
    <input type="text" class="sp-input pm-sp-spec" placeholder="Spesifikasi">
    <input type="number" class="sp-input pm-sp-jumlah" placeholder="Qty" min="0">
    <button class="sp-del" onclick="removeSP(this)">✕</button>`;
  container.appendChild(div);
}
function addSparePart() { addSP(); }

function removeSP(btn) {
  const container = document.getElementById('pm-spareparts-container');
  if (container.children.length > 1) {
    btn.closest('.sparepart-row').remove();
    container.querySelectorAll('.sp-num').forEach((n,i)=>n.textContent=i+1);
  }
}

// FIX: object literal lama punya key `week` dan `month` dua kali (satu eksplisit,
// satu shorthand) — duplikasi dihapus, masing-masing hanya dihitung sekali.
function collectPMData() {
  const ppeMap = {'helm':'helm','masker':'masker','sarung-tangan':'sarungTangan','earplug':'earPlug','sepatu':'sepatu','harness':'harness','lain':'lain'};
  const ppe = {};
  Object.entries(ppeMap).forEach(([idSuffix, key]) => { ppe[key] = document.getElementById('pm-ppe-' + idSuffix)?.checked || false; });

  const aktivitas = [];
  document.querySelectorAll('#pm-aktivitas-tbody tr').forEach((row, i) => {
    aktivitas.push({
      no: i+1,
      uraian: row.cells[1]?.textContent?.trim() || '',
      yes: row.querySelector('.pm-yes')?.checked || false,
      no_checked: row.querySelector('.pm-no')?.checked || false,
      keterangan: row.querySelector('.pm-keterangan')?.value || ''
    });
  });

  const spareParts = [];
  document.querySelectorAll('.sparepart-row').forEach(row => {
    const u = row.querySelector('.pm-sp-uraian')?.value.trim();
    if (u) spareParts.push({ uraian: u, spesifikasi: row.querySelector('.pm-sp-spec')?.value.trim() || '', jumlah: parseFloat(row.querySelector('.pm-sp-jumlah')?.value) || 0 });
  });

  const dateVal = document.getElementById('pm-date').value;
  const week  = parseInt(document.getElementById('pm-week')?.value) || getWeekOfMonth(new Date());
  const month = dateVal ? new Date(dateVal + 'T00:00:00').getMonth() + 1 : new Date().getMonth() + 1;

  return {
    tagNo:         document.getElementById('pm-tagno').value.trim(),
    date:          dateVal,
    equipmentType: document.getElementById('pm-equipment-type').value,
    equipmentName: document.getElementById('pm-equipment-name').value.trim(),
    unit:          document.getElementById('pm-unit').value.trim(),
    area:          document.getElementById('pm-area').value.trim(),
    periode:       document.getElementById('pm-periode').value,
    week, month,
    ppe, aktivitas, spareParts,
    teknisi:  document.getElementById('pm-teknisi').value.trim(),
    approval: document.getElementById('pm-approval').value.trim(),
    notes:    document.getElementById('pm-notes').value.trim()
  };
}

// ════════════════════════════════════════════════════════
//  SUBMIT PM
// ════════════════════════════════════════════════════════
async function submitPM() {
  const data = collectPMData();
  if (!data.tagNo || !data.date || !data.equipmentName || !data.teknisi) {
    toast('Isi field wajib: Tag No, Tanggal, Equipment Name, Teknisi', 'error');
    return;
  }

  const editId = document.getElementById('pm-edit-id')?.value || '';
  const isEdit = !!editId;

  if (!isEdit) {
    const existing = getData(STORE.REPORTS);
    const d = new Date(data.date);
    const duplikat = existing.find(r => {
      if (!r.date) return false;
      const rd = new Date(r.date);
      const sameMonth = rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
      const sameEq = (r.tagNo && data.tagNo && r.tagNo.trim().toLowerCase() === data.tagNo.trim().toLowerCase())
        || (r.equipmentName||'').trim().toLowerCase() === (data.equipmentName||'').trim().toLowerCase();
      return sameMonth && sameEq;
    });
    if (duplikat) {
      const tgl = new Date(duplikat.date).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
      const konfirmasi = confirm(`⚠ Laporan untuk "${data.equipmentName}" di bulan ini sudah ada (${tgl}).\n\nTetap submit laporan baru?`);
      if (!konfirmasi) return;
    }
  }

  const reports = getData(STORE.REPORTS);
  let report;

  if (isEdit) {
    const idx = reports.findIndex(r => r.id === editId);
    if (idx === -1) { toast('Laporan tidak ditemukan', 'error'); return; }
    report = { ...reports[idx], ...data, updatedAt: new Date().toISOString() };
    reports[idx] = report;
  } else {
    report = { id: genId(), ...data, submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    reports.unshift(report);
  }

  setData(STORE.REPORTS, reports);
  updateScheduleLastDone(data, window._activeScheduleId);

  // Tautkan WO yang sempat dibuat SEBELUM laporan ini disubmit ke id laporan
  // yang baru saja tersimpan (lihat linkPendingWOToReport di 19-wo.js).
  // Tanpa ini, WO tersebut akan "yatim" — tidak punya pmId — sehingga badge
  // WO tidak muncul di Daftar Laporan dan bisa dibuat WO kedua yang kembar.
  const linkedWO = linkPendingWOToReport(report.id);
  if (linkedWO) toast(`🔗 ${linkedWO} Work Order ditautkan ke laporan ini`, 'info');

  // Lock: schedule yang barusan dikerjakan boleh dilepas — sudah closed.
  const finishedScheduleId = window._activeScheduleId;
  if (finishedScheduleId) { releasePMLock(finishedScheduleId); window._activeScheduleId = null; }

  _invalidateCache();
  renderDashboard();
  renderReportPage();
  renderInputPMPage();
  renderOutstandingPage();
  renderScheduleList();
  populateUnitFilters();
  updateSidebarBadges();

  const msg = document.getElementById('pm-success-msg');
  if (msg) { msg.style.display='block'; setTimeout(()=>msg.style.display='none',5000); }
  toast(isEdit ? '✅ Laporan berhasil diperbarui!' : '✅ Laporan tersimpan!', 'success');

  if (isEdit) {
    document.getElementById('pm-edit-id').value = '';
    document.getElementById('pm-edit-banner').style.display = 'none';
  }

  setTimeout(() => openPDFOverlay(report), 200);

  if (backendEnabled()) {
    setSyncStatus('syncing','Sinkronisasi...');
    _syncReportToSheets(report);
  }
}

async function _syncReportToSheets(report) {
  const ok = await apiOrQueue('saveReport', { report: serializeReport(report) }, report.id);
  if (ok) {
    setSyncStatus('online', 'Tersinkron ke database ✓');
    toast('☁ Tersinkron ke database', 'success');
    flushSyncQueue();
  } else {
    toast('⚠ Gagal sync — masuk antrian otomatis', 'warning');
  }
}

function serializeReport(r) {
  return {
    id: r.id||'', tagNo: r.tagNo||'', date: r.date||'', equipmentType: r.equipmentType||'',
    equipmentName: r.equipmentName||'', unit: r.unit||'', area: r.area||'', periode: r.periode||'',
    week: r.week||'', month: r.month||'', teknisi: r.teknisi||'', approval: r.approval||'',
    notes: r.notes||'', submittedAt: r.submittedAt||'', updatedAt: r.updatedAt||'',
    ppe: JSON.stringify(r.ppe||{}), aktivitas: JSON.stringify(r.aktivitas||[]), spareParts: JSON.stringify(r.spareParts||[])
  };
}

// FIX: dulu dicocokkan HANYA dari nama equipment, sehingga "Blower 1" di
// Unit 1 ikut ter-update saat yang dikerjakan "Blower 1" di Unit 2. Sekarang:
// pakai id schedule yang sedang dieksekusi; kalau tidak ada (input manual /
// edit laporan), cocokkan Tag No, lalu nama + unit.
// FIX: lastDone tidak boleh mundur — mengedit laporan lama dulu menimpa
// lastDone dengan tanggal lama dan membuat "Next Due" kembali ke masa lalu.
function updateScheduleLastDone(report, scheduleId) {
  const schedules = getData(STORE.SCHEDULES);
  const tag  = (report.tagNo||'').trim().toLowerCase();
  const name = (report.equipmentName||'').trim().toLowerCase();
  const unit = (report.unit||'').trim().toLowerCase();
  const isTarget = s => scheduleId
    ? s.id === scheduleId
    : (tag && (s.tagNo||'').trim().toLowerCase() === tag)
      || ((s.equipment||'').trim().toLowerCase() === name && (s.unit||'').trim().toLowerCase() === unit);

  const updated = [];
  schedules.forEach(s => {
    if (!isTarget(s)) return;
    if (s.lastDone && report.date && s.lastDone >= report.date) return;
    s.lastDone = report.date;
    s.updatedAt = new Date().toISOString();
    updated.push(s);
  });
  if (!updated.length) return;
  setData(STORE.SCHEDULES, schedules);
  if (backendEnabled()) updated.forEach(s => apiOrQueue('saveSchedule', { schedule: s }, s.id));
}

function editReport(id) {
  window._activeScheduleId = null;
  const r = getData(STORE.REPORTS).find(x => x.id === id);
  if (!r) { toast('Laporan tidak ditemukan', 'error'); return; }

  showPage('reports');

  document.getElementById('pm-tagno').value          = r.tagNo || '';
  document.getElementById('pm-date').value           = r.date || '';
  document.getElementById('pm-equipment-type').value = r.equipmentType || '';
  document.getElementById('pm-equipment-name').value = r.equipmentName || '';
  document.getElementById('pm-unit').value           = r.unit || '';
  document.getElementById('pm-area').value           = r.area || '';
  document.getElementById('pm-periode').value        = r.periode || 'Monthly';
  document.getElementById('pm-week').value           = r.week || 1;
  document.getElementById('pm-teknisi').value        = r.teknisi || '';
  document.getElementById('pm-approval').value       = r.approval || '';
  document.getElementById('pm-notes').value          = r.notes || '';

  const ppeMap = {'helm':'helm','masker':'masker','sarung-tangan':'sarungTangan','earplug':'earPlug','sepatu':'sepatu','harness':'harness','lain':'lain'};
  Object.entries(ppeMap).forEach(([idSuffix, key]) => { const el = document.getElementById('pm-ppe-' + idSuffix); if (el) el.checked = !!(r.ppe || {})[key]; });

  const aktivitas = Array.isArray(r.aktivitas) ? r.aktivitas : [];
  const section = document.getElementById('pm-aktivitas-section');
  const tbody = document.getElementById('pm-aktivitas-tbody');
  if (aktivitas.length > 0) {
    section.style.display = 'block';
    tbody.innerHTML = aktivitas.map((a, i) => `
      <tr>
        <td style="text-align:center;width:32px;font-size:11px;color:var(--text3)">${i+1}</td>
        <td style="font-size:12px;padding:6px 10px">${escapeHtml(a.uraian)}</td>
        <td style="text-align:center;padding:4px"><input type="checkbox" class="pm-yes" name="akt_${i}" onchange="toggleAkt(this,'yes')" ${a.yes?'checked':''}></td>
        <td style="text-align:center;padding:4px"><input type="checkbox" class="pm-no" name="akt_${i}" onchange="toggleAkt(this,'no')" ${a.no_checked?'checked':''}></td>
        <td style="padding:4px"><input type="text" class="aktivitas-ket pm-keterangan" placeholder="Catatan..." value="${(a.keterangan||'').replace(/"/g,'&quot;')}"></td>
      </tr>`).join('');
  } else {
    loadPMTemplate();
  }

  const spareParts = (r.spareParts||[]).filter(s=>s?.uraian);
  const spContainer = document.getElementById('pm-spareparts-container');
  if (spareParts.length > 0) {
    spContainer.innerHTML = spareParts.map((sp,i) => `
      <div class="sparepart-row">
        <div class="sp-num">${i+1}</div>
        <input type="text" class="sp-input pm-sp-uraian" placeholder="Uraian" value="${(sp.uraian||'').replace(/"/g,'&quot;')}">
        <input type="text" class="sp-input pm-sp-spec" placeholder="Spesifikasi" value="${(sp.spesifikasi||'').replace(/"/g,'&quot;')}">
        <input type="number" class="sp-input pm-sp-jumlah" placeholder="Qty" min="0" value="${sp.jumlah||0}">
        <button class="sp-del" onclick="removeSP(this)">✕</button>
      </div>`).join('');
  }

  document.getElementById('pm-edit-id').value = id;
  const banner = document.getElementById('pm-edit-banner');
  banner.style.display = 'flex';
  document.getElementById('pm-edit-id-label').textContent = `ID: ${id}`;

  // FIX: dulu saat membuka laporan lama untuk diedit, progress checklist tetap
  // 0% dan bar anomali tidak muncul sampai pengguna mengutak-atik salah satu
  // checkbox — padahal datanya sudah ter-render dalam keadaan tercentang.
  _updateChecklistProgress();
  _updateWOBar();

  document.getElementById('page-reports').scrollIntoView({behavior:'smooth'});
  toast('📝 Mode edit — perbarui checklist lalu klik SUBMIT', 'info');
}

// FIX (konkurensi): sekarang eksekusiPM() mencoba mengunci equipment ini
// lebih dulu (acquirePMLock). Kalau sudah dikerjakan teknisi lain, proses
// dibatalkan dan pengguna diberi tahu — mencegah dua orang mengisi laporan
// untuk equipment yang sama secara bersamaan lalu saling menimpa.
async function eksekusiPM(scheduleId) {
  const s = getData(STORE.SCHEDULES).find(x => x.id === scheduleId);
  if (!s) { toast('Schedule tidak ditemukan', 'error'); return; }

  if (isLockedByOther(scheduleId)) {
    const l = getLockFor(scheduleId);
    toast(`⛔ "${s.equipment}" sedang dikerjakan oleh ${l?.name || 'teknisi lain'}`, 'warning');
    return;
  }

  const namaTeknisi = s.pic || document.getElementById('pm-teknisi')?.value || '';
  const granted = await acquirePMLock(scheduleId, s.equipment, namaTeknisi);
  if (!granted) { renderScheduleList(); renderInputPMPage(); return; }

  // FIX: kalau teknisi pindah ke equipment lain tanpa submit/batal, lock
  // equipment sebelumnya dulu tidak pernah dilepas (clearPMForm(true) yang
  // silent tidak melepas lock) → equipment itu terkunci untuk orang lain
  // sampai TTL 15 menit habis.
  const prevLock = window._activeScheduleId;
  if (prevLock && prevLock !== scheduleId) releasePMLock(prevLock);

  clearPMForm(true);

  const el = id => document.getElementById(id);
  if (el('pm-tagno'))          el('pm-tagno').value          = s.tagNo || '';
  if (el('pm-equipment-name')) el('pm-equipment-name').value = s.equipment || '';
  if (el('pm-unit'))           el('pm-unit').value           = s.unit || '';
  if (el('pm-area'))           el('pm-area').value           = s.area || '';
  if (el('pm-periode'))        el('pm-periode').value        = s.periode || 'Monthly';
  if (el('pm-teknisi'))        el('pm-teknisi').value        = s.pic || '';

  el('pm-date').value = todayISO();
  el('pm-week').value = getWeekOfMonth(new Date());

  let eqType = s.equipmentType || '';
  if (!eqType) {
    const nameLower = (s.equipment||'').toLowerCase();
    if (nameLower.includes('blower'))          eqType = 'blower';
    else if (nameLower.includes('belt'))       eqType = 'belt_conveyor';
    else if (nameLower.includes('bucket'))     eqType = 'bucket_elevator';
    else if (nameLower.includes('compressor')) eqType = 'compressor';
    else if (nameLower.includes('dust'))       eqType = 'dust_collector';
    else if (nameLower.includes('screw'))      eqType = 'screw_conveyor';
    else if (nameLower.includes('panel'))      eqType = 'electric_panel';
    else if (nameLower.includes('dryer'))      eqType = 'air_dryer';
    else if (nameLower.includes('gravity'))    eqType = 'gravity';
    else if (nameLower.includes('sheller'))    eqType = 'sheller';
    else if (nameLower.includes('cleaner'))    eqType = 'cleaner';
    else if (nameLower.includes('treater'))    eqType = 'treater';
    else if (nameLower.includes('packing'))    eqType = 'packing_machine';
    else if (nameLower.includes('sliding') || nameLower.includes('hopper')) eqType = 'sliding_gate';
  }
  if (eqType && el('pm-equipment-type')) { el('pm-equipment-type').value = eqType; loadPMTemplate(); }

  window._activeScheduleId = scheduleId;
  resetWOFormSession();   // sesi baru → WO dari pengisian sebelumnya tidak terbawa

  showPage('reports');
  toast(`▶ Eksekusi PM: ${s.equipment} — form sudah diisi otomatis`, 'success');
  setTimeout(() => el('page-reports')?.scrollIntoView({ behavior: 'smooth' }), 150);

  // refresh badge di halaman lain supaya user lain langsung lihat status terkunci
  renderScheduleList(); renderInputPMPage();
}

function clearPMForm(silent = false) {
  // Jika ada lock aktif dan form dibatalkan (bukan submit), lepas kuncinya
  // supaya equipment ini kembali bisa dikerjakan teknisi lain.
  if (window._activeScheduleId && !silent) {
    releasePMLock(window._activeScheduleId);
  }
  window._activeScheduleId = null;
  ['pm-tagno','pm-equipment-name','pm-unit','pm-area','pm-teknisi','pm-approval','pm-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value='';
  });
  document.getElementById('pm-equipment-type').value='';
  document.getElementById('pm-periode').value='Monthly';
  document.getElementById('pm-date').value = todayISO();
  document.getElementById('pm-week').value = getWeekOfMonth(new Date());
  ['pm-ppe-helm','pm-ppe-masker','pm-ppe-sarung-tangan','pm-ppe-earplug','pm-ppe-sepatu','pm-ppe-harness','pm-ppe-lain'].forEach(id => {
    const el=document.getElementById(id); if(el) el.checked=false;
  });
  document.getElementById('pm-aktivitas-section').style.display='none';
  document.getElementById('pm-aktivitas-tbody').innerHTML='';
  document.getElementById('pm-spareparts-container').innerHTML=`
    <div class="sparepart-row">
      <div class="sp-num">1</div>
      <input type="text" class="sp-input pm-sp-uraian" placeholder="Uraian">
      <input type="text" class="sp-input pm-sp-spec" placeholder="Spesifikasi">
      <input type="number" class="sp-input pm-sp-jumlah" placeholder="Qty" min="0">
      <button class="sp-del" onclick="removeSP(this)">✕</button>
    </div>`;
  document.getElementById('pm-edit-id').value = '';
  document.getElementById('pm-edit-banner').style.display = 'none';

  // Bersihkan jejak WO dari pengisian sebelumnya: sembunyikan bar anomali dan
  // mulai sesi form baru supaya tombol "Buat WO" kembali aktif untuk PM berikutnya.
  const woBar = document.getElementById('wo-summary-bar');
  if (woBar) woBar.style.display = 'none';
  resetWOFormSession();
  _updateChecklistProgress();

  if (!silent) toast('Form direset','info');
}

function previewCurrentForm() {
  const type = document.getElementById('pm-equipment-type').value;
  if (type && document.getElementById('pm-aktivitas-section').style.display==='none') loadPMTemplate();
  const data = collectPMData();
  if (!data.tagNo && !data.equipmentName) { toast('Isi form terlebih dahulu','info'); return; }
  data.id = 'PREVIEW-' + Date.now();
  openPDFOverlay(data);
}
