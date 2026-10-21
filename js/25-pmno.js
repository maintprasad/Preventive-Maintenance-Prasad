// ════════════════════════════════════════════════════════
//  NOMOR PM (PM ke-N) & PM ULANG
//
//  Satu equipment bisa di-PM lebih dari sekali dalam setahun. Tiap laporan baru mendapat nomor PM
//  yang MELANJUTKAN nomor PM yang sudah ada pada tahun yang sama (PM ke-1, ke-2, ke-3, ...):
//    • Equipment dikenali dari Tag No, atau nama equipment + unit (sama seperti status "sudah PM").
//    • Tahun diambil dari TANGGAL laporan, jadi nomor kembali ke 1 di tahun berikutnya.
//    • Laporan lama (belum punya pmNo) diberi nomor menurut urutan tanggalnya.
// ════════════════════════════════════════════════════════
const _pmEq = o => ({
  tag: (o.tagNo || '').trim().toLowerCase(),
  name: (o.equipment || o.equipmentName || '').trim().toLowerCase(),
  unit: (o.unit || '').trim().toLowerCase()
});
function pmSameEquipment(a, b) {
  const x = _pmEq(a), y = _pmEq(b);
  if (x.tag && y.tag && x.tag === y.tag) return true;
  return !!x.name && x.name === y.name && x.unit === y.unit;
}
const _pmYear = iso => (iso || '').slice(0, 4);

// Cache daftar laporan (getData mem-parse seluruh localStorage tiap dipanggil). Direset oleh _invalidateCache().
let _pmAllCache = null;
const _pmAll = () => _pmAllCache || (_pmAllCache = getData(STORE.REPORTS));

// Laporan satu equipment pada satu tahun, urut tanggal (lalu waktu submit, lalu id)
function pmReportsOf(eq, year, excludeId = '') {
  return _pmAll()
    .filter(r => r.id !== excludeId && _pmYear(r.date) === String(year) && pmSameEquipment(eq, r))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.submittedAt || '').localeCompare(b.submittedAt || '') || String(a.id).localeCompare(String(b.id)));
}
// Nomor PM efektif: pmNo tersimpan, atau urutan tanggal untuk laporan lama
function pmNoOf(r) {
  if (r.pmNo) return r.pmNo;
  const sibs = pmReportsOf(r, _pmYear(r.date));
  const i = sibs.findIndex(x => x.id === r.id);
  return i >= 0 ? i + 1 : 1;
}
function nextPMNo(eq, dateISO, excludeId = '') {
  const sibs = pmReportsOf(eq, _pmYear(dateISO) || new Date().getFullYear(), excludeId);
  return Math.max(sibs.length, ...sibs.map(pmNoOf), 0) + 1;
}
// Jumlah PM equipment (schedule) tahun berjalan
let _pmCurCache = null;
function pmCountThisYear(s) {
  if (!_pmCurCache) { const y = String(new Date().getFullYear()); _pmCurCache = _pmAll().filter(r => _pmYear(r.date) === y); }
  return _pmCurCache.filter(r => pmSameEquipment(s, r)).length;
}
function _pmResetCache() { _pmCurCache = null; _pmAllCache = null; }

// ── Banner "PM ke-N" di form ────────────────────────────
function updatePMNoBanner() {
  const q = id => document.getElementById(id);
  const banner = q('pm-pmno-banner'), hidden = q('pm-pmno');
  if (!banner || !hidden) return;
  const editId = q('pm-edit-id')?.value || '';
  const eq = { tagNo: q('pm-tagno')?.value || '', equipmentName: q('pm-equipment-name')?.value || '', unit: q('pm-unit')?.value || '' };
  const date = q('pm-date')?.value || '';
  if (!(eq.tagNo.trim() || eq.equipmentName.trim()) || !date) { banner.style.display = 'none'; hidden.value = ''; return; }

  const year = _pmYear(date);
  const prev = pmReportsOf(eq, year, editId);
  let no;
  if (editId) { const cur = _pmAll().find(r => r.id === editId); no = cur ? pmNoOf(cur) : prev.length + 1; }
  else no = nextPMNo(eq, date);
  hidden.value = String(no);

  const fmt = iso => new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const prevTxt = prev.length ? `Sebelumnya: ${prev.map(r => `PM ke-${pmNoOf(r)} (${fmt(r.date)})`).join(', ')}` : 'PM pertama equipment ini di tahun ini';
  banner.className = 'pmno-banner' + (no > 1 ? ' again' : '');
  banner.innerHTML = `<span class="pmno-no">PM ke-${no}</span><span class="pmno-txt"><b>Tahun ${year}</b> · ${editId ? 'mengedit laporan' : (no > 1 ? 'PM ulang' : 'laporan baru')}<br><small>${prevTxt}</small></span>`;
  banner.style.display = 'flex';
}

// ── PM ulang dari Daftar Laporan ─────────────────────────
// Cari schedule equipment itu; kalau ada → eksekusi (lock + isi form otomatis). Kalau tidak → isi form dari laporan.
function pmAgainFromReport(id) {
  const r = getData(STORE.REPORTS).find(x => x.id === id);
  if (!r) { toast('Laporan tidak ditemukan', 'error'); return; }
  const s = getData(STORE.SCHEDULES).find(x => pmSameEquipment(x, r));
  if (s) { eksekusiPM(s.id); return; }
  clearPMForm(true);
  const el = i => document.getElementById(i);
  el('pm-tagno').value = r.tagNo || ''; el('pm-equipment-name').value = r.equipmentName || ''; el('pm-unit').value = r.unit || ''; el('pm-area').value = r.area || '';
  el('pm-periode').value = r.periode || 'Monthly'; el('pm-teknisi').value = r.teknisi || '';
  if (r.equipmentType) { el('pm-equipment-type').value = r.equipmentType; loadPMTemplate(); }
  el('pm-date').value = todayISO(); el('pm-week').value = getWeekOfMonth(new Date());
  showPage('reports');
  updatePMNoBanner();
  toast(`↻ PM ulang: ${r.equipmentName} — form terisi dari laporan sebelumnya`, 'info');
}

window.addEventListener('load', () => {
  ['pm-tagno', 'pm-equipment-name', 'pm-unit', 'pm-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', updatePMNoBanner); el.addEventListener('change', updatePMNoBanner); }
  });
});
