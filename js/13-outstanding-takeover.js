// ════════════════════════════════════════════════════════
//  OUTSTANDING PAGE
// ════════════════════════════════════════════════════════
function clearOstFilters() {
  ['ost-filter-period','ost-filter-unit','ost-filter-area','ost-filter-status','ost-filter-periode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = id === 'ost-filter-period' ? 'this_week' : '';
  });
  renderOutstandingPage();
}

function populateOstFilters(schedules) {
  const units = [...new Set(schedules.map(s => s.unit||'').filter(Boolean))].sort();
  const unitSel = document.getElementById('ost-filter-unit');
  if (unitSel) { const cur = unitSel.value; unitSel.innerHTML = '<option value="">Semua Unit</option>' + units.map(u=>`<option value="${u}">${u}</option>`).join(''); unitSel.value = cur; }
  const selUnit = unitSel?.value || '';
  const areas = [...new Set(schedules.filter(s=>!selUnit||s.unit===selUnit).map(s=>s.area||'').filter(Boolean))].sort();
  const areaSel = document.getElementById('ost-filter-area');
  if (areaSel) { const cur = areaSel.value; areaSel.innerHTML = '<option value="">Semua Area</option>' + areas.map(a=>`<option value="${a}">${a}</option>`).join(''); areaSel.value = cur; }
  const tkoUnit = document.getElementById('tko-filter-unit');
  if (tkoUnit) { const cur = tkoUnit.value; tkoUnit.innerHTML = '<option value="">Semua Unit</option>' + units.map(u=>`<option value="${u}">${u}</option>`).join(''); tkoUnit.value = cur; }
}

function renderOutstandingPage() {
  const schedules = getData(STORE.SCHEDULES);
  populateOstFilters(schedules);

  const periodF  = document.getElementById('ost-filter-period')?.value  || 'this_week';
  const unitF    = document.getElementById('ost-filter-unit')?.value    || '';
  const areaF    = document.getElementById('ost-filter-area')?.value    || '';
  const statusF  = document.getElementById('ost-filter-status')?.value  || '';
  const periodeF = document.getElementById('ost-filter-periode')?.value || '';

  const today = new Date(); today.setHours(0,0,0,0);
  const curMonth = today.getMonth() + 1;
  const curWeek  = getWeekOfMonth(today);

  let candidates = schedules.filter(s => {
    const st = getScheduleStatus(s);
    if (st === 'done') return false;
    if (unitF    && s.unit    !== unitF)    return false;
    if (areaF    && s.area    !== areaF)    return false;
    if (periodeF && s.periode !== periodeF) return false;
    if (statusF  && st        !== statusF)  return false;
    return true;
  });

  if (periodF === 'this_week') {
    candidates = candidates.filter(s => {
      const sMonth = parseInt(s.month) || curMonth;
      const sWeek  = parseInt(s.week)  || 1;
      const st     = getScheduleStatus(s);
      if (st === 'overdue') return true;
      return sMonth === curMonth && sWeek === curWeek;
    });
  } else if (periodF === 'this_month') {
    candidates = candidates.filter(s => {
      const sMonth = parseInt(s.month) || curMonth;
      const st     = getScheduleStatus(s);
      if (st === 'overdue') return true;
      return sMonth === curMonth;
    });
  }

  const order = { overdue:0, upcoming:1 };
  candidates.sort((a,b) => {
    const oa = order[getScheduleStatus(a)] ?? 2;
    const ob = order[getScheduleStatus(b)] ?? 2;
    if (oa !== ob) return oa - ob;
    return getNextDue(a) - getNextDue(b);
  });

  const allOst = schedules.filter(s => getScheduleStatus(s) !== 'done');
  const badge = document.getElementById('sb-outstanding-badge');
  if (badge) { badge.textContent = allOst.length; badge.style.display = allOst.length ? 'inline-block' : 'none'; }

  const countLbl = document.getElementById('ost-count-lbl');
  if (countLbl) countLbl.textContent = `${candidates.length} item ditemukan`;

  const overdueCnt  = candidates.filter(s => getScheduleStatus(s) === 'overdue').length;
  const upcomingCnt = candidates.filter(s => getScheduleStatus(s) === 'upcoming').length;
  const sumBar = document.getElementById('ost-summary-bar');
  if (sumBar) {
    if (candidates.length) {
      sumBar.style.display = 'block';
      sumBar.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap">
        ${overdueCnt  ? `<div style="flex:1;min-width:140px;padding:12px 16px;background:rgba(192,57,43,.07);border:1px solid rgba(192,57,43,.25);border-radius:var(--r);display:flex;align-items:center;gap:10px"><span style="font-size:22px;font-weight:800;color:var(--red)">${overdueCnt}</span><div><div style="font-size:11px;font-weight:700;color:var(--red)">OVERDUE</div><div style="font-size:10px;color:var(--text3)">melewati jadwal</div></div></div>` : ''}
        ${upcomingCnt ? `<div style="flex:1;min-width:140px;padding:12px 16px;background:rgba(230,126,34,.07);border:1px solid rgba(230,126,34,.25);border-radius:var(--r);display:flex;align-items:center;gap:10px"><span style="font-size:22px;font-weight:800;color:var(--orange)">${upcomingCnt}</span><div><div style="font-size:11px;font-weight:700;color:var(--orange)">UPCOMING</div><div style="font-size:10px;color:var(--text3)">akan jatuh tempo</div></div></div>` : ''}
      </div>`;
    } else sumBar.style.display = 'none';
  }

  const container = document.getElementById('outstanding-list');
  if (!container) return;

  if (!candidates.length) {
    container.innerHTML = `<div class="empty"><div class="empty-ico">✅</div><div class="empty-msg">Tidak ada outstanding PM untuk filter ini.</div></div>`;
    return;
  }

  const groups = {};
  candidates.forEach(s => { const unit = s.unit || '(Tanpa Unit)'; (groups[unit]=groups[unit]||[]).push(s); });

  container.innerHTML = Object.entries(groups).map(([unit, items]) => {
    const rows = items.map(s => {
      const status   = getScheduleStatus(s);
      const nextDue  = getNextDue(s);
      const diffDays = Math.floor((nextDue - today) / 86400000);
      const nextFmt  = nextDue.toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'});
      const lastFmt  = s.lastDone ? new Date(s.lastDone).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '—';
      const isOverdue = status === 'overdue';
      const sMonth = parseInt(s.month) || curMonth;
      const sWeek  = parseInt(s.week)  || 1;
      const isPastMonth = isOverdue && (sMonth < curMonth || (sMonth === 12 && curMonth === 1));
      const urgencyColor = isOverdue ? 'var(--red)' : 'var(--orange)';
      const urgencyBg    = isOverdue ? 'rgba(192,57,43,.06)' : 'rgba(230,126,34,.06)';
      const diffLabel    = isOverdue ? `<strong style="color:var(--red)">⚠ ${Math.abs(diffDays)} hari telat</strong>` : `<span style="color:var(--orange)">◎ ${diffDays} hari lagi</span>`;
      const locked = isLockedByOther(s.id);
      const actionBtn = locked
        ? `<button class="btn-ghost" style="font-size:11px;padding:6px 12px" disabled>🔒 Dikerjakan</button>`
        : `<button class="btn-primary" style="font-size:11px;padding:6px 12px" onclick="eksekusiPM('${s.id}')">▶ Eksekusi</button>`;

      return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);background:${urgencyBg};border-left:3px solid ${urgencyColor};margin-bottom:2px;border-radius:0 5px 5px 0">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:13px">${s.equipment}</span>
            ${s.tagNo?`<span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent)">${s.tagNo}</span>`:''}
            <span class="badge ${isOverdue?'b-overdue':'b-upcoming'}">${isOverdue?'OVERDUE':'UPCOMING'}</span>
            ${isPastMonth?`<span class="badge" style="background:rgba(230,126,34,.15);color:var(--orange);border:1px solid rgba(230,126,34,.3);font-size:9px">PAST MONTH</span>`:''}
            ${lockBadgeHTML(s.id)}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">📍 ${s.area||'—'} &nbsp;·&nbsp; 🔄 ${s.periode} &nbsp;·&nbsp; 📅 ${MONTHS_ID[(sMonth)-1]} W${sWeek} ${s.pic?`&nbsp;·&nbsp; 👤 ${s.pic}`:''}</div>
          <div style="font-size:11px;margin-top:4px;display:flex;gap:16px;flex-wrap:wrap"><span>${diffLabel}</span><span style="color:var(--text3)">Next: ${nextFmt}</span><span style="color:var(--text3)">Terakhir: ${lastFmt}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          ${actionBtn}
          ${isPastMonth && !locked ? `<button class="btn-orange" style="font-size:11px;padding:6px 12px" onclick="openTakeoverModal('${s.id}')">🔄 Takeover</button>` : ''}
        </div>
      </div>`;
    }).join('');

    const unitOverdue = items.filter(s=>getScheduleStatus(s)==='overdue').length;
    return `<div style="margin-bottom:14px">
      <div style="padding:8px 14px;background:var(--navy);border-radius:var(--r) var(--r) 0 0;display:flex;align-items:center;gap:10px">
        <span style="font-size:13px">🏭</span><span style="font-weight:700;color:#fff;font-size:13px;flex:1">${unit}</span>
        ${unitOverdue ? `<span class="badge b-overdue" style="font-size:9px">⚠ ${unitOverdue} overdue</span>` : ''}
        <span style="font-size:11px;color:rgba(255,255,255,.5)">${items.length} item</span>
      </div>
      <div style="border:1px solid var(--border);border-top:none;border-radius:0 0 var(--r) var(--r);overflow:hidden">${rows}</div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
//  TAKEOVER PM PAGE
// ════════════════════════════════════════════════════════
function clearTkoFilters() {
  ['tko-filter-unit','tko-filter-area','tko-filter-periode'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderTakeoverPage();
}

function renderTakeoverPage() {
  const schedules = getData(STORE.SCHEDULES);
  const today = new Date(); today.setHours(0,0,0,0);
  const curMonth = today.getMonth() + 1;
  const curYear  = today.getFullYear();

  const units = [...new Set(schedules.map(s=>s.unit||'').filter(Boolean))].sort();
  const tkoUnit = document.getElementById('tko-filter-unit');
  if (tkoUnit) { const cur = tkoUnit.value; tkoUnit.innerHTML = '<option value="">Semua Unit</option>' + units.map(u=>`<option value="${u}">${u}</option>`).join(''); tkoUnit.value = cur; }
  const selUnit = tkoUnit?.value || '';
  const areas = [...new Set(schedules.filter(s=>!selUnit||s.unit===selUnit).map(s=>s.area||'').filter(Boolean))].sort();
  const tkoArea = document.getElementById('tko-filter-area');
  if (tkoArea) { const cur = tkoArea.value; tkoArea.innerHTML = '<option value="">Semua Area</option>' + areas.map(a=>`<option value="${a}">${a}</option>`).join(''); tkoArea.value = cur; }

  const unitF    = tkoUnit?.value    || '';
  const areaF    = tkoArea?.value    || '';
  const periodeF = document.getElementById('tko-filter-periode')?.value || '';

  const pastMonth = schedules.filter(s => {
    const sMonth = parseInt(s.month) || 0;
    const st     = getScheduleStatus(s);
    if (st !== 'overdue') return false;
    if (!sMonth) return false;
    const isPast = sMonth < curMonth || (sMonth > curMonth && sMonth >= 10 && curMonth <= 3);
    if (!isPast) return false;
    if (unitF    && s.unit    !== unitF)    return false;
    if (areaF    && s.area    !== areaF)    return false;
    if (periodeF && s.periode !== periodeF) return false;
    return true;
  });

  const badge = document.getElementById('sb-takeover-badge');
  if (badge) { badge.textContent = pastMonth.length; badge.style.display = pastMonth.length ? 'inline-block' : 'none'; }

  const container = document.getElementById('takeover-list');
  if (!container) return;

  if (!pastMonth.length) {
    container.innerHTML = `<div class="empty"><div class="empty-ico">✅</div><div class="empty-msg">Tidak ada PM yang perlu di-takeover.<br><span style="font-size:12px">PM takeover muncul ketika jadwal sudah melewati bulannya.</span></div></div>`;
    return;
  }

  const nowMonLabel = MONTHS_ID[curMonth - 1];

  container.innerHTML = `
    <div style="margin-bottom:14px;padding:12px 16px;background:rgba(230,126,34,.07);border:1px solid rgba(230,126,34,.3);border-radius:var(--r)">
      <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--orange);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">ℹ Tentang Takeover PM</div>
      <div style="font-size:12px;color:var(--text2)">Takeover memindahkan jadwal PM yang terlewat ke <strong>${nowMonLabel} ${curYear}</strong> (bulan ini). Schedule lama akan diperbarui ke bulan & minggu baru agar tidak hilang dari radar.</div>
    </div>
    ${pastMonth.map(s => {
      const sMonth   = parseInt(s.month) || curMonth;
      const sWeek    = parseInt(s.week)  || 1;
      const nextDue  = getNextDue(s);
      const diffDays = Math.floor((today - nextDue) / 86400000);
      const lastFmt  = s.lastDone ? new Date(s.lastDone).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : 'Belum pernah';
      const locked = isLockedByOther(s.id);
      return `<div style="background:var(--bg2);border:1px solid rgba(230,126,34,.3);border-left:3px solid var(--orange);border-radius:var(--r);padding:14px 16px;margin-bottom:8px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <span style="font-weight:700;font-size:14px">${s.equipment}</span>
              ${s.tagNo?`<span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent)">${s.tagNo}</span>`:''}
              <span class="badge b-overdue">OVERDUE ${diffDays}h</span>
              ${lockBadgeHTML(s.id)}
            </div>
            <div style="font-size:12px;color:var(--text2);margin-bottom:4px">🏭 ${s.unit||'—'} &nbsp;·&nbsp; 📍 ${s.area||'—'} &nbsp;·&nbsp; 🔄 ${s.periode} ${s.pic?`&nbsp;·&nbsp; 👤 ${s.pic}`:''}</div>
            <div style="display:flex;gap:16px;font-size:11px;color:var(--text3);flex-wrap:wrap"><span>📅 Dijadwalkan: <strong style="color:var(--orange)">${MONTHS_ID[sMonth-1]} Minggu ${sWeek}</strong></span><span>Terakhir PM: <strong>${lastFmt}</strong></span></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;min-width:140px">
            <button class="btn-orange" style="font-size:11px;padding:7px 14px;width:100%" onclick="openTakeoverModal('${s.id}')">🔄 Takeover ke Bulan Ini</button>
            ${locked ? `<button class="btn-ghost" style="font-size:11px;padding:7px 14px;width:100%" disabled>🔒 Sedang Dikerjakan</button>`
                     : `<button class="btn-primary" style="font-size:11px;padding:7px 14px;width:100%" onclick="eksekusiPM('${s.id}')">▶ Eksekusi Langsung</button>`}
          </div>
        </div>
      </div>`;
    }).join('')}`;
}

function openTakeoverModal(schedId) {
  const s = getData(STORE.SCHEDULES).find(x => x.id === schedId);
  if (!s) return;
  const today    = new Date();
  const curMonth = today.getMonth() + 1;
  const curWeek  = getWeekOfMonth(today);
  const sMonth   = parseInt(s.month) || curMonth;
  const sWeek    = parseInt(s.week)  || 1;

  const info = `
    <div style="margin-bottom:12px;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:7px">
      <div style="font-weight:600;font-size:13px">${s.equipment}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">${s.unit||'—'} · ${s.area||'—'} · ${s.periode}<br>Jadwal lama: <strong style="color:var(--orange)">${MONTHS_ID[sMonth-1]} Minggu ${sWeek}</strong></div>
    </div>
    <div class="form-grid">
      <div class="fg"><span class="flabel">Pindah ke Bulan *</span><select class="fsel2" id="tko-new-month">${MONTHS_ID.map((m,i)=>`<option value="${i+1}" ${i+1===curMonth?'selected':''}>${m}</option>`).join('')}</select></div>
      <div class="fg"><span class="flabel">Minggu Ke *</span><select class="fsel2" id="tko-new-week">${[1,2,3,4,5].map(w=>`<option value="${w}" ${w===curWeek?'selected':''}>${w}</option>`).join('')}</select></div>
      <div class="fg full"><span class="flabel">Alasan Takeover</span><textarea class="ftextarea" id="tko-reason" rows="2" placeholder="Contoh: Tidak ada teknisi tersedia di minggu tsb, mesin sedang beroperasi penuh..."></textarea></div>
    </div>`;

  document.getElementById('delete-confirm-msg').innerHTML = info;
  document.getElementById('delete-confirm-btn').textContent = '🔄 TAKEOVER';
  document.getElementById('delete-confirm-btn').className = 'btn-orange';
  document.getElementById('delete-confirm-btn').onclick = () => executeTakeover(schedId);
  openOverlay('deleteOverlay');
}

function executeTakeover(schedId) {
  const schedules = getData(STORE.SCHEDULES);
  const s = schedules.find(x => x.id === schedId);
  if (!s) { toast('Schedule tidak ditemukan','error'); return; }

  const newMonth = parseInt(document.getElementById('tko-new-month')?.value);
  const newWeek  = parseInt(document.getElementById('tko-new-week')?.value);
  const reason   = document.getElementById('tko-reason')?.value?.trim() || '';
  if (!newMonth || !newWeek) { toast('Pilih bulan dan minggu tujuan','error'); return; }

  const oldMonth = s.month, oldWeek = s.week;
  s.month = newMonth; s.week = newWeek;
  s.takeoverAt = new Date().toISOString();
  s.updatedAt  = s.takeoverAt;
  s.takeoverFrom = `${MONTHS_ID[(oldMonth||1)-1]} W${oldWeek}`;
  s.takeoverReason = reason;

  setData(STORE.SCHEDULES, schedules);
  closeOverlay('deleteOverlay');
  document.getElementById('delete-confirm-btn').textContent = '🗑 HAPUS';
  document.getElementById('delete-confirm-btn').className = 'btn-red';

  renderTakeoverPage(); renderOutstandingPage(); renderScheduleList(); renderDashboard(); renderInputPMPage(); updateSidebarBadges();
  toast(`🔄 PM "${s.equipment}" berhasil di-takeover ke ${MONTHS_ID[newMonth-1]} Minggu ${newWeek}`, 'success');

  if (backendEnabled()) apiOrQueue('saveSchedule', { schedule: s }, s.id);
}

function bulkTakeover() {
  const schedules = getData(STORE.SCHEDULES);
  const today = new Date(); today.setHours(0,0,0,0);
  const curMonth = today.getMonth() + 1;
  const curWeek  = getWeekOfMonth(today);
  const unitF    = document.getElementById('tko-filter-unit')?.value  || '';
  const areaF    = document.getElementById('tko-filter-area')?.value  || '';
  const periodeF = document.getElementById('tko-filter-periode')?.value || '';

  const toTakeover = schedules.filter(s => {
    const sMonth = parseInt(s.month) || 0;
    const st     = getScheduleStatus(s);
    if (st !== 'overdue') return false;
    if (!sMonth || sMonth >= curMonth) return false;
    if (unitF    && s.unit    !== unitF)    return false;
    if (areaF    && s.area    !== areaF)    return false;
    if (periodeF && s.periode !== periodeF) return false;
    return true;
  });

  if (!toTakeover.length) { toast('Tidak ada yang perlu di-takeover','info'); return; }

  document.getElementById('delete-confirm-msg').innerHTML = `
    <div style="color:var(--text2)">Takeover <strong>${toTakeover.length} schedule</strong> ke <strong>${MONTHS_ID[curMonth-1]} Minggu ${curWeek}</strong>?</div>
    <div style="font-size:12px;color:var(--text3);margin-top:8px">${toTakeover.map(s=>s.equipment).join(', ')}</div>`;
  document.getElementById('delete-confirm-btn').textContent = '🔄 TAKEOVER SEMUA';
  document.getElementById('delete-confirm-btn').className = 'btn-orange';
  document.getElementById('delete-confirm-btn').onclick = () => {
    toTakeover.forEach(s => {
      const oldMonth = s.month, oldWeek = s.week;
      s.month = curMonth; s.week = curWeek;
      s.takeoverAt = new Date().toISOString();
      s.updatedAt  = s.takeoverAt;
      s.takeoverFrom = `${MONTHS_ID[(oldMonth||1)-1]} W${oldWeek}`;
      s.takeoverReason = 'Bulk takeover';
    });
    setData(STORE.SCHEDULES, schedules);
    if (backendEnabled()) toTakeover.forEach(s => apiOrQueue('saveSchedule', { schedule: s }, s.id));
    closeOverlay('deleteOverlay');
    resetDeleteConfirmBtn();
    renderTakeoverPage(); renderOutstandingPage(); renderScheduleList(); renderDashboard(); renderInputPMPage(); updateSidebarBadges();
    toast(`🔄 ${toTakeover.length} schedule di-takeover ke ${MONTHS_ID[curMonth-1]} Minggu ${curWeek}`, 'success');
  };
  openOverlay('deleteOverlay');
}
