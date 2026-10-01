// ════════════════════════════════════════════════════════
//  STORE — localStorage layer + in-memory fallback + caches
// ════════════════════════════════════════════════════════
const _mem = {};
function _lsOK(){ try{localStorage.setItem('__t__','1');localStorage.removeItem('__t__');return true;}catch(e){return false;} }
const _useLS = _lsOK();

// Memoization cache — di-reset setiap kali data berubah
let _statusCache = null;       // Map: scheduleId → status string
let _reportIndexCache = null;  // Set: key untuk hasReport lookup

function _invalidateCache() {
  _statusCache = null;
  _reportIndexCache = null;
}

function _sanitizeReport(item) {
  if (!item) return item;
  item.ppe        = _safeParseJSON(item.ppe, {});
  if (typeof item.ppe !== 'object' || Array.isArray(item.ppe)) item.ppe = {};
  item.aktivitas  = _safeParseJSON(item.aktivitas, []);
  if (!Array.isArray(item.aktivitas)) item.aktivitas = [];
  item.spareParts = _safeParseJSON(item.spareParts, []);
  if (!Array.isArray(item.spareParts)) item.spareParts = [];
  return item;
}

// FIX: sebelumnya _buildReportIndex didefinisikan DUA KALI (versi kedua menimpa
// versi pertama secara diam-diam) — sekarang hanya satu definisi yang benar,
// dibangun dari getData() supaya field JSON sudah ter-sanitize.
// FIX: hanya laporan TAHUN BERJALAN yang dihitung. Dulu laporan tahun lalu
// juga ikut, sehingga begitu masuk Januari semua equipment yang pernah di-PM
// langsung berstatus "done" setahun penuh (Schedule PM sendiri sudah memakai
// aturan tahun berjalan lewat _hasReportThisYear — sekarang konsisten).
function _buildReportIndex() {
  if (_reportIndexCache) return _reportIndexCache;
  _reportIndexCache = new Set();
  const curYear = new Date().getFullYear();
  const arr = getData(STORE.REPORTS).filter(r => r.date && new Date(r.date).getFullYear() === curYear);
  arr.forEach(r => {
    const tag  = (r.tagNo||'').trim().toLowerCase();
    const name = (r.equipmentName||'').trim().toLowerCase();
    const unit = (r.unit||'').trim().toLowerCase();
    if (tag)  _reportIndexCache.add('tag:' + tag);
    if (name) _reportIndexCache.add('eq:' + name + '|' + unit);
  });
  return _reportIndexCache;
}

function getData(key) {
  try {
    const raw = _useLS ? localStorage.getItem(key) : _mem[key];
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    if (key === STORE.REPORTS) return parsed.map(_sanitizeReport);
    return parsed;
  } catch { return []; }
}

function setData(key, val) {
  try {
    // Teks bebas dinetralkan saat DITULIS (bukan saat dibaca — getData dipanggil
    // ratusan kali per render). Lihat neutralizeText() di 01-utils.js.
    if ((key === STORE.REPORTS || key === STORE.SCHEDULES) && Array.isArray(val)) {
      val = val.filter(r => r && isSafeId(r.id)).map(neutralizeDeep);
    }
    const str = JSON.stringify(val);
    if (_useLS) localStorage.setItem(key, str);
    else _mem[key] = str;
    _invalidateCache();
    _onDataChanged(key);
  } catch(e) { console.warn('setData err:', e); }
}

// Dipanggil setiap kali data berubah — refresh halaman aktif.
// FIX: guard re-entrancy supaya rangkaian setData() beruntun tidak memicu
// render bertumpuk / infinite loop pada halaman yang sama.
let _onDataChangedLock = false;
function _onDataChanged(changedKey) {
  if (_onDataChangedLock) return;
  _onDataChangedLock = true;
  try {
    const activePage = document.querySelector('.page.active')?.id || '';
    updateSidebarBadges();
    populateUnitFilters();

    if (activePage === 'page-dashboard')         renderDashboard();
    if (activePage === 'page-schedule')          renderScheduleList();
    if (activePage === 'page-list')              renderReportPage();
    if (activePage === 'page-input-pm')          renderInputPMPage();
    if (activePage === 'page-outstanding')       renderOutstandingPage();
    if (activePage === 'page-takeover')          renderTakeoverPage();
    if (activePage === 'page-resume')            renderResumePage();
    if (activePage === 'page-schedule-calendar') renderCalMonthView();
  } finally {
    _onDataChangedLock = false;
  }
}

// ── MERGE (bukan overwrite) ──────────────────────────────
// Dipakai oleh sync.js: menggabungkan array lokal dan array dari server
// per-record berdasarkan id, dengan pembanding "siapa yang lebih baru".
// - Record yang HANYA ada di lokal (belum sempat ke server, misalnya baru saja
//   disimpan atau masih di antrian sync) selalu dipertahankan.
// - Record yang ada di keduanya: dibandingkan updatedAt/submittedAt — yang
//   lebih baru menang. Ini mencegah auto-sync menimpa perubahan yang baru saja
//   dibuat pengguna lain (atau diri sendiri) yang belum sempat diambil ulang.
function _recordStamp(r) {
  const t = r.updatedAt || r.submittedAt || r.takeoverAt || r.lastDone || 0;
  const n = t ? new Date(t).getTime() : 0;
  return isNaN(n) ? 0 : n;
}

// deletedIds: id yang sudah dihapus di server (tombstone).
// FIX: dulu record yang dihapus di perangkat A tetap hidup selamanya di
// perangkat B (merge selalu mempertahankan record "hanya ada di lokal"), dan
// bisa terkirim ulang ke server begitu B mengeditnya.
function mergeById(localArr, remoteArr, pendingIds, deletedIds) {
  const map = new Map();
  (localArr||[]).forEach(item => { if (item && item.id) map.set(item.id, item); });

  if (deletedIds) deletedIds.forEach(id => {
    if (!(pendingIds && pendingIds.has(id))) map.delete(id);
  });

  (remoteArr||[]).forEach(remote => {
    if (!remote || !isSafeId(remote.id)) return;
    // Jangan biarkan sync menimpa record yang masih menunggu di antrian upload lokal —
    // baru boleh ditimpa server setelah antrian untuk id itu berhasil terkirim.
    if (pendingIds && pendingIds.has(remote.id)) return;

    const local = map.get(remote.id);
    if (!local) { map.set(remote.id, remote); return; }
    map.set(remote.id, _recordStamp(remote) >= _recordStamp(local) ? remote : local);
  });

  return Array.from(map.values());
}
