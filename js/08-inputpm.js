// ════════════════════════════════════════════════════════
//  INPUT PM PAGE
// ════════════════════════════════════════════════════════
function onInputPMUnitChange() {
  const unit = document.getElementById('ipm-filter-unit')?.value || '';
  const schedules = getData(STORE.SCHEDULES);
  const areas = [...new Set(schedules.filter(s => !unit || s.unit === unit).map(s=>s.area||'').filter(Boolean))].sort();
  const areaSel = document.getElementById('ipm-filter-area');
  if (areaSel) areaSel.innerHTML = '<option value="">Semua Area</option>' + areas.map(a=>`<option value="${a}">${a}</option>`).join('');
  renderInputPMPage();
}

function resetInputPMFilter() {
  const u = document.getElementById('ipm-filter-unit');
  const a = document.getElementById('ipm-filter-area');
  if (u) u.value = '';
  if (a) a.innerHTML = '<option value="">Semua Area</option>';
  renderInputPMPage();
}

function populateInputPMUnitFilter() {
  const schedules = getData(STORE.SCHEDULES);
  const units = [...new Set(schedules.map(s=>s.unit||'').filter(Boolean))].sort();
  const unitSel = document.getElementById('ipm-filter-unit');
  if (!unitSel) return;
  const cur = unitSel.value;
  unitSel.innerHTML = '<option value="">Semua Unit</option>' + units.map(u=>`<option value="${u}">${u}</option>`).join('');
  unitSel.value = cur;
}

function renderInputPMPage() {
  const schedules = getData(STORE.SCHEDULES);
  const today     = new Date(); today.setHours(0,0,0,0);
  const curMonth  = today.getMonth() + 1;
  const curWeek   = getWeekOfMonth(today);
  const unitF     = document.getElementById('ipm-filter-unit')?.value  || '';
  const areaF     = document.getElementById('ipm-filter-area')?.value  || '';

  const day = today.getDay();
  const diffMon = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(today); weekStart.setDate(today.getDate() + diffMon);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const weekLbl = document.getElementById('ipm-week-label');
  if (weekLbl) weekLbl.textContent = `${weekStart.toLocaleDateString('id-ID',{day:'numeric',month:'short'})} – ${weekEnd.toLocaleDateString('id-ID',{day:'numeric',month:'short'})}`;

  populateInputPMUnitFilter();

  const tugasList = schedules.filter(s => {
    const st     = getScheduleStatus(s);
    const sMonth = parseInt(s.month) || curMonth;
    const sWeek  = parseInt(s.week)  || 1;
    if (st === 'done') return false;
    if (unitF && s.unit !== unitF) return false;
    if (areaF && s.area !== areaF) return false;
    if (st === 'overdue') return true;
    return sMonth === curMonth && sWeek === curWeek;
  });

  const allThisWeek = schedules.filter(s => {
    const sMonth = parseInt(s.month) || curMonth;
    const sWeek  = parseInt(s.week)  || 1;
    const st     = getScheduleStatus(s);
    if (unitF && s.unit !== unitF) return false;
    if (areaF && s.area !== areaF) return false;
    return (sMonth === curMonth && sWeek === curWeek) || st === 'overdue';
  });
  const totalAll = allThisWeek.length;
  const doneAll  = allThisWeek.filter(s => getScheduleStatus(s) === 'done').length;
  const pctAll   = totalAll ? Math.round(doneAll / totalAll * 100) : 0;

  const progBar = document.getElementById('ipm-progress-bar');
  const progTxt = document.getElementById('ipm-progress-txt');
  if (progBar) progBar.style.width = pctAll + '%';
  if (progTxt) progTxt.textContent = `${doneAll}/${totalAll} selesai`;

  const container = document.getElementById('ipm-list');
  if (!container) return;

  if (!tugasList.length) {
    container.innerHTML = `<div class="empty"><div class="empty-ico">✅</div><div class="empty-msg">Tidak ada tugas untuk filter ini.</div></div>`;
    return;
  }

  const sortOrder = { overdue:0, upcoming:1 };
  tugasList.sort((a,b) => (sortOrder[getScheduleStatus(a)]??2) - (sortOrder[getScheduleStatus(b)]??2));

  const groups = {};
  tugasList.forEach(s => { const u = s.unit || '(Tanpa Unit)'; (groups[u] = groups[u]||[]).push(s); });

  container.innerHTML = Object.entries(groups).map(([unit, items]) => {
    const rows = items.map(s => {
      const st        = getScheduleStatus(s);
      const isOverdue = st === 'overdue';
      const nextDue   = getNextDue(s);
      const diffDays  = Math.floor((nextDue - today) / 86400000);
      const sMonth    = parseInt(s.month) || curMonth;
      const sWeek     = parseInt(s.week)  || 1;
      const leftBorder = isOverdue ? 'var(--red)' : 'var(--orange)';
      const statusPill = isOverdue
        ? `<span style="background:rgba(192,57,43,.12);color:var(--red);font-family:'IBM Plex Mono',monospace;font-size:9px;padding:2px 8px;border-radius:3px;font-weight:700;border:1px solid rgba(192,57,43,.3)">⚠ OVERDUE ${Math.abs(diffDays)} hari</span>`
        : `<span style="background:rgba(230,126,34,.1);color:var(--orange);font-family:'IBM Plex Mono',monospace;font-size:9px;padding:2px 8px;border-radius:3px;border:1px solid rgba(230,126,34,.25)">MINGGU INI</span>`;

      const locked = isLockedByOther(s.id);
      const kerjakanBtn = locked
        ? `<button class="btn-ghost" style="font-size:11px;padding:8px 14px;flex-shrink:0" disabled>🔒 Dikerjakan</button>`
        : `<button onclick="eksekusiPM('${s.id}')" class="btn-primary" style="font-size:11px;padding:8px 14px;flex-shrink:0">▶ Kerjakan</button>`;

      return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);border-left:3px solid ${leftBorder}">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-weight:700;font-size:13px">${s.equipment}</span>
            ${s.tagNo?`<span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent)">${s.tagNo}</span>`:''}
            ${statusPill}
            ${lockBadgeHTML(s.id)}
          </div>
          <div style="font-size:11px;color:var(--text3)">
            📍 ${s.area||'—'} &nbsp;·&nbsp; 🔄 ${s.periode}
            ${s.pic?`&nbsp;·&nbsp; 👤 ${s.pic}`:''}
            &nbsp;·&nbsp; 📅 ${MONTHS_ID[sMonth-1]} W${sWeek}
          </div>
        </div>
        ${kerjakanBtn}
      </div>`;
    }).join('');

    return `<div class="tbl-wrap" style="margin-bottom:14px">
      <div style="padding:10px 16px;background:var(--navy);display:flex;align-items:center;gap:8px">
        <span style="font-size:13px">🏭</span>
        <span style="font-weight:700;color:#fff;font-size:13px;flex:1">${unit}</span>
        <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:rgba(255,255,255,.5)">${items.length} tugas</span>
      </div>
      ${rows}
    </div>`;
  }).join('');
}
