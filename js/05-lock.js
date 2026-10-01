// ════════════════════════════════════════════════════════
//  LOCK — "sedang dikerjakan oleh siapa" per equipment/schedule
//
//  Masalah yang diperbaiki: sebelumnya tidak ada penanda apa pun kalau dua
//  teknisi membuka "Eksekusi PM" untuk equipment yang sama secara bersamaan.
//  Keduanya bisa submit laporan terpisah dan saling menimpa
//  s.lastDone/schedule.month/week lewat updateScheduleLastDone(), atau
//  membuat 2 laporan duplikat untuk 1 jadwal.
//
//  Solusi: sebelum form Input PM dibuka untuk suatu schedule, klien meminta
//  "lock" ke server (Apps Script, lihat gas/LockService.gs). Kalau equipment
//  itu sedang dikunci oleh device lain dan belum kedaluwarsa (LOCK_TTL_MS),
//  eksekusi diblokir dan user diberi tahu siapa yang sedang mengerjakan.
//  Lock dilepas otomatis saat submit / batal / form ditinggalkan / TTL habis,
//  dan diperbarui (heartbeat) selama form terbuka supaya tidak kedaluwarsa
//  saat teknisi masih bekerja lambat di lapangan.
//
//  Degradasi aman: jika backend belum punya endpoint lock (mis. GAS lama
//  belum diupdate), semua pemanggilan dibungkus try/catch dan sistem tetap
//  berjalan tanpa lock (hanya sekali memberi peringatan).
// ════════════════════════════════════════════════════════

let _locksCache = {};       // scheduleId -> {deviceId, name, acquiredAt}
let _activeLockId = null;   // schedule id yang sedang dikunci OLEH device ini
let _lockHeartbeatTimer = null;
let _lockBackendWarned = false;

// FIX: dulu hanya acquiredAt yang dicek — lock yang masih rajin di-heartbeat
// dianggap kedaluwarsa oleh device lain setelah 15 menit, tombol Eksekusi
// muncul lagi, padahal server tetap menolak. Sekarang pakai heartbeat terakhir.
function _lockIsExpired(lock) {
  const t = lock && (lock.heartbeatAt || lock.acquiredAt);
  if (!t) return true;
  return (Date.now() - new Date(t).getTime()) > LOCK_TTL_MS;
}

async function refreshLockBadges() {
  try {
    const res = await api('getLocks', {}, 0);
    if (res && res.success && Array.isArray(res.locks)) {
      const map = {};
      res.locks.forEach(l => { if (!_lockIsExpired(l)) map[l.scheduleId] = l; });
      _locksCache = map;
    }
  } catch (e) {
    if (!_lockBackendWarned) {
      _lockBackendWarned = true;
      console.warn('[Lock] backend lock endpoint belum tersedia, berjalan tanpa lock:', e);
    }
  }
  // Perbarui badge di halaman yang sedang tampil (ringan — tidak reset form)
  const active = document.querySelector('.page.active')?.id || '';
  if (active === 'page-schedule')  renderScheduleList();
  if (active === 'page-input-pm')  renderInputPMPage();
}

function getLockFor(scheduleId) {
  const l = _locksCache[scheduleId];
  if (!l || _lockIsExpired(l)) return null;
  return l;
}

function isLockedByOther(scheduleId) {
  const l = getLockFor(scheduleId);
  return !!(l && l.deviceId !== DEVICE_ID);
}

// Dipanggil sebelum membuka form Eksekusi PM. Mengembalikan true jika boleh lanjut.
async function acquirePMLock(scheduleId, equipmentName, byName) {
  try {
    const res = await api('acquireLock', { scheduleId, equipmentName, name: byName || '' }, 0);
    if (res && res.success === false && res.lockedBy) {
      _locksCache[scheduleId] = { deviceId: res.lockedBy, name: res.lockedByName || 'teknisi lain', acquiredAt: res.acquiredAt };
      toast(`⛔ "${equipmentName}" sedang dikerjakan oleh ${res.lockedByName || 'teknisi lain'}`, 'warning');
      return false;
    }
    // sukses (atau backend belum mendukung → res undefined/exception ditangkap di bawah)
    _locksCache[scheduleId] = { deviceId: DEVICE_ID, name: byName || 'Saya', acquiredAt: new Date().toISOString() };
    _activeLockId = scheduleId;
    _startLockHeartbeat();
    return true;
  } catch (e) {
    // Backend lock belum tersedia — jangan blokir pekerjaan, cukup jalan tanpa proteksi silang-device.
    if (!_lockBackendWarned) {
      _lockBackendWarned = true;
      toast('ℹ Mode tanpa lock-server — pastikan koordinasi manual dengan tim saat mengisi PM bersamaan', 'info');
    }
    _activeLockId = scheduleId;
    return true;
  }
}

async function releasePMLock(scheduleId) {
  const id = scheduleId || _activeLockId;
  if (!id) return;
  // Heartbeat hanya dihentikan kalau yang dilepas memang lock aktif — melepas
  // lock LAMA saat pindah equipment tidak boleh mematikan heartbeat lock baru.
  if (_activeLockId === id) { _stopLockHeartbeat(); _activeLockId = null; }
  delete _locksCache[id];
  try { await api('releaseLock', { scheduleId: id }, 0); } catch (e) { /* best effort */ }
}

function _startLockHeartbeat() {
  _stopLockHeartbeat();
  _lockHeartbeatTimer = setInterval(async () => {
    if (!_activeLockId) return;
    try { await api('heartbeatLock', { scheduleId: _activeLockId }, 0); } catch (e) { /* ignore, TTL akan handle */ }
  }, LOCK_HEARTBEAT_MS);
}
function _stopLockHeartbeat() {
  if (_lockHeartbeatTimer) { clearInterval(_lockHeartbeatTimer); _lockHeartbeatTimer = null; }
}

// Lepas lock kalau pengguna menutup tab / pindah tanpa submit — best effort,
// browser hanya menjamin sendBeacon pada saat unload.
window.addEventListener('beforeunload', () => {
  if (_activeLockId && navigator.sendBeacon && backendEnabled()) {
    try {
      // sendBeacon tidak bisa memasang header → kunci akses ikut di body.
      const payload = JSON.stringify({ action: 'releaseLock', deviceId: DEVICE_ID, scheduleId: _activeLockId, appKey: _getAppKey() });
      navigator.sendBeacon(API_URL, payload);
    } catch (e) {}
  }
});

function lockBadgeHTML(scheduleId) {
  const l = getLockFor(scheduleId);
  if (!l) return '';
  if (l.deviceId === DEVICE_ID) return `<span class="badge b-locked" title="Sedang Anda kerjakan">✍ Anda kerjakan</span>`;
  return `<span class="badge b-locked" title="Sedang dikerjakan">🔒 ${l.name || 'Dikerjakan'}</span>`;
}
