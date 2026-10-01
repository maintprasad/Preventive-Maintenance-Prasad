// ════════════════════════════════════════════════════════
//  CALENDAR VIEW — Month Picker + Gantt Mingguan
// ════════════════════════════════════════════════════════
let _calSelectedMonth = null;
let _calSelectedYear  = null;

function renderCalendar() {
  const now = new Date();
  const yearSel = document.getElementById('cal-year-sel');
  const curYear = now.getFullYear();
  if (yearSel && !yearSel.options.length) {
    for (let y = curYear - 1; y <= curYear + 1; y++) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      if (y === curYear) opt.selected = true;
      yearSel.appendChild(opt);
    }
  }
  const year = parseInt(yearSel?.value || curYear);
  if (!_calSelectedYear) _calSelectedYear = year;
  if (!_calSelectedMonth) _calSelectedMonth = now.getMonth() + 1;

  _renderMonthPills(year);
  renderCalMonthView();
}

function calShiftYear(dir) {
  const yearSel = document.getElementById('cal-year-sel');
  if (!yearSel) return;
  const newYear = parseInt(yearSel.value) + dir;
  let found = false;
  for (let opt of yearSel.options) { if (parseInt(opt.value) === newYear) { opt.selected = true; found = true; break; } }
  if (!found) {
    const opt = document.createElement('option');
    opt.value = newYear; opt.textContent = newYear; opt.selected = true;
    yearSel.appendChild(opt);
    const opts = Array.from(yearSel.options).sort((a,b)=>parseInt(a.value)-parseInt(b.value));
    yearSel.innerHTML = '';
    opts.forEach(o => yearSel.appendChild(o));
    yearSel.value = newYear;
  }
  _calSelectedYear = newYear;
  renderCalendar();
}

function _renderMonthPills(year) {
  const pills = document.getElementById('cal-month-pills');
  if (!pills) return;
  const now      = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  const schedules = getData(STORE.SCHEDULES);
  const reports   = getData(STORE.REPORTS);

  const monthStats = {};
  for (let m = 1; m <= 12; m++) {
    const schThisMonth = schedules.filter(s => {
      const sMonth = parseInt(s.month) || 0;
      if (!sMonth) return false;
      if (s.periode === 'Monthly') return sMonth === m;
      if (s.periode === 'Weekly')  return true;
      if (s.periode === 'Daily')   return true;
      if (s.periode === 'Quarterly')   return ((m - sMonth) % 3 === 0) && m >= sMonth;
      if (s.periode === 'Semi-Annual') return ((m - sMonth) % 6 === 0) && m >= sMonth;
      if (s.periode === 'Annual')      return sMonth === m;
      return sMonth === m;
    });
    let done = 0, overdue = 0, upcoming = 0;
    schThisMonth.forEach(s => {
      const rep = _checkHasReport(s, m, year, reports);
      if (rep) { done++; return; }
      const isPast = year < curYear || (year === curYear && m < curMonth);
      const isCur  = year === curYear && m === curMonth;
      if (isPast) overdue++;
      else if (isCur) { const st = getScheduleStatus(s); if (st === 'overdue') overdue++; else upcoming++; }
      else upcoming++;
    });
    monthStats[m] = { total: schThisMonth.length, done, overdue, upcoming };
  }

  pills.innerHTML = MONTHS_ID.map((name, i) => {
    const m    = i + 1;
    const stat = monthStats[m] || { total:0, done:0, overdue:0, upcoming:0 };
    const isActive  = _calSelectedMonth === m && _calSelectedYear === year;
    const isCurMon  = m === curMonth && year === curYear;
    const dots = [];
    if (stat.done)     dots.push(`<div class="cal-pill-dot cal-pill-done" title="${stat.done} selesai"></div>`);
    if (stat.overdue)  dots.push(`<div class="cal-pill-dot cal-pill-overdue" title="${stat.overdue} overdue"></div>`);
    if (stat.upcoming) dots.push(`<div class="cal-pill-dot cal-pill-upcoming" title="${stat.upcoming} pending"></div>`);
    if (!stat.total)   dots.push(`<div class="cal-pill-dot cal-pill-empty"></div>`);
    return `<div class="cal-month-pill ${isActive?'active':''} ${isCurMon?'cur-month':''}" onclick="selectCalMonth(${m}, ${year})" title="${name} — ${stat.total} equipment">
      <div class="cal-pill-name">${name.slice(0,3)}</div>
      <div class="cal-pill-counts">${dots.join('')}</div>
      <div class="cal-pill-badge">${stat.total || '—'}</div>
    </div>`;
  }).join('');
}

function selectCalMonth(month, year) {
  _calSelectedMonth = month;
  _calSelectedYear  = year;
  document.querySelectorAll('.cal-month-pill').forEach((el, i) => el.classList.toggle('active', i + 1 === month));
  const fb = document.getElementById('cal-filter-bar-2');
  if (fb) fb.style.display = 'block';
  const schedules = getData(STORE.SCHEDULES);
  const units = [...new Set(schedules.map(s=>s.unit||'').filter(Boolean))].sort();
  const unitSel = document.getElementById('cal-filter-unit');
  if (unitSel) { const cur = unitSel.value; unitSel.innerHTML = '<option value="">Semua Unit</option>' + units.map(u=>`<option value="${u}">${u}</option>`).join(''); unitSel.value = cur; }
  renderCalMonthView();
}

// FIX: sebelumnya onCalUnitChange() dan clearCalFilters() didefinisikan DUA
// KALI di file monolith (definisi kedua identik menimpa yang pertama) —
// sekarang cukup satu definisi bersih di sini.
function onCalUnitChange() {
  const unit    = document.getElementById('cal-filter-unit')?.value || '';
  const areaSel = document.getElementById('cal-filter-area');
  if (!areaSel) return;
  const schedules = getData(STORE.SCHEDULES);
  const areas = [...new Set(schedules.filter(s => !unit || s.unit === unit).map(s=>s.area||'').filter(Boolean))].sort();
  areaSel.innerHTML = '<option value="">Semua Area</option>' + areas.map(a=>`<option value="${a}">${a}</option>`).join('');
  renderCalMonthView();
}
function clearCalFilters() {
  ['cal-filter-unit','cal-filter-area','cal-filter-status'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderCalMonthView();
}

function renderCalMonthView() {
  const month = _calSelectedMonth;
  const year  = _calSelectedYear;
  if (!month || !year) return;

  const now      = new Date(); now.setHours(0,0,0,0);
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  const curWeek  = getWeekOfMonth(now);

  const allSchedules = getData(STORE.SCHEDULES);
  const reports      = getData(STORE.REPORTS);

  const unitF   = document.getElementById('cal-filter-unit')?.value   || '';
  const areaF   = document.getElementById('cal-filter-area')?.value   || '';
  const statusF = document.getElementById('cal-filter-status')?.value || '';

  const sub = document.getElementById('cal-view-sub');
  if (sub) sub.textContent = `${MONTHS_ID[month-1]} ${year} — Gantt Mingguan`;

  let scheduled = allSchedules.filter(s => {
    const sMonth = parseInt(s.month) || 0;
    if (!sMonth) return false;
    let inMonth = false;
    if (s.periode === 'Monthly')     inMonth = sMonth === month;
    else if (s.periode === 'Weekly') inMonth = true;
    else if (s.periode === 'Daily')  inMonth = true;
    else if (s.periode === 'Quarterly')   inMonth = ((month - sMonth) % 3 === 0) && month >= sMonth;
    else if (s.periode === 'Semi-Annual') inMonth = ((month - sMonth) % 6 === 0) && month >= sMonth;
    else if (s.periode === 'Annual')      inMonth = sMonth === month;
    else inMonth = sMonth === month;
    if (!inMonth) return false;
    if (unitF && s.unit !== unitF) return false;
    if (areaF && s.area !== areaF) return false;
    return true;
  });

  const withStatus = scheduled.map(s => {
    const rep = _checkHasReport(s, month, year, reports);
    const latestReport = _getLatestReport(s, month, year, reports);
    let status;
    if (rep) status = 'done';
    else {
      const isPast = year < curYear || (year === curYear && month < curMonth);
      const isCur  = year === curYear && month === curMonth;
      if (isPast) status = 'overdue';
      else if (isCur) status = getScheduleStatus(s) === 'overdue' ? 'overdue' : 'upcoming';
      else status = 'future';
    }
    return { ...s, _status: status, _report: latestReport };
  });

  const filtered = statusF ? withStatus.filter(s => s._status === statusF) : withStatus;

  const total    = filtered.length;
  const done     = filtered.filter(s => s._status === 'done').length;
  const overdue  = filtered.filter(s => s._status === 'overdue').length;
  const upcoming = filtered.filter(s => s._status === 'upcoming' || s._status === 'future').length;
  const pct      = total ? Math.round(done / total * 100) : 0;
  const pctColor = pct === 100 ? 'var(--green)' : pct >= 60 ? 'var(--orange)' : 'var(--red)';

  const sumBar = document.getElementById('cal-summary-bar');
  if (sumBar) {
    sumBar.style.display = 'block';
    sumBar.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:10px">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text3);letter-spacing:.06em;text-transform:uppercase">${MONTHS_ID[month-1]} ${year} — ${total} Equipment Terjadwal</div>
          <div style="font-size:22px;font-weight:800;color:${pctColor};font-family:'IBM Plex Mono',monospace">${pct}%<span style="font-size:12px;font-weight:400;color:var(--text3)"> selesai</span></div>
        </div>
        <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:12px">
          <div style="height:100%;width:${pct}%;background:${pctColor};border-radius:4px;transition:width .4s ease"></div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:var(--green)"></div><span style="font-size:12px"><strong style="color:var(--green2)">${done}</strong> Sudah PM</span></div>
          <div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:var(--red)"></div><span style="font-size:12px"><strong style="color:var(--red)">${overdue}</strong> Overdue</span></div>
          <div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:var(--orange)"></div><span style="font-size:12px"><strong style="color:var(--orange)">${upcoming}</strong> Belum</span></div>
        </div>
      </div>`;
  }

  const legend = document.getElementById('gantt-legend');
  const container = document.getElementById('cal-month-list');
  if (!container) return;

  if (!filtered.length) {
    if (legend) legend.style.display = 'none';
    container.innerHTML = `<div class="empty"><div class="empty-ico">📅</div><div class="empty-msg">Tidak ada schedule PM untuk ${MONTHS_ID[month-1]} ${year}${statusF?' dengan filter ini':''}.</div></div>`;
    return;
  }
  if (legend) legend.style.display = 'flex';

  const groups = {};
  filtered.forEach(s => {
    const unit = s.unit || '(Tanpa Unit)';
    const area = s.area || '(Tanpa Area)';
    if (!groups[unit]) groups[unit] = {};
    if (!groups[unit][area]) groups[unit][area] = [];
    groups[unit][area].push(s);
  });

  window._ganttData = {};
  filtered.forEach(s => { window._ganttData[s.id] = s; });

  const weeks = [1,2,3,4,5];
  const isCurMonthYear = (month === curMonth && year === curYear);

  let html = `<div class="gantt-wrap"><div class="gantt-scroll"><table class="gantt-table">
    <thead><tr>
      <th class="gantt-eq-hdr">Equipment</th>
      ${weeks.map(w => `<th ${isCurMonthYear && w===curWeek ? 'style="background:var(--green2)"' : ''}>Minggu ${w}${isCurMonthYear && w===curWeek ? ' •' : ''}</th>`).join('')}
    </tr></thead><tbody>`;

  Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).forEach(([unit, areas]) => {
    const unitItems = Object.values(areas).flat();
    html += `<tr class="gantt-group-row"><td colspan="${weeks.length+1}">🏭 ${unit} <span style="font-weight:400;color:var(--text3);font-size:10px">(${unitItems.length} equipment)</span></td></tr>`;
    Object.entries(areas).sort(([a],[b])=>a.localeCompare(b)).forEach(([area, items]) => {
      html += `<tr class="gantt-group-row"><td colspan="${weeks.length+1}" style="padding-left:26px !important;color:var(--text2);font-size:11px">📍 ${area}</td></tr>`;
      items.forEach(s => {
        const sWeek = parseInt(s.week) || 1;
        html += `<tr><td class="gantt-eq-cell"><div class="gantt-eq-name">${s.equipment}</div><div class="gantt-eq-sub">${s.periode}${s.tagNo?' · '+s.tagNo:''}</div></td>
          ${weeks.map(w => {
            if (w !== sWeek) return `<td class="gantt-week-cell"><span class="gantt-dot-empty"></span></td>`;
            const icon = s._status === 'done' ? '✓' : s._status === 'overdue' ? '!' : '◎';
            return `<td class="gantt-week-cell"><span class="gantt-pill ${s._status}" onclick="openGanttPopup('${s.id}')">${icon}</span></td>`;
          }).join('')}
        </tr>`;
      });
    });
  });

  html += `</tbody></table></div></div>`;
  container.innerHTML = html;
}

function openGanttPopup(scheduleId) {
  const s = (window._ganttData || {})[scheduleId];
  if (!s) return;
  const statusLabel = {
    done:     { text:'✓ Sudah PM',  color:'var(--green2)' },
    overdue:  { text:'⚠ Overdue',   color:'var(--red)' },
    upcoming: { text:'◎ Belum PM',  color:'var(--orange)' },
    future:   { text:'— Terjadwal', color:'var(--text3)' },
  }[s._status] || { text:'—', color:'var(--text3)' };
  const reportDate = s._report?.date ? new Date(s._report.date).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}) : null;

  document.getElementById('gp-title').textContent = s.equipment;
  document.getElementById('gp-body').innerHTML = `
    <div style="margin-bottom:12px">
      <span class="badge" style="background:transparent;border:1px solid ${statusLabel.color};color:${statusLabel.color};font-size:11px;padding:3px 10px">${statusLabel.text}</span>
      ${isLockedByOther(s.id) ? lockBadgeHTML(s.id) : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--text2)">
      <div>🏭 <strong>${s.unit||'—'}</strong> &nbsp;·&nbsp; 📍 ${s.area||'—'}</div>
      <div>🔄 Periode: <strong>${s.periode}</strong> &nbsp;·&nbsp; Minggu ${s.week||'?'}</div>
      ${s.tagNo ? `<div>🏷 Tag: <strong>${s.tagNo}</strong></div>` : ''}
      ${s.pic ? `<div>👤 PIC: <strong>${s.pic}</strong></div>` : ''}
      ${reportDate ? `<div style="color:var(--green2)">✓ PM dilakukan: ${reportDate}</div>` : ''}
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      ${s._status !== 'done'
        ? (isLockedByOther(s.id)
            ? `<button class="btn-ghost" style="flex:1;font-size:12px;padding:9px 14px" disabled>🔒 Sedang Dikerjakan</button>`
            : `<button class="btn-primary" style="flex:1;font-size:12px;padding:9px 14px" onclick="closeGanttPopup();eksekusiPM('${s.id}')">▶ Eksekusi PM</button>`)
        : s._report ? `<button class="btn-blue" style="flex:1;font-size:12px;padding:9px 14px" onclick="closeGanttPopup();downloadPMPDFById('${s._report.id}')">📄 Lihat PDF</button>` : ''}
      <button class="btn-ghost" style="font-size:12px;padding:9px 14px" onclick="closeGanttPopup()">Tutup</button>
    </div>`;
  document.getElementById('ganttPopupOverlay').classList.add('open');
}
function closeGanttPopup() { document.getElementById('ganttPopupOverlay')?.classList.remove('open'); }

function _checkHasReport(s, month, year, reports) {
  const sTag  = (s.tagNo||'').trim().toLowerCase();
  const sName = (s.equipment||'').trim().toLowerCase();
  const sUnit = (s.unit||'').trim().toLowerCase();
  const pool  = reports || getData(STORE.REPORTS);
  return pool.some(r => {
    if (!r.date) return false;
    const d = new Date(r.date);
    if (month && year) { if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return false; }
    if (sTag && r.tagNo && r.tagNo.trim().toLowerCase() === sTag) return true;
    return (r.equipmentName||'').trim().toLowerCase() === sName && (r.unit||'').trim().toLowerCase() === sUnit;
  });
}

function _getLatestReport(s, month, year, reports) {
  const sTag  = (s.tagNo||'').trim().toLowerCase();
  const sName = (s.equipment||'').trim().toLowerCase();
  const sUnit = (s.unit||'').trim().toLowerCase();
  const matched = reports.filter(r => {
    if (!r.date) return false;
    const d = new Date(r.date);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return false;
    if (sTag && r.tagNo && r.tagNo.trim().toLowerCase() === sTag) return true;
    return (r.equipmentName||'').trim().toLowerCase() === sName && (r.unit||'').trim().toLowerCase() === sUnit;
  });
  return matched.sort((a,b) => new Date(b.date) - new Date(a.date))[0] || null;
}
