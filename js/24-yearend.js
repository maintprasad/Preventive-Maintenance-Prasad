// ════════════════════════════════════════════════════════
//  AKHIRI TAHUN — PLANNING PM TAHUN BARU
//
//  Di tiap akhir tahun, jadwal PM tahun berikutnya disusun di sini:
//    • Daftar equipment + status planning per tahun yang dipilih.
//    • Tiap equipment diatur lewat modal Schedule berformat kalender (tombol "Atur").
//    • "Buat otomatis dari pola": menyalin pola tahun sebelumnya (atau pola jadwal lama).
//    • "Atur tanggal bersama": pilih tanggal di kalender lalu terapkan ke banyak equipment sekaligus.
//  Rencana disimpan per tahun di schedule.plan, jadi rencana tahun-tahun lain tidak terhapus.
// ════════════════════════════════════════════════════════
const YE_PER_PAGE = 40;
const _ye = { page: 0, selected: new Set(), shown: [] };

function openYearEndModal() {
  const schedules = getData(STORE.SCHEDULES);
  if (!schedules.length) { toast('Belum ada schedule PM', 'warning'); return; }
  const cur = new Date().getFullYear();
  const sel = document.getElementById('ye-year');
  sel.innerHTML = [cur, cur + 1, cur + 2, cur + 3].map(y => `<option value="${y}">${y}${y === cur ? ' (tahun berjalan)' : ''}</option>`).join('');
  sel.value = String(cur + 1);
  document.getElementById('ye-search').value = '';
  document.getElementById('ye-filter').value = '';
  fillUnitAreaPair('ye-unit', 'ye-area');
  _ye.selected.clear();
  yeRender(true);
  openOverlay('yearEndOverlay');
}

const yeYear = () => Number(document.getElementById('ye-year')?.value) || new Date().getFullYear() + 1;
// Daily/Weekly dihitung otomatis dari periode (tidak perlu tanggal satu per satu)
const yeIsAuto = s => s.periode === 'Daily' || s.periode === 'Weekly';
const yeIsPlanned = (s, year) => hasExplicitPlan(s, year) || yeIsAuto(s);

function yeFiltered() {
  const year = yeYear();
  const q = (document.getElementById('ye-search')?.value || '').toLowerCase();
  const unit = document.getElementById('ye-unit')?.value || '', area = document.getElementById('ye-area')?.value || '';
  const f = document.getElementById('ye-filter')?.value || '';
  return getData(STORE.SCHEDULES).filter(s => {
    if (unit && s.unit !== unit) return false;
    if (area && s.area !== area) return false;
    if (q && ![s.equipment, s.unit, s.area, s.tagNo].some(v => (v || '').toLowerCase().includes(q))) return false;
    if (f === 'belum' && yeIsPlanned(s, year)) return false;
    if (f === 'sudah' && !yeIsPlanned(s, year)) return false;
    return true;
  }).sort((a, b) => (a.unit || '').localeCompare(b.unit || '') || (a.area || '').localeCompare(b.area || '') || (a.equipment || '').localeCompare(b.equipment || ''));
}

function yeRender(resetPage = false) {
  if (resetPage) _ye.page = 0;
  const year = yeYear(), cur = new Date().getFullYear();
  const all = getData(STORE.SCHEDULES);
  const list = yeFiltered();
  _ye.shown = list;

  // Ringkasan tahun berjalan + kesiapan planning
  const doneCur = all.filter(s => hasReport(s)).length;
  const reportsCur = getData(STORE.REPORTS).filter(r => r.date && r.date.startsWith(cur + '-')).length;
  const planned = all.filter(s => yeIsPlanned(s, year)).length;
  const pctPlan = all.length ? Math.round(planned / all.length * 100) : 0;
  document.getElementById('ye-summary').innerHTML = `
    <div class="ye-card"><span>Tahun ${cur}</span><b>${doneCur}/${all.length}</b><small>equipment sudah di-PM · ${reportsCur} laporan PM</small></div>
    <div class="ye-card ${planned === all.length ? 'ok' : ''}"><span>Planning ${year}</span><b>${planned}/${all.length}</b><small>equipment sudah direncanakan (${pctPlan}%)</small>
      <div class="ye-bar"><div style="width:${pctPlan}%"></div></div></div>`;

  const pages = Math.max(1, Math.ceil(list.length / YE_PER_PAGE));
  if (_ye.page >= pages) _ye.page = pages - 1;
  const slice = list.slice(_ye.page * YE_PER_PAGE, (_ye.page + 1) * YE_PER_PAGE);
  document.getElementById('ye-list').innerHTML = slice.length ? slice.map(s => {
    const dates = getPlanDates(s, year), auto = yeIsAuto(s) && !dates.length;
    const status = dates.length
      ? `<span class="badge b-done">✓ ${dates.length} hari</span>`
      : auto ? `<span class="badge b-monthly" title="Daily/Weekly mengikuti periode">⟳ ${s.periode}</span>`
      : `<span class="badge b-overdue" style="animation:none">⚠ Belum</span>`;
    const prev = Object.keys(s.plan || {}).map(Number).filter(y => y < year && getPlanDates(s, y).length).sort((a, b) => b - a)[0];
    return `<div class="ye-row">
      <label class="ye-chk"><input type="checkbox" ${_ye.selected.has(s.id) ? 'checked' : ''} onchange="yeToggleOne('${s.id}',this.checked)"></label>
      <div class="ye-info">
        <div class="ye-name">${escapeHtml(s.equipment)} ${s.tagNo ? `<small>${escapeHtml(s.tagNo)}</small>` : ''}</div>
        <div class="ye-sub">🏭 ${escapeHtml(s.unit || '—')} · 📍 ${escapeHtml(s.area || '—')} · 🔄 ${escapeHtml(s.periode)}${prev ? ` · ${prev}: ${getPlanDates(s, prev).length} hari` : ''}</div>
        ${dates.length ? `<div class="ye-dates">📅 ${planSummary(s, year, 8)}</div>` : ''}
      </div>
      <div class="ye-act">${status}<button class="tbl-btn" onclick="openScheduleModal('${s.id}',{year:${year}})">🗓 Atur</button></div>
    </div>`;
  }).join('') : '<div class="empty"><div class="empty-ico">🗓</div><div class="empty-msg">Tidak ada equipment untuk filter ini.</div></div>';

  const pag = document.getElementById('ye-pag');
  pag.style.display = list.length > YE_PER_PAGE ? 'flex' : 'none';
  document.getElementById('ye-pageinfo').textContent = `${_ye.page * YE_PER_PAGE + 1}–${Math.min((_ye.page + 1) * YE_PER_PAGE, list.length)} dari ${list.length}`;
  document.getElementById('ye-prev').disabled = _ye.page === 0;
  document.getElementById('ye-next').disabled = (_ye.page + 1) * YE_PER_PAGE >= list.length;
  yeUpdateSel();
}
function yePage(d) { _ye.page = Math.max(0, _ye.page + d); yeRender(); }
function yeUpdateSel() {
  const n = _ye.selected.size;
  const el = document.getElementById('ye-selcount'); if (el) el.textContent = `${n} dipilih`;
  const all = document.getElementById('ye-checkall');
  if (all) all.checked = _ye.shown.length > 0 && _ye.shown.every(s => _ye.selected.has(s.id));
}
function yeToggleOne(id, on) { if (on) _ye.selected.add(id); else _ye.selected.delete(id); yeUpdateSel(); }
function yeToggleAll(on) { _ye.shown.forEach(s => { if (on) _ye.selected.add(s.id); else _ye.selected.delete(s.id); }); yeRender(); }

// Simpan perubahan banyak schedule: perbarui lokal, kirim ke server dalam batch (antrian bila gagal).
async function yeCommit(changed, msg) {
  if (!changed.length) return;
  const now = new Date().toISOString(), byId = new Map(changed.map(s => [s.id, s]));
  changed.forEach(s => { s.updatedAt = now; const d = derivePlanFields(s.plan || {}); if (d) { s.month = d.month; s.week = d.week; s.hari = d.hari; } });
  setData(STORE.SCHEDULES, getData(STORE.SCHEDULES).map(s => byId.get(s.id) || s));
  renderAll();
  yeRender();
  toast(msg, 'success');
  if (!backendEnabled()) return;
  for (let i = 0; i < changed.length; i += 100) {
    const chunk = changed.slice(i, i + 100);
    let ok = false;
    try { const res = await api('bulkUpsert', { schedules: chunk }, 1); ok = !!(res && res.success && !res.rejected); } catch (e) { ok = false; }
    if (!ok) chunk.forEach(s => enqueueSync('saveSchedule', { schedule: s }, s.id));
  }
  setSyncStatus('online', 'Planning tersinkron');
}

function _yeTargets() { return getData(STORE.SCHEDULES).filter(s => _ye.selected.has(s.id)); }

async function yeAutoPlan() {
  const year = yeYear();
  let targets = _yeTargets();
  if (!targets.length) {
    targets = yeFiltered().filter(s => !yeIsPlanned(s, year));
    if (!targets.length) { toast('Semua equipment pada filter ini sudah direncanakan', 'info'); return; }
    if (!confirm(`Belum ada yang dipilih.\n\nBuat planning ${year} otomatis untuk ${targets.length} equipment yang belum direncanakan?`)) return;
  }
  let made = 0, skipped = 0, none = 0; const changed = [];
  targets.forEach(s => {
    if (hasExplicitPlan(s, year)) { skipped++; return; }          // jangan menimpa planning yang sudah disusun
    const dates = autoPlanDates(s, year);
    if (!dates.length) { none++; return; }
    s.plan = { ...(s.plan || {}), [String(year)]: dates };
    changed.push(s); made++;
  });
  _ye.selected.clear();
  await yeCommit(changed, `Planning ${year}: ${made} equipment dibuat otomatis${skipped ? `, ${skipped} dilewati (sudah ada)` : ''}${none ? `, ${none} tanpa pola` : ''}`);
  if (!changed.length) { toast(`Tidak ada yang dibuat${skipped ? ` — ${skipped} sudah punya planning` : ''}${none ? `, ${none} tanpa pola` : ''}`, 'warning'); }
}

async function yeClear() {
  const year = yeYear(), targets = _yeTargets().filter(s => hasExplicitPlan(s, year));
  if (!targets.length) { toast('Pilih equipment yang planning-nya ingin dikosongkan', 'warning'); return; }
  if (!confirm(`Kosongkan planning ${year} untuk ${targets.length} equipment?\n\nPlanning tahun lain tidak berubah.`)) return;
  targets.forEach(s => { const p = { ...(s.plan || {}) }; delete p[String(year)]; s.plan = p; });
  _ye.selected.clear();
  await yeCommit(targets, `Planning ${year} dikosongkan untuk ${targets.length} equipment`);
}

// ── Atur tanggal bersama ────────────────────────────────
function yeOpenBulk() {
  const targets = _yeTargets();
  if (!targets.length) { toast('Pilih dulu equipment yang akan diberi tanggal yang sama', 'warning'); return; }
  const year = yeYear();
  document.getElementById('plan-bulk-title').textContent = `Atur Tanggal PM ${year} — ${targets.length} equipment`;
  document.getElementById('plan-bulk-sub').textContent = targets.slice(0, 3).map(s => s.equipment).join(', ') + (targets.length > 3 ? ` +${targets.length - 3} lainnya` : '');
  document.getElementById('plan-bulk-count').textContent = targets.length;
  createPlanCalendar('plan-bulk-cal', {
    plan: {}, year, month: 1, excludeIds: targets.map(s => s.id),
    getPeriode: () => (targets[0] && targets[0].periode) || 'Monthly', allowClearAll: true
  });
  openOverlay('planOverlay');
}

async function yeApplyBulk() {
  const year = yeYear(), cal = _planCals['plan-bulk-cal'];
  const dates = cal ? (cal.plan[String(year)] || []) : [];
  if (!dates.length) { toast('Pilih minimal satu tanggal di kalender', 'warning'); return; }
  const mode = document.getElementById('plan-bulk-mode').value;
  const targets = _yeTargets();
  targets.forEach(s => {
    const merged = mode === 'append' ? [...new Set([...getPlanDates(s, year), ...dates])].sort() : [...dates];
    s.plan = { ...(s.plan || {}), [String(year)]: merged };
  });
  closeOverlay('planOverlay');
  _ye.selected.clear();
  await yeCommit(targets, `${dates.length} tanggal diterapkan ke ${targets.length} equipment (${year})`);
}
