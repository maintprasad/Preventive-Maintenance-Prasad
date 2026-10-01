// ════════════════════════════════════════════════════════
//  SCHEDULE STATUS (shared helper used by dashboard/schedule/etc.)
// ════════════════════════════════════════════════════════
function hasReport(s, customReports) {
  if (customReports) {
    const tag  = (s.tagNo||'').trim().toLowerCase();
    const name = (s.equipment||'').trim().toLowerCase();
    const unit = (s.unit||'').trim().toLowerCase();
    return customReports.some(r => {
      if (tag && r.tagNo && r.tagNo.trim().toLowerCase() === tag) return true;
      return (r.equipmentName||'').trim().toLowerCase() === name
          && (r.unit||'').trim().toLowerCase() === unit;
    });
  }
  const idx  = _buildReportIndex();
  const tag  = (s.tagNo||'').trim().toLowerCase();
  const name = (s.equipment||'').trim().toLowerCase();
  const unit = (s.unit||'').trim().toLowerCase();
  if (tag  && idx.has('tag:' + tag))              return true;
  if (name && idx.has('eq:' + name + '|' + unit)) return true;
  return false;
}

function getScheduleStatus(s) {
  if (!_statusCache) _statusCache = new Map();
  if (s.id && _statusCache.has(s.id)) return _statusCache.get(s.id);

  const today    = new Date(); today.setHours(0,0,0,0);
  const curMonth = today.getMonth() + 1;
  const curWeek  = getWeekOfMonth(today);
  const sMonth   = parseInt(s.month) || curMonth;
  const sWeek    = parseInt(s.week)  || 1;

  let status;
  if      (hasReport(s))                           status = 'done';
  else if (sMonth < curMonth)                       status = 'overdue';
  else if (sMonth === curMonth && sWeek < curWeek)  status = 'overdue';
  else                                              status = 'upcoming';

  if (s.id) _statusCache.set(s.id, status);
  return status;
}

function getNextDue(s) {
  if (!s.lastDone) return s.startDate ? new Date(s.startDate) : new Date();
  const days = PERIODE_DAYS[s.periode] || 30;
  return new Date(new Date(s.lastDone).getTime() + days * 86400000);
}

function getPMTimingStatus(s) {
  if (!hasReport(s)) return 'outstanding';
  const reports = getData(STORE.REPORTS);
  const tag  = (s.tagNo||'').trim().toLowerCase();
  const name = (s.equipment||'').trim().toLowerCase();
  const unit = (s.unit||'').trim().toLowerCase();
  const matched = reports.filter(r => {
    if (tag && r.tagNo && r.tagNo.trim().toLowerCase() === tag) return true;
    return (r.equipmentName||'').trim().toLowerCase() === name
        && (r.unit||'').trim().toLowerCase() === unit;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));
  const latest = matched[0];
  if (!latest || !latest.date) return 'outstanding';
  const actualDate = new Date(latest.date); actualDate.setHours(0,0,0,0);
  const targetDate = getNextDue(s); targetDate.setHours(0,0,0,0);
  if (actualDate.getTime() < targetDate.getTime()) return 'early';
  if (actualDate.getTime() > targetDate.getTime()) return 'late';
  return 'on_time';
}

// ════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════
const charts = {};
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function clearDashFilters() {
  document.getElementById('dash-filter-year').value = '';
  document.getElementById('dash-filter-month').value = '';
  renderDashboard();
}

function renderDashboard() {
  const reports   = getData(STORE.REPORTS);
  const schedules = getData(STORE.SCHEDULES);

  setText('dashboardDate', 'Update: ' + new Date().toLocaleString('id-ID'));

  const yearSel = document.getElementById('dash-filter-year');
  if (yearSel) {
    const years = [...new Set(reports.map(r => r.date ? new Date(r.date).getFullYear() : null).filter(Boolean))].sort((a,b)=>b-a);
    const cur = yearSel.value;
    yearSel.innerHTML = '<option value="">Semua Tahun</option>' + years.map(y=>`<option value="${y}">${y}</option>`).join('');
    yearSel.value = cur;
  }

  const fYear  = parseInt(document.getElementById('dash-filter-year')?.value)  || 0;
  const fMonth = parseInt(document.getElementById('dash-filter-month')?.value) || 0;

  const filteredReports = reports.filter(r => {
    if (!r.date) return false;
    const d = new Date(r.date);
    if (fYear  && d.getFullYear() !== fYear)  return false;
    if (fMonth && d.getMonth() + 1 !== fMonth) return false;
    return true;
  });

  const scheduleInPeriod = schedules.filter(s => {
    if (fMonth && (parseInt(s.month) || 0) !== fMonth) return false;
    return true;
  });

  function isClosed(s) { return hasReport(s); }

  const units = [...new Set(schedules.map(s=>s.unit||'').filter(Boolean))].sort();
  let totalPlan = 0, totalActual = 0;
  units.forEach(u => {
    const sch = scheduleInPeriod.filter(s=>s.unit===u);
    totalPlan += sch.length;
    totalActual += sch.filter(s=>isClosed(s)).length;
  });
  const pct = totalPlan ? Math.round(totalActual/totalPlan*100) : 0;
  const pctColor = pct===100?'var(--green)':pct>=60?'var(--orange)':'var(--red)';

  const kpiBar = document.getElementById('dash-kpi-bar');
  if (kpiBar) kpiBar.innerHTML = `
    <div class="stat-card c-blue">
      <div class="stat-lbl">Total Equipment</div>
      <div class="stat-val">${totalPlan}</div>
      <div class="stat-sub">terdaftar di schedule</div>
    </div>
    <div class="stat-card c-green">
      <div class="stat-lbl">Sudah PM</div>
      <div class="stat-val" style="color:var(--green)">${totalActual}</div>
      <div class="stat-sub">laporan masuk</div>
    </div>
    <div class="stat-card c-orange">
      <div class="stat-lbl">Belum PM</div>
      <div class="stat-val" style="color:var(--orange)">${totalPlan - totalActual}</div>
      <div class="stat-sub">belum ada laporan</div>
    </div>
    <div class="stat-card c-green">
      <div class="stat-lbl">Completion Rate</div>
      <div class="stat-val" style="color:${pctColor}">${pct}%</div>
      <div class="stat-sub">${totalActual}/${totalPlan} equipment</div>
    </div>`;

  ['Unit 1','Unit 2'].forEach((unitName, ui) => {
    const canvasId = `chart-u${ui+1}`;
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const sch = scheduleInPeriod.filter(s=>s.unit===unitName);
    const areas = [...new Set(sch.map(s=>s.area||'(Tanpa Area)'))].sort();
    const planData   = areas.map(a => sch.filter(s=>(s.area||'(Tanpa Area)')===a).length);
    const actualData = areas.map(a => sch.filter(s=>(s.area||'(Tanpa Area)')===a).filter(s=>isClosed(s)).length);

    charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: { labels: areas, datasets: [
        { label:'Plan (Terdaftar)', data:planData, backgroundColor:'rgba(43,108,184,.6)', borderColor:'rgba(43,108,184,.9)', borderWidth:1, borderRadius:4 },
        { label:'Actual (Laporan Masuk)', data:actualData, backgroundColor:'rgba(74,158,63,.6)', borderColor:'rgba(74,158,63,.9)', borderWidth:1, borderRadius:4 }
      ]},
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{labels:{color:'#3a5a3a',font:{size:11}}},
          tooltip:{callbacks:{afterLabel:(ctx)=>{
            if (ctx.datasetIndex===1) {
              const plan = ctx.chart.data.datasets[0].data[ctx.dataIndex];
              const actual = ctx.raw;
              const p = plan ? Math.round(actual/plan*100) : 0;
              return `Completion: ${p}%`;
            }
          }}}
        },
        scales:{
          x:{ticks:{color:'#7a9a7a',font:{size:10}},grid:{color:'rgba(26,42,26,.06)'}},
          y:{ticks:{color:'#7a9a7a'},grid:{color:'rgba(26,42,26,.06)'},beginAtZero:true}
        }
      }
    });
  });

  const tableWrap = document.getElementById('dash-table-wrap');
  if (tableWrap) {
    let tableHTML = '';
    units.forEach(unitName => {
      const sch   = scheduleInPeriod.filter(s=>s.unit===unitName);
      const areas = [...new Set(sch.map(s=>s.area||'(Tanpa Area)'))].sort();
      const rows = areas.map((area,i) => {
        const areaSchedules = sch.filter(s=>(s.area||'(Tanpa Area)')===area);
        const plan   = areaSchedules.length;
        const actual = areaSchedules.filter(s=>isClosed(s)).length;
        const p      = plan ? Math.round(actual/plan*100) : 0;
        const pColor = p===100?'var(--green)':p>=60?'var(--orange)':'var(--red)';
        return `<tr style="background:${i%2===0?'var(--bg3)':'var(--bg2)'}">
          <td style="padding:9px 13px;font-size:13px">${area}</td>
          <td style="padding:9px 13px;text-align:center;font-size:13px;font-weight:700;color:var(--blue)">${plan}</td>
          <td style="padding:9px 13px;text-align:center;font-size:13px;font-weight:700;color:var(--green2)">${actual}</td>
          <td style="padding:9px 13px;text-align:center;font-size:13px;font-weight:700;color:var(--orange)">${plan-actual}</td>
          <td style="padding:9px 13px;text-align:center">
            <span style="font-size:13px;font-weight:700;color:${pColor}">${p}%</span>
            <div style="height:4px;background:var(--border);border-radius:2px;margin-top:4px;overflow:hidden">
              <div style="height:100%;width:${p}%;background:${pColor};border-radius:2px"></div>
            </div>
          </td>
        </tr>`;
      }).join('');

      const unitPlan = sch.length;
      const unitActual = sch.filter(s=>isClosed(s)).length;
      const unitPct = unitPlan ? Math.round(unitActual/unitPlan*100) : 0;
      const unitColor = unitPct===100?'var(--green)':unitPct>=60?'var(--orange)':'var(--red)';

      tableHTML += `
        <div class="tbl-wrap" style="margin-bottom:16px">
          <div style="padding:12px 14px;background:var(--navy);display:flex;align-items:center;justify-content:space-between">
            <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#fff;font-weight:700">🏭 ${unitName}</span>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:${unitColor};font-weight:700">${unitActual}/${unitPlan} (${unitPct}%)</span>
          </div>
          <table class="data-table">
            <thead><tr><th>Area</th><th style="text-align:center">Plan</th><th style="text-align:center">Actual</th><th style="text-align:center">Belum</th><th style="text-align:center">Completion</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    });
    tableWrap.innerHTML = tableHTML;
  }

  drawDashboardCharts(filteredReports, schedules);
}

function drawDashboardCharts(reports, schedules) {
  const gc = 'rgba(26,42,26,.06)';
  const opts = {responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#3a5a3a',font:{size:11}}}}};

  const sc = {overdue:0,upcoming:0,done:0};
  schedules.forEach(s => { sc[getScheduleStatus(s)]=(sc[getScheduleStatus(s)]||0)+1; });
  destroyChart('cStatus');
  const cStatusEl = document.getElementById('cStatus');
  if (cStatusEl) charts.cStatus = new Chart(cStatusEl, {
    type:'doughnut',
    data:{
      labels:(()=>{
        const total = sc.overdue + sc.upcoming + sc.done;
        const pct = v => total ? Math.round(v/total*100) : 0;
        return [`Overdue — ${sc.overdue} (${pct(sc.overdue)}%)`, `Upcoming — ${sc.upcoming} (${pct(sc.upcoming)}%)`, `On Track — ${sc.done} (${pct(sc.done)}%)`];
      })(),
      datasets:[{data:[sc.overdue,sc.upcoming,sc.done],backgroundColor:['rgba(192,57,43,.7)','rgba(230,126,34,.7)','rgba(74,158,63,.7)'],borderColor:'#fff',borderWidth:2}]
    },
    options:{...opts, plugins:{legend:{labels:{color:'#3a5a3a',font:{size:12},padding:14}}, tooltip:{callbacks:{label: ctx => `${ctx.label}: ${ctx.raw} equipment`}}}}
  });

  const now = new Date();
  const months6 = [];
  for (let i=5;i>=0;i--) {
    const d = new Date(now.getFullYear(),now.getMonth()-i,1);
    months6.push({label:d.toLocaleDateString('id-ID',{month:'short',year:'2-digit'}),y:d.getFullYear(),m:d.getMonth()});
  }
  const monthly = months6.map(m => reports.filter(r => { if (!r.date) return false; const d=new Date(r.date); return d.getFullYear()===m.y && d.getMonth()===m.m; }).length);
  destroyChart('cMonthly');
  const cMonthlyEl = document.getElementById('cMonthly');
  if (cMonthlyEl) charts.cMonthly = new Chart(cMonthlyEl, {
    type:'bar',
    data:{labels:months6.map(m=>m.label),datasets:[{label:'Laporan PM',data:monthly,backgroundColor:'rgba(74,158,63,.6)',borderColor:'var(--green)',borderWidth:1,borderRadius:4}]},
    options:{...opts,plugins:{...opts.plugins,legend:{display:false}},scales:{x:{ticks:{color:'#7a9a7a',font:{size:10}},grid:{color:gc}},y:{ticks:{color:'#7a9a7a'},grid:{color:gc},beginAtZero:true}}}
  });
}

function updateSidebarBadges() {
  const schedules  = getData(STORE.SCHEDULES);
  const today      = new Date(); today.setHours(0,0,0,0);
  const curMonth   = today.getMonth() + 1;

  const allOst = schedules.filter(s => getScheduleStatus(s) !== 'done');
  const ostBadge = document.getElementById('sb-outstanding-badge');
  if (ostBadge) { ostBadge.textContent = allOst.length; ostBadge.style.display = allOst.length ? 'inline-block' : 'none'; }

  const pastMonth = schedules.filter(s => {
    const sMonth = parseInt(s.month) || 0;
    const st     = getScheduleStatus(s);
    return st === 'overdue' && sMonth > 0 && sMonth < curMonth;
  });
  const tkoBadge = document.getElementById('sb-takeover-badge');
  if (tkoBadge) { tkoBadge.textContent = pastMonth.length; tkoBadge.style.display = pastMonth.length ? 'inline-block' : 'none'; }
}

function populateUnitFilters() {
  const schedules = getData(STORE.SCHEDULES);
  const reports   = getData(STORE.REPORTS);
  const schUnits  = [...new Set(schedules.map(s=>s.unit||'').filter(Boolean))].sort();
  const repUnits  = [...new Set(reports.map(r=>r.unit||'').filter(Boolean))].sort();

  const schUnitSel = document.getElementById('sch-filter-unit');
  if (schUnitSel) { const cur = schUnitSel.value; schUnitSel.innerHTML = '<option value="">Semua Unit</option>' + schUnits.map(u=>`<option value="${u}">${u}</option>`).join(''); schUnitSel.value = cur; }

  const schAreaSel = document.getElementById('sch-filter-area');
  if (schAreaSel) {
    const curUnit = schUnitSel?.value || '';
    const areas = [...new Set(schedules.filter(s=>!curUnit||s.unit===curUnit).map(s=>s.area||'').filter(Boolean))].sort();
    const curArea = schAreaSel.value;
    schAreaSel.innerHTML = '<option value="">Semua Area</option>' + areas.map(a=>`<option value="${a}">${a}</option>`).join('');
    schAreaSel.value = curArea;
  }

  const calUnitSel = document.getElementById('cal-filter-unit');
  if (calUnitSel) { const cur = calUnitSel.value; calUnitSel.innerHTML = '<option value="">Semua Unit</option>' + schUnits.map(u=>`<option value="${u}">${u}</option>`).join(''); calUnitSel.value = cur; }

  const repUnitSel = document.getElementById('rep-filter-unit');
  if (repUnitSel) { const cur = repUnitSel.value; repUnitSel.innerHTML = '<option value="">Semua Unit</option>' + repUnits.map(u=>`<option value="${u}">${u}</option>`).join(''); repUnitSel.value = cur; }

  const repAreaSel = document.getElementById('rep-filter-area');
  if (repAreaSel) {
    const curRepUnit = repUnitSel?.value || '';
    const repAreas = [...new Set(reports.filter(r=>!curRepUnit||r.unit===curRepUnit).map(r=>r.area||'').filter(Boolean))].sort();
    const curArea = repAreaSel.value;
    repAreaSel.innerHTML = '<option value="">Semua Area</option>' + repAreas.map(a=>`<option value="${a}">${a}</option>`).join('');
    repAreaSel.value = curArea;
  }
}
