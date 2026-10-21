// ════════════════════════════════════════════════════════
//  RENCANA PM PER TANGGAL (kalender) + helper rencana tahunan
//
//  Data: schedule.plan = { "2026": ["2026-06-08", "2026-09-07"], "2027": [...] }
//    • Rencana disimpan PER TAHUN, jadi tiap akhir tahun bisa dibuat rencana tahun baru
//      tanpa menghapus rencana tahun sebelumnya (lihat 24-yearend.js).
//    • schedule.month / schedule.week TETAP ada: diturunkan dari tanggal pertama rencana
//      tahun berjalan (lihat _sanitizeSchedule di 02-store.js), jadi halaman lama (status,
//      Input PM, Outstanding, Takeover) tetap jalan tanpa diubah.
//    • Jadwal lama yang belum punya plan tetap memakai pola lama (bulan + minggu + periode).
// ════════════════════════════════════════════════════════
const PLAN_DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const _p2 = n => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${_p2(m)}-${_p2(d)}`;
const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const dateToISO = dt => isoOf(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

function addMonthsISO(iso, n) {
  const d = parseISO(iso), day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, daysInMonth(t.getFullYear(), t.getMonth() + 1)));
  return dateToISO(t);
}
// Sabtu/Minggu → Senin berikutnya; kalau Senin itu lompat bulan → mundur ke Jumat.
function adjustToWeekday(iso) {
  const d = parseISO(iso), dow = d.getDay();
  if (dow >= 1 && dow <= 5) return iso;
  const fwd = new Date(d); fwd.setDate(d.getDate() + (dow === 6 ? 2 : 1));
  if (fwd.getMonth() === d.getMonth()) return dateToISO(fwd);
  const back = new Date(d); back.setDate(d.getDate() - (dow === 6 ? 1 : 2));
  return dateToISO(back);
}

// ── Akses rencana ───────────────────────────────────────
function getPlanDates(s, year) {
  const a = s && s.plan && s.plan[String(year)];
  return Array.isArray(a) ? a : [];
}
const hasExplicitPlan = (s, year) => getPlanDates(s, year).length > 0;

// Pola LAMA (bulan + minggu + periode) — dipertahankan persis seperti sebelumnya untuk jadwal tanpa plan.
function legacyInMonth(s, m) {
  const sMonth = parseInt(s.month) || 0;
  if (!sMonth) return false;
  if (s.periode === 'Monthly') return sMonth === m;
  if (s.periode === 'Weekly' || s.periode === 'Daily') return true;
  if (s.periode === 'Quarterly') return ((m - sMonth) % 3 === 0) && m >= sMonth;
  if (s.periode === 'Semi-Annual') return ((m - sMonth) % 6 === 0) && m >= sMonth;
  return sMonth === m;
}
function legacyHasPlan(s, m, w) {
  const sMonth = parseInt(s.month) || 0, sWeek = parseInt(s.week) || 1;
  if (!sMonth) return false;
  if (s.periode === 'Monthly') return sMonth === m && sWeek === w;
  if (s.periode === 'Weekly') return sWeek === w;
  if (s.periode === 'Daily') return true;
  if (s.periode === 'Quarterly') return ((m - sMonth) % 3 === 0) && m >= sMonth && sWeek === w;
  if (s.periode === 'Semi-Annual') return ((m - sMonth) % 6 === 0) && m >= sMonth && sWeek === w;
  return sMonth === m && sWeek === w;
}

// Minggu-minggu (1..5) yang punya PM pada bulan tsb. Rencana tanggal menang atas pola lama.
function plannedWeeksInMonth(s, year, m) {
  if (hasExplicitPlan(s, year)) {
    const weeks = new Set();
    getPlanDates(s, year).forEach(iso => { if (Number(iso.slice(5, 7)) === m) weeks.add(getWeekOfMonth(parseISO(iso))); });
    return [...weeks].sort();
  }
  return legacyInMonth(s, m) ? [parseInt(s.week) || 1] : [];
}
const isPlannedInMonth = (s, year, m) => plannedWeeksInMonth(s, year, m).length > 0;
// Dipakai PDF Plan vs Actual (kolom bulan × minggu)
function isPlannedAt(s, year, m, w) {
  if (hasExplicitPlan(s, year)) return plannedWeeksInMonth(s, year, m).includes(w);
  return legacyHasPlan(s, m, w);
}

function planSummary(s, year, max = 4) {
  const dates = getPlanDates(s, year);
  if (!dates.length) return '';
  const fmt = iso => parseISO(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const shown = dates.slice(0, max).map(fmt).join(' · ');
  return dates.length > max ? `${shown} +${dates.length - max}` : shown;
}

// ── Pembuatan tanggal otomatis ──────────────────────────
function generateDatesByPeriode(firstISO, periode, year) {
  const out = [], y = String(year);
  const push = iso => { if (iso.startsWith(y + '-')) out.push(iso); };
  if (periode === 'Daily') {
    const d = parseISO(firstISO);
    while (d.getFullYear() === year) { const dow = d.getDay(); if (dow >= 1 && dow <= 5) push(dateToISO(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  if (periode === 'Weekly') {
    const d = parseISO(firstISO);
    while (d.getFullYear() === year) { push(dateToISO(d)); d.setDate(d.getDate() + 7); }
    return out;
  }
  const step = { Monthly: 1, Quarterly: 3, 'Semi-Annual': 6 }[periode];
  if (!step) { push(firstISO); return out; }                    // Annual / lainnya → satu kali
  for (let k = 0; k < 60; k++) {
    const iso = addMonthsISO(firstISO, k * step);
    if (Number(iso.slice(0, 4)) > year) break;
    push(adjustToWeekday(iso));
  }
  return out;
}

// Hari kerja pertama pada minggu-ke-N bulan tsb (minggu 5 yang tidak ada → hari kerja terakhir bulan itu).
function firstDateOfWeek(year, month, week) {
  const dim = daysInMonth(year, month);
  for (let d = 1; d <= dim; d++) {
    const dt = new Date(year, month - 1, d), dow = dt.getDay();
    if (getWeekOfMonth(dt) === week && dow >= 1 && dow <= 5) return isoOf(year, month, d);
  }
  for (let d = dim; d >= 1; d--) { const dow = new Date(year, month - 1, d).getDay(); if (dow >= 1 && dow <= 5) return isoOf(year, month, d); }
  return isoOf(year, month, 1);
}
function legacyToDates(s, year) {
  const sMonth = parseInt(s.month) || 0, sWeek = parseInt(s.week) || 1;
  if (!sMonth) return [];
  if (s.periode === 'Daily' || s.periode === 'Weekly') return generateDatesByPeriode(firstDateOfWeek(year, sMonth, sWeek), s.periode, year);
  const out = [];
  for (let m = 1; m <= 12; m++) if (legacyInMonth(s, m)) out.push(firstDateOfWeek(year, m, sWeek));
  return out;
}
// Rencana otomatis untuk tahun target: salin pola tahun sebelumnya (tanggal digeser ke tahun target,
// akhir pekan dihindari); bila belum ada, bangun dari pola lama (bulan + minggu + periode).
function autoPlanDates(s, targetYear) {
  const prevYears = Object.keys(s.plan || {}).map(Number).filter(y => y < targetYear && getPlanDates(s, y).length).sort((a, b) => b - a);
  if (prevYears.length) {
    const src = getPlanDates(s, prevYears[0]);
    return [...new Set(src.map(iso => {
      const [, m, d] = iso.split('-').map(Number);
      return adjustToWeekday(isoOf(targetYear, m, Math.min(d, daysInMonth(targetYear, m))));
    }))].sort();
  }
  return [...new Set(legacyToDates(s, targetYear))].sort();
}

// ── Beban per tanggal (berapa equipment LAIN yang dijadwalkan di tanggal itu) ──
function planLoadMap(year, excludeIds = []) {
  const map = new Map(), ex = new Set(excludeIds);
  getData(STORE.SCHEDULES).forEach(s => {
    if (ex.has(s.id)) return;
    getPlanDates(s, year).forEach(iso => map.set(iso, (map.get(iso) || 0) + 1));
  });
  return map;
}
// Tanggal PM yang SUDAH dilaporkan untuk satu equipment pada tahun tertentu
function reportedDatesFor(eq, year) {
  const out = new Set();
  const tag = (eq.tagNo || '').trim().toLowerCase(), name = (eq.equipment || eq.equipmentName || '').trim().toLowerCase(), unit = (eq.unit || '').trim().toLowerCase();
  if (!tag && !name) return out;
  getData(STORE.REPORTS).forEach(r => {
    if (!r.date || !r.date.startsWith(year + '-')) return;
    const sameTag = tag && r.tagNo && r.tagNo.trim().toLowerCase() === tag;
    const sameName = name && (r.equipmentName || '').trim().toLowerCase() === name && (r.unit || '').trim().toLowerCase() === unit;
    if (sameTag || sameName) out.add(r.date);
  });
  return out;
}

// ════════════════════════════════════════════════════════
//  WIDGET KALENDER BULANAN
//  Tiap bulan tampil sebagai kalender: jumlah hari bulan itu, hari yang dipilih, dan jumlah equipment
//  lain yang sudah dijadwalkan di tiap tanggal (angka kecil di pojok sel).
// ════════════════════════════════════════════════════════
const _planCals = {};
const _clonePlan = p => { const o = {}; Object.entries(p || {}).forEach(([y, a]) => { if (Array.isArray(a)) o[y] = [...a]; }); return o; };

function createPlanCalendar(id, opts = {}) {
  const now = new Date();
  const st = {
    id, plan: _clonePlan(opts.plan), year: opts.year || now.getFullYear(), month: opts.month || (now.getMonth() + 1),
    excludeIds: opts.excludeIds || [], doneDates: opts.doneDates || (() => new Set()),
    getPeriode: opts.getPeriode || (() => 'Monthly'), getLegacy: opts.getLegacy || (() => null), onChange: opts.onChange || (() => {}),
    allowClearAll: opts.allowClearAll !== false
  };
  _planCals[id] = st;
  planCalRender(id);
  return st;
}
const _planSet = (st, year = st.year) => new Set(st.plan[String(year)] || []);
function _planSave(st, set, year = st.year) {
  const arr = [...set].sort();
  if (arr.length) st.plan[String(year)] = arr; else delete st.plan[String(year)];
}

function planCalRender(id) {
  const st = _planCals[id], root = document.getElementById(id);
  if (!st || !root) return;
  const { year, month } = st;
  const sel = _planSet(st), load = planLoadMap(year, st.excludeIds), done = st.doneDates(year);
  const dim = daysInMonth(year, month);
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;      // Senin = 0
  const today = dateToISO(new Date());
  const inMonthSel = [...sel].filter(d => Number(d.slice(5, 7)) === month).length;
  const years = []; for (let y = new Date().getFullYear() - 1; y <= new Date().getFullYear() + 6; y++) years.push(y);
  if (!years.includes(year)) years.push(year);

  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span class="plancal-day blank"></span>';
  for (let d = 1; d <= dim; d++) {
    const iso = isoOf(year, month, d), dow = (lead + d - 1) % 7;
    const n = load.get(iso) || 0;
    const cls = ['plancal-day', sel.has(iso) ? 'sel' : '', iso === today ? 'today' : '', dow >= 5 ? 'wk' : '', done.has(iso) ? 'done' : ''].filter(Boolean).join(' ');
    cells += `<button type="button" class="${cls}" data-iso="${iso}" onclick="planCalAct('${id}','toggle','${iso}')" title="${n ? n + ' equipment lain dijadwalkan' : ''}${done.has(iso) ? ' · sudah ada laporan PM' : ''}"><b>${d}</b>${n ? `<i class="plancal-n">${n}</i>` : ''}${done.has(iso) ? '<em>✓</em>' : ''}</button>`;
  }

  const byMonth = {};
  [...sel].sort().forEach(iso => { (byMonth[Number(iso.slice(5, 7))] = byMonth[Number(iso.slice(5, 7))] || []).push(iso); });
  const chips = Object.entries(byMonth).map(([m, list]) => `<div class="plancal-chiprow"><span class="plancal-chipm" onclick="planCalAct('${id}','goto','${m}')">${MONTHS_ID[m - 1].slice(0, 3)}</span>${list.map(iso => `<button type="button" class="plancal-chip" onclick="planCalAct('${id}','toggle','${iso}')" title="Hapus">${Number(iso.slice(8))}<span>×</span></button>`).join('')}<span class="plancal-chipn">${list.length} hari</span></div>`).join('') || '<div class="plancal-empty">Belum ada tanggal dipilih — ketuk tanggal pada kalender.</div>';

  const legacy = st.getLegacy();
  const legacyBtn = legacy && !sel.size
    ? `<button type="button" class="btn-ghost plancal-tool" onclick="planCalAct('${id}','legacy')">↺ Muat dari jadwal lama (${MONTHS_ID[(legacy.month || 1) - 1]} minggu ${legacy.week || 1})</button>` : '';

  root.innerHTML = `<div class="plancal">
    <div class="plancal-nav">
      <button type="button" class="plancal-btn" aria-label="Bulan sebelumnya" onclick="planCalAct('${id}','prev')">‹</button>
      <div class="plancal-title">
        <select class="fsel" aria-label="Bulan" onchange="planCalAct('${id}','month',this.value)">${MONTHS_ID.map((n, i) => `<option value="${i + 1}" ${i + 1 === month ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select class="fsel" aria-label="Tahun" onchange="planCalAct('${id}','year',this.value)">${years.sort().map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
      </div>
      <button type="button" class="plancal-btn" aria-label="Bulan berikutnya" onclick="planCalAct('${id}','next')">›</button>
    </div>
    <div class="plancal-meta"><b>${MONTHS_ID[month - 1]} ${year} = ${dim} hari</b><span>${inMonthSel} hari dipilih bulan ini</span><span class="tot">${sel.size} hari dipilih di ${year}</span></div>
    <div class="plancal-dow">${PLAN_DOW.map((d, i) => `<span class="${i >= 5 ? 'wk' : ''}">${d}</span>`).join('')}</div>
    <div class="plancal-grid">${cells}</div>
    <div class="plancal-legend"><span><i class="lg sel"></i>dipilih</span><span><i class="lg today"></i>hari ini</span><span><i class="lg num">3</i>equipment lain di tanggal itu</span><span><i class="lg done">✓</i>sudah ada laporan PM</span></div>
    <div class="plancal-summary"><div class="plancal-sumtitle">Tanggal PM tahun ${year}</div>${chips}</div>
    <div class="plancal-tools">
      <button type="button" class="btn-ghost plancal-tool" onclick="planCalAct('${id}','auto')" title="Isi tanggal berikutnya sesuai periode dari tanggal pertama yang dipilih">⚡ Isi sesuai periode</button>
      <button type="button" class="btn-ghost plancal-tool" onclick="planCalAct('${id}','clearMonth')">Kosongkan bulan ini</button>
      ${st.allowClearAll ? `<button type="button" class="btn-ghost plancal-tool" onclick="planCalAct('${id}','clearYear')">Kosongkan ${year}</button>` : ''}
      ${legacyBtn}
    </div></div>`;
}

function planCalAct(id, act, arg) {
  const st = _planCals[id];
  if (!st) return;
  const set = _planSet(st);
  if (act === 'toggle') {
    // simpan pada tahun dari TANGGAL itu sendiri (bukan tahun yang sedang ditampilkan)
    const y = Number(arg.slice(0, 4)), ys = _planSet(st, y);
    if (ys.has(arg)) ys.delete(arg); else ys.add(arg);
    _planSave(st, ys, y);
  }
  else if (act === 'prev') { st.month--; if (st.month < 1) { st.month = 12; st.year--; } }
  else if (act === 'next') { st.month++; if (st.month > 12) { st.month = 1; st.year++; } }
  else if (act === 'month') st.month = Number(arg);
  else if (act === 'year') st.year = Number(arg);
  else if (act === 'goto') st.month = Number(arg);
  else if (act === 'clearMonth') { [...set].forEach(d => { if (Number(d.slice(5, 7)) === st.month) set.delete(d); }); _planSave(st, set); }
  else if (act === 'clearYear') { _planSave(st, new Set()); }
  else if (act === 'auto') {
    const first = [...set].sort()[0];
    if (!first) { toast('Pilih dulu satu tanggal sebagai awal, lalu klik "Isi sesuai periode"', 'warning'); return; }
    generateDatesByPeriode(first, st.getPeriode(), st.year).forEach(d => set.add(d));
    _planSave(st, set);
    toast(`Terisi ${set.size} tanggal (periode ${st.getPeriode()})`, 'success');
  }
  else if (act === 'legacy') {
    const lg = st.getLegacy();
    if (lg) { legacyToDates({ ...lg }, st.year).forEach(d => set.add(d)); _planSave(st, set); const f = [...set].sort()[0]; if (f) st.month = Number(f.slice(5, 7)); }
  }
  planCalRender(id);
  st.onChange(st);
}

// ════════════════════════════════════════════════════════
//  MODAL SCHEDULE PM — bagian kalender
// ════════════════════════════════════════════════════════
let _schCtx = null;   // { id, schedule } — schedule yang sedang di-edit (null = baru)

function schPlanInit(s, presetYear) {
  const curY = new Date().getFullYear();
  const year = presetYear || curY;
  const plan = s && s.plan ? s.plan : {};
  const first = getPlanDates(s || {}, year)[0];
  const month = first ? Number(first.slice(5, 7)) : (s && parseInt(s.month)) || (new Date().getMonth() + 1);
  _schCtx = { id: s ? s.id : null, schedule: s || null };
  createPlanCalendar('sch-plan-cal', {
    plan, year, month,
    excludeIds: s ? [s.id] : [],
    doneDates: y => s ? reportedDatesFor(s, y) : new Set(),
    getPeriode: () => document.getElementById('sch-periode')?.value || 'Monthly',
    getLegacy: () => (s && !Object.keys(s.plan || {}).length && parseInt(s.month)) ? { month: parseInt(s.month), week: parseInt(s.week) || 1, periode: document.getElementById('sch-periode')?.value || s.periode } : null,
    onChange: schPlanRefreshInfo
  });
  schPlanRefreshInfo();
}
function schPlanGet() { return _clonePlan((_planCals['sch-plan-cal'] || { plan: {} }).plan); }
function schPlanRefreshInfo() {
  const plan = schPlanGet(), el = document.getElementById('sch-plan-info');
  if (!el) return;
  const years = Object.keys(plan).sort();
  el.textContent = years.length ? years.map(y => `${y}: ${plan[y].length} hari`).join(' · ') : 'Belum ada tanggal dipilih';
}

// Turunkan month / week / hari dari rencana (dipakai saat menyimpan). null bila plan kosong.
function derivePlanFields(plan) {
  const years = Object.keys(plan).filter(y => plan[y].length).sort();
  if (!years.length) return null;
  const cur = String(new Date().getFullYear());
  const y = plan[cur] && plan[cur].length ? cur : years[0];
  const first = plan[y][0], d = parseISO(first), m = d.getMonth() + 1;
  return { month: m, week: getWeekOfMonth(d), hari: plan[y].filter(iso => Number(iso.slice(5, 7)) === m).length };
}

// Takeover: tanggal rencana tahun berjalan yang terlewat dipindah ke minggu tujuan; tanggal berikutnya (bila ada) tetap.
// Tanpa ini, month/week hasil takeover akan ditimpa lagi oleh tanggal rencana lama (lihat _sanitizeSchedule).
function planTakeover(s, newMonth, newWeek) {
  const year = new Date().getFullYear(), dates = getPlanDates(s, year);
  if (!dates.length) return;
  const target = firstDateOfWeek(year, newMonth, newWeek);
  const rest = dates.slice(1).filter(d => d > target);
  s.plan = { ...(s.plan || {}), [String(year)]: [target, ...rest] };
}
