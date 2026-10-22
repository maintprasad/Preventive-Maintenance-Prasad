// ════════════════════════════════════════════════════════
//  SCHEDULE CRUD + TREE LIST
// ════════════════════════════════════════════════════════
// preset = { unit, area, year } — unit/area dari "Tambah Equipment" (Pengaturan); year = tahun rencana yang dibuka
// (dipakai modal Akhiri Tahun). Rencana PM diisi lewat kalender bulanan (lihat 23-plan.js).
function openScheduleModal(editId = null, preset = {}) {
  document.getElementById('sch-edit-id').value = editId || '';
  const now = new Date();
  if (editId) {
    const s = getData(STORE.SCHEDULES).find(x=>x.id===editId);
    if (!s) return;
    document.getElementById('schModalTitle').textContent = 'Edit Schedule PM';
    document.getElementById('sch-unit').value = s.unit||'';
    document.getElementById('sch-area').value = s.area||'';
    document.getElementById('sch-tagno').value = s.tagNo||'';
    document.getElementById('sch-eq-type').value = s.equipmentType||'';
    document.getElementById('sch-periode').value = s.periode||'Monthly';
    document.getElementById('sch-month').value = s.month||now.getMonth()+1;   // turunan dari kalender; dipakai bila jadwal lama belum punya tanggal
    document.getElementById('sch-week').value = s.week||1;
    document.getElementById('sch-pic').value = s.pic||'';
    document.getElementById('sch-last-done').value = s.lastDone||'';
    document.getElementById('sch-mp').value = s.mp||'';
    document.getElementById('sch-hari').value = s.hari||'';
    schPlanInit(s, preset.year);
    document.getElementById('sch-notes').value = s.notes||'';
  } else {
    document.getElementById('schModalTitle').textContent = 'Tambah Schedule PM';
    ['sch-unit','sch-area','sch-equipment-new','sch-tagno','sch-pic','sch-mp','sch-hari','sch-notes'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('sch-eq-type').value='';
    document.getElementById('sch-periode').value='Monthly';
    document.getElementById('sch-month').value=now.getMonth()+1;
    document.getElementById('sch-week').value=getWeekOfMonth(now);
    document.getElementById('sch-last-done').value='';
    schPlanInit(null, preset.year);
    if (preset.unit) document.getElementById('sch-unit').value = preset.unit;
    if (preset.area) document.getElementById('sch-area').value = preset.area;
  }
  refreshUnitAreaDatalists('sch-unit', 'sch-unit-list', 'sch-area-list');
  schRefreshEquipment(editId ? (getData(STORE.SCHEDULES).find(x=>x.id===editId)||{}).equipment : '');
  openOverlay('scheduleOverlay');
}

// ── Nama Equipment = dropdown bertingkat (Unit → Area → Equipment) ──
// Daftar diambil dari schedule yang sudah ada pada unit + area terpilih; "＋ Equipment baru…" membuka isian nama baru.
const SCH_EQ_NEW = '__new__';
function schEquipmentValue() {
  const v = document.getElementById('sch-equipment').value;
  return (v === SCH_EQ_NEW ? document.getElementById('sch-equipment-new').value : v).trim();
}
function schRefreshEquipment(keep) {
  const sel = document.getElementById('sch-equipment'), nw = document.getElementById('sch-equipment-new');
  if (!sel) return;
  const unit = document.getElementById('sch-unit').value.trim(), area = document.getElementById('sch-area').value.trim();
  const prev = keep !== undefined ? keep : (sel.value === SCH_EQ_NEW ? SCH_EQ_NEW : sel.value);
  if (!unit || !area) {
    sel.innerHTML = '<option value="">-- Pilih unit & area dulu --</option>'; sel.value = ''; nw.style.display = 'none'; return;
  }
  const names = [...new Set(getData(STORE.SCHEDULES).filter(s => s.unit === unit && s.area === area && s.equipment).map(s => s.equipment))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  sel.innerHTML = '<option value="">-- Pilih equipment (' + names.length + ') --</option>' +
    names.map(n => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>').join('') +
    '<option value="' + SCH_EQ_NEW + '">＋ Equipment baru…</option>';
  if (prev === SCH_EQ_NEW || names.includes(prev)) sel.value = prev;
  else sel.value = names.length ? '' : SCH_EQ_NEW;   // belum ada equipment di unit+area ini → langsung mode equipment baru
  nw.style.display = sel.value === SCH_EQ_NEW ? '' : 'none';
}
// Dipilih dari daftar → Tag No & tipe terisi otomatis dari schedule yang ada; "baru" → tampilkan isian nama
function schEquipmentChanged() {
  const sel = document.getElementById('sch-equipment'), nw = document.getElementById('sch-equipment-new');
  nw.style.display = sel.value === SCH_EQ_NEW ? '' : 'none';
  if (sel.value === SCH_EQ_NEW) { nw.focus(); return; }
  if (!sel.value || document.getElementById('sch-edit-id').value) return;
  const unit = document.getElementById('sch-unit').value.trim(), area = document.getElementById('sch-area').value.trim();
  const ref = getData(STORE.SCHEDULES).filter(s => s.unit === unit && s.area === area && s.equipment === sel.value)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
  if (!ref) return;
  if (!document.getElementById('sch-tagno').value.trim()) document.getElementById('sch-tagno').value = ref.tagNo || '';
  if (!document.getElementById('sch-eq-type').value) document.getElementById('sch-eq-type').value = ref.equipmentType || '';
}

async function saveSchedule() {
  const unit = document.getElementById('sch-unit').value.trim();
  const area = document.getElementById('sch-area').value.trim();
  const equipment = schEquipmentValue();
  const periode = document.getElementById('sch-periode').value;
  const editId = document.getElementById('sch-edit-id').value;

  // Rencana PM dari kalender. Bulan / minggu / hari kerja diturunkan dari tanggal pertama.
  const plan = schPlanGet();
  const derived = derivePlanFields(plan);
  let month = parseInt(document.getElementById('sch-month').value);
  let week = parseInt(document.getElementById('sch-week').value);
  let hari = document.getElementById('sch-hari').value ? parseInt(document.getElementById('sch-hari').value) : '';
  if (derived) { month = derived.month; week = derived.week; hari = derived.hari; }
  else if (!editId) { toast('Pilih minimal satu tanggal PM di kalender','error'); return; }   // jadwal baru wajib punya tanggal; jadwal lama boleh tetap memakai bulan + minggu lamanya

  if (!unit || !area || !equipment || !periode || !month || !week) {
    toast('Isi field wajib: Unit, Area, Nama Equipment, Periode, dan tanggal PM','error');
    return;
  }

  // FIX: preserve startDate asli saat edit, jangan dioverwrite ke hari ini
  let originalStartDate = todayISO();
  if (editId) {
    const existing = getData(STORE.SCHEDULES).find(s => s.id === editId);
    if (existing && existing.startDate) originalStartDate = existing.startDate;
  }

  const item = {
    id: editId || genId(),
    unit, area, equipment, periode, month, week, plan,
    tagNo: document.getElementById('sch-tagno').value.trim(),
    equipmentType: document.getElementById('sch-eq-type').value,
    pic: document.getElementById('sch-pic').value.trim(),
    lastDone: document.getElementById('sch-last-done').value,
    mp: document.getElementById('sch-mp').value ? parseInt(document.getElementById('sch-mp').value) : '',
    hari,
    notes: document.getElementById('sch-notes').value.trim(),
    startDate: originalStartDate,
    updatedAt: new Date().toISOString()
  };

  const schedules = getData(STORE.SCHEDULES);
  if (editId) {
    const idx = schedules.findIndex(s=>s.id===editId);
    if (idx!==-1) schedules[idx]=item; else schedules.push(item);
  } else schedules.push(item);
  setData(STORE.SCHEDULES, schedules);
  closeOverlay('scheduleOverlay');
  renderScheduleList();
  renderDashboard();
  renderInputPMPage();
  renderOutstandingPage();
  populateUnitFilters();
  updateSidebarBadges();
  toast(editId?'Schedule diperbarui':'Schedule ditambahkan','success');
  if (document.getElementById('yearEndOverlay')?.classList.contains('open')) yeRender();   // daftar Akhiri Tahun ikut diperbarui

  if (backendEnabled()) {
    // Backend Turso memakai UPSERT, jadi tambah & edit sama-sama 'saveSchedule'.
    const ok = await apiOrQueue('saveSchedule', { schedule: item }, item.id);
    if (ok) setSyncStatus('online', 'Schedule tersync ✓');
    else toast('⚠ Schedule gagal sync langsung, dimasukkan ke antrian', 'warning');
  }
}

const _treeState = {};

function schToggleUnit(unitKey) {
  const body = document.getElementById('tu-' + unitKey);
  const chev = document.getElementById('tc-' + unitKey);
  const hdr  = document.getElementById('th-' + unitKey);
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (chev) chev.classList.toggle('open', isOpen);
  if (hdr)  hdr.classList.toggle('open', isOpen);
  _treeState[unitKey] = isOpen;
}
function schToggleArea(areaKey) {
  const body = document.getElementById('ta-' + areaKey);
  const chev = document.getElementById('ac-' + areaKey);
  const hdr  = document.getElementById('ah-' + areaKey);
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (chev) chev.classList.toggle('open', isOpen);
  if (hdr)  hdr.classList.toggle('open', isOpen);
  _treeState[areaKey] = isOpen;
}
function schExpandAll() {
  document.querySelectorAll('.tree-folder-body').forEach(el => el.classList.add('open'));
  document.querySelectorAll('.tree-chevron').forEach(el => el.classList.add('open'));
  document.querySelectorAll('.tree-folder-hdr').forEach(el => el.classList.add('open'));
  document.querySelectorAll('.tree-area-body').forEach(el => el.classList.add('open'));
  document.querySelectorAll('.tree-area-hdr').forEach(el => el.classList.add('open'));
}
function schCollapseAll() {
  document.querySelectorAll('.tree-folder-body,.tree-area-body').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.tree-chevron').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.tree-folder-hdr,.tree-area-hdr').forEach(el => el.classList.remove('open'));
}

function onSchUnitChange() {
  const unit = document.getElementById('sch-filter-unit')?.value || '';
  const areaSel = document.getElementById('sch-filter-area');
  if (!areaSel) return;
  const schedules = getData(STORE.SCHEDULES);
  const areas = [...new Set(schedules.filter(s => !unit || s.unit === unit).map(s => s.area||'').filter(Boolean))].sort();
  areaSel.innerHTML = '<option value="">Semua Area</option>' + areas.map(a => `<option value="${a}">${a}</option>`).join('');
  renderScheduleList();
}

// Index laporan (_buildReportIndex) sekarang sudah dibatasi tahun berjalan,
// jadi cukup memakainya — dulu fungsi ini membaca & mem-parse SELURUH laporan
// dari localStorage sekali per schedule (lambat untuk ratusan equipment).
function _hasReportThisYear(s) { return hasReport(s); }

function renderScheduleList() {
  const schedules = getData(STORE.SCHEDULES);
  const search   = (document.getElementById('sch-search')?.value||'').toLowerCase();
  const unitF    = document.getElementById('sch-filter-unit')?.value||'';
  const areaF    = document.getElementById('sch-filter-area')?.value||'';
  const periodeF = document.getElementById('sch-filter-periode')?.value||'';
  const statusF  = document.getElementById('sch-filter-status')?.value||'';

  let filtered = schedules.filter(s => {
    if (search && ![(s.equipment||''),(s.unit||''),(s.area||''),(s.tagNo||'')].some(v=>v.toLowerCase().includes(search))) return false;
    if (unitF    && s.unit    !== unitF)    return false;
    if (areaF    && s.area    !== areaF)    return false;
    if (periodeF && s.periode !== periodeF) return false;
    if (statusF === 'done') {
      if (!_hasReportThisYear(s)) return false;
    } else if (statusF) {
      if (getScheduleStatus(s) !== statusF) return false;
      if (_hasReportThisYear(s)) return false;
    } else {
      if (_hasReportThisYear(s)) return false;
    }
    return true;
  });

  const container = document.getElementById('schedule-list');
  const countLbl  = document.getElementById('sch-count-lbl');
  if (countLbl) countLbl.textContent = `${filtered.length} dari ${schedules.length} equipment`;

  if (!filtered.length) {
    container.innerHTML = '<div class="empty"><div class="empty-ico">📅</div><div class="empty-msg">Belum ada schedule PM atau tidak ada yang sesuai filter.</div></div>';
    return;
  }

  const groups = {};
  filtered.forEach(s => {
    const unit = s.unit || '(Tanpa Unit)';
    const area = s.area || '(Tanpa Area)';
    if (!groups[unit]) groups[unit] = {};
    if (!groups[unit][area]) groups[unit][area] = [];
    groups[unit][area].push(s);
  });

  const statusColor = { overdue:'var(--red)', upcoming:'var(--orange)', done:'var(--green)' };
  let html = '';

  Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).forEach(([unit, areas]) => {
    const unitKey = btoa(encodeURIComponent(unit)).replace(/[^a-z0-9]/gi,'').slice(0,16);
    const unitItems = Object.values(areas).flat();
    const unitOverdue  = unitItems.filter(s => getScheduleStatus(s)==='overdue').length;
    const unitUpcoming = unitItems.filter(s => getScheduleStatus(s)==='upcoming').length;
    const unitDone     = unitItems.filter(s => getScheduleStatus(s)==='done').length;
    const isUnitOpen   = _treeState[unitKey] !== false;
    const forceOpen    = search || unitF || areaF || statusF;

    html += `<div class="tree-folder">
      <div class="tree-folder-hdr ${isUnitOpen||forceOpen?'open':''}" id="th-${unitKey}" onclick="schToggleUnit('${unitKey}')">
        <span class="tree-chevron ${isUnitOpen||forceOpen?'open':''}">▶</span>
        <span style="font-size:16px">🏭</span>
        <span class="tree-folder-label">${unit}</span>
        <span class="tree-folder-sub">${unitItems.length} equipment</span>
        <div class="tree-folder-badges">
          ${unitOverdue  ? `<span class="badge b-overdue">⚠ ${unitOverdue}</span>` : ''}
          ${unitUpcoming ? `<span class="badge b-upcoming">◎ ${unitUpcoming}</span>` : ''}
          ${unitDone     ? `<span class="badge b-done">✓ ${unitDone}</span>` : ''}
        </div>
      </div>
      <div class="tree-folder-body ${isUnitOpen||forceOpen?'open':''}" id="tu-${unitKey}">`;

    Object.entries(areas).sort(([a],[b])=>a.localeCompare(b)).forEach(([area, items]) => {
      const areaKey = (unitKey + btoa(encodeURIComponent(area)).replace(/[^a-z0-9]/gi,'').slice(0,12)).slice(0,24);
      const areaOverdue  = items.filter(s => getScheduleStatus(s)==='overdue').length;
      const areaUpcoming = items.filter(s => getScheduleStatus(s)==='upcoming').length;
      const isAreaOpen   = _treeState[areaKey] !== false;

      html += `<div class="tree-area-hdr ${isAreaOpen||forceOpen?'open':''}" id="ah-${areaKey}" onclick="schToggleArea('${areaKey}')">
        <span class="tree-chevron ${isAreaOpen||forceOpen?'open':''}" id="ac-${areaKey}">▶</span>
        <span style="font-size:13px">📍</span>
        <span class="tree-area-label">${area}</span>
        <span style="font-size:11px;color:var(--text3);font-family:'IBM Plex Mono',monospace">${items.length} item</span>
        <div style="display:flex;gap:4px">
          ${areaOverdue  ? `<span class="badge b-overdue">⚠ ${areaOverdue}</span>` : ''}
          ${areaUpcoming ? `<span class="badge b-upcoming">◎ ${areaUpcoming}</span>` : ''}
        </div>
      </div>
      <div class="tree-area-body ${isAreaOpen||forceOpen?'open':''}" id="ta-${areaKey}">`;

      items.sort((a,b) => { const o={overdue:0,upcoming:1,done:2}; return o[getScheduleStatus(a)] - o[getScheduleStatus(b)]; })
        .forEach(s => {
          const status   = getScheduleStatus(s);
          const nextDue  = getNextDue(s);
          const today    = new Date(); today.setHours(0,0,0,0);
          const diffDays = Math.floor((nextDue - today) / 86400000);
          const nextFmt  = nextDue.toLocaleDateString('id-ID',{day:'numeric',month:'short'});
          const lastFmt  = s.lastDone ? new Date(s.lastDone).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '—';
          const progColor = statusColor[status]||'var(--border)';
          const periodeBadge = {Daily:'b-daily',Weekly:'b-weekly',Monthly:'b-monthly',Quarterly:'b-quarterly','Semi-Annual':'b-quarterly',Annual:'b-yearly'}[s.periode]||'b-monthly';
          const statusTxt = status==='overdue'
            ? `<span style="color:var(--red);font-size:11px;font-weight:700">⚠ ${Math.abs(diffDays)} hari telat</span>`
            : status==='upcoming'
            ? `<span style="color:var(--orange);font-size:11px;font-weight:600">◎ ${diffDays} hari lagi</span>`
            : `<span style="color:var(--green);font-size:11px">✓ On Track</span>`;
          const locked = isLockedByOther(s.id);
          const pmCnt = pmCountThisYear(s);
          const eksekusiBtn = locked
            ? `<button class="tbl-btn" disabled title="Sedang dikerjakan teknisi lain">🔒 Dikerjakan</button>`
            : pmCnt > 0
            ? `<button class="tbl-btn" style="border-color:rgba(43,108,184,.45);color:var(--blue);font-weight:600" onclick="eksekusiPM('${s.id}')" title="Sudah di-PM ${pmCnt}× tahun ini — nomor PM akan melanjutkan">↻ PM Lagi (ke-${pmCnt + 1})</button>`
            : `<button class="tbl-btn" style="border-color:rgba(74,158,63,.4);color:var(--green2);font-weight:600" onmouseover="this.style.background='rgba(74,158,63,.08)'" onmouseout="this.style.background=''" onclick="eksekusiPM('${s.id}')">▶ Eksekusi</button>`;

          html += `<div class="tree-eq-row ${locked?'locked':''}">
            <div style="width:3px;height:36px;background:${progColor};border-radius:2px;flex-shrink:0"></div>
            <div class="tree-eq-name">
              <div style="font-weight:600">${s.equipment} ${lockBadgeHTML(s.id)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">
                <span class="badge ${periodeBadge}" style="font-size:9px;padding:1px 6px">${s.periode}</span>
                ${pmCnt > 0 ? `<span class="badge b-done" style="font-size:9px;padding:1px 6px;margin-left:4px">PM ${pmCnt}× ${new Date().getFullYear()}</span>` : ''}
                ${s.tagNo?`<span style="margin-left:4px">${s.tagNo}</span>`:''}
                ${s.pic?`<span style="margin-left:6px">👤 ${s.pic}</span>`:''}
              </div>
            </div>
            <div class="tree-eq-meta">
              <div style="text-align:right;font-size:11px">
                <div>${statusTxt}</div>
                <div style="color:var(--text3);margin-top:2px">📅 ${hasExplicitPlan(s, new Date().getFullYear()) ? planSummary(s, new Date().getFullYear()) : (MONTHS_ID[(s.month||1)-1] + ' W' + (s.week||'?'))} · Next: ${nextFmt}</div>
                <div style="color:var(--text3)">Terakhir: ${lastFmt}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0">
                ${eksekusiBtn}
                <button class="tbl-btn" onclick="openScheduleModal('${s.id}')">✏</button>
                <button class="tbl-btn del" onclick="deleteSchedule('${s.id}')">🗑</button>
              </div>
            </div>
          </div>`;
        });

      html += `</div></div>`;
    });

    html += `</div></div>`;
  });

  container.innerHTML = html;
}

function clearSchFilters() {
  ['sch-search','sch-filter-unit','sch-filter-area','sch-filter-periode','sch-filter-status'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const areaSel = document.getElementById('sch-filter-area');
  if (areaSel) {
    const schedules = getData(STORE.SCHEDULES);
    const areas = [...new Set(schedules.map(s=>s.area||'').filter(Boolean))].sort();
    areaSel.innerHTML = '<option value="">Semua Area</option>' + areas.map(a=>`<option value="${a}">${a}</option>`).join('');
  }
  renderScheduleList();
}

async function deleteSchedule(id) {
  document.getElementById('delete-confirm-msg').textContent = 'Hapus schedule PM ini?';
  resetDeleteConfirmBtn();
  document.getElementById('delete-confirm-btn').onclick = async () => {
    const schedules = getData(STORE.SCHEDULES).filter(s=>s.id!==id);
    setData(STORE.SCHEDULES, schedules);
    closeOverlay('deleteOverlay');
    renderScheduleList();
    renderDashboard();
    renderInputPMPage();
    renderOutstandingPage();
    populateUnitFilters();
    updateSidebarBadges();
    toast('Schedule dihapus','info');
    if (backendEnabled()) await apiOrQueue('deleteSchedule', { id }, id);
    releasePMLock(id); // jaga-jaga kalau schedule yang dihapus sedang terkunci
  };
  openOverlay('deleteOverlay');
}
