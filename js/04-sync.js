// ════════════════════════════════════════════════════════
//  SYNC — auto-sync aman untuk multi-user
//
//  Masalah lama: syncFromSheets() menimpa TOTAL isi STORE.REPORTS /
//  STORE.SCHEDULES dengan apa pun yang dikembalikan server. Jika Teknisi A
//  sedang mengisi form laporan dan Teknisi B melakukan sync di perangkat lain
//  tepat saat itu, perubahan A bisa tertimpa / hilang begitu A submit.
//
//  Perbaikan di sini:
//  1. Merge per-record (mergeById) berdasarkan timestamp — bukan overwrite total.
//  2. Record yang masih di antrian upload lokal (belum sukses ke server) TIDAK
//     pernah ditimpa oleh hasil pull server (lihat getPendingRecordIds()).
//  3. Auto-sync ditunda (bukan dibatalkan) kalau user sedang aktif mengisi
//     form laporan PM atau ada modal/overlay yang terbuka — supaya UI di
//     bawah tangan pengguna tidak berubah/ke-reset saat sedang mengetik.
//  4. Equipment yang sedang "dikerjakan" oleh user lain dikunci lewat
//     lock.js — mencegah dua teknisi eksekusi PM yang sama secara bersamaan
//     dan saling menimpa jadwal (lihat 05-lock.js).
// ════════════════════════════════════════════════════════

let isSyncing = false;
let _autoSyncTimer = null;

// Kursor sync inkremental: auto-sync hanya menarik record yang berubah sejak
// sync terakhir (hemat kuota baca Turso & data seluler). Sync manual (tombol
// ↻ Sync) selalu menarik SEMUA sebagai jaring pengaman.
const STORE_SYNC_CURSOR = 'pm_sync_cursor_v1';
function _getCursors() { try { return JSON.parse(localStorage.getItem(STORE_SYNC_CURSOR) || '{}') || {}; } catch { return {}; } }
function _setCursor(k, v) { if (!v) return; const c = _getCursors(); c[k] = v; try { localStorage.setItem(STORE_SYNC_CURSOR, JSON.stringify(c)); } catch {} }

function setSyncStatus(s, msg) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const ico = {online:'🟢',syncing:'🔄',offline:'⚫',error:'🟡'};
  const qCount = _getQueueCount();
  const qLabel = qCount > 0 ? ` (${qCount} pending)` : '';
  el.textContent = (ico[s]||'⚪') + ' ' + (msg||s) + qLabel;
  el.className = 'sync-badge sync-' + s;
}

// Form laporan PM dianggap "dirty" (sedang aktif diisi) kalau field inti
// sudah diisi user atau kita sedang dalam mode edit laporan.
function isReportFormDirty() {
  const editId = document.getElementById('pm-edit-id')?.value || '';
  if (editId) return true;
  const fields = ['pm-tagno','pm-equipment-name','pm-teknisi'];
  return fields.some(id => (document.getElementById(id)?.value || '').trim() !== '');
}

function anyOverlayOpen() {
  return !!document.querySelector('.overlay.open');
}

function isSyncSensitiveMoment() {
  return isReportFormDirty() || anyOverlayOpen();
}

// auto = true  → dipanggil otomatis (saat load / polling berkala): boleh ditunda.
// auto = false → dipanggil manual (tombol ↻ Sync): selalu jalan, beri tahu user
//                kalau ada form terbuka supaya tidak kaget datanya "berubah".
async function syncFromSheets(auto = false) {
  if (isSyncing) return;
  if (!backendEnabled()) {
    if (!auto) toast('Mode offline — buka aplikasi lewat alamat Vercel untuk sync', 'warning');
    return;
  }

  if (auto && isSyncSensitiveMoment()) {
    // Jangan paksa sync sekarang — coba lagi di siklus polling berikutnya.
    setSyncStatus('offline', 'Sync ditunda — form sedang diisi');
    return;
  }

  isSyncing = true;
  setSyncStatus('syncing', 'Sinkronisasi...');
  document.querySelectorAll('[onclick="syncFromSheets()"], .js-sync-btn').forEach(b => {
    b.dataset._label = b.dataset._label || b.textContent;
    b.textContent = '⏳ Sync...'; b.disabled = true;
  });

  try {
    // Kirim antrian lokal DULU, baru tarik data server — supaya perubahan
    // offline sudah ada di server sebelum dibandingkan.
    await flushSyncQueue();

    const cur = auto ? _getCursors() : {};
    const [schRes, repRes, sigRes] = await Promise.allSettled([
      api('getSchedules',  { since: cur.schedules  || '' }, 2),
      api('getReports',    { since: cur.reports    || '' }, 2),
      api('getSignatures', { since: cur.signatures || '' }, 1)
    ]);
    const schOK = schRes.status === 'fulfilled' && schRes.value?.success && Array.isArray(schRes.value.schedules);
    const repOK = repRes.status === 'fulfilled' && repRes.value?.success && Array.isArray(repRes.value.reports);

    const pendingIds = getPendingRecordIds();

    if (schOK) {
      const merged = mergeById(getData(STORE.SCHEDULES), schRes.value.schedules, pendingIds, schRes.value.deleted);
      setData(STORE.SCHEDULES, merged);
      _setCursor('schedules', schRes.value.cursor);
    }
    if (repOK) {
      const sanitizedRemote = repRes.value.reports.map(_sanitizeReport);
      const merged = mergeById(getData(STORE.REPORTS), sanitizedRemote, pendingIds, repRes.value.deleted);
      setData(STORE.REPORTS, merged);
      _setCursor('reports', repRes.value.cursor);
    }
    // Tanda tangan dari perangkat lain (dulu TTD hanya tersimpan di perangkat
    // yang membuatnya, jadi PDF di perangkat lain selalu tanpa tanda tangan).
    if (sigRes.status === 'fulfilled' && sigRes.value?.success && Array.isArray(sigRes.value.signatures)) {
      mergeRemoteSignatures(sigRes.value.signatures);
      _setCursor('signatures', sigRes.value.cursor);
    }

    _invalidateCache();

    if (schOK && repOK) {
      setSyncStatus('online', 'Tersinkron ' + new Date().toLocaleTimeString('id-ID'));
      if (!auto) toast('Data tersinkron dari database', 'success');
    } else {
      setSyncStatus('error', 'Sebagian data gagal sync');
      if (!auto) toast('⚠ Sebagian data gagal sync', 'warning');
    }

    // Refresh terkendali: jangan render ulang form laporan yang sedang aktif diisi.
    if (!isReportFormDirty()) {
      renderAll();
    } else {
      // tetap perbarui bagian yang aman (dashboard/badge), form dibiarkan utuh.
      updateSidebarBadges();
      populateUnitFilters();
    }

    if (typeof refreshLockBadges === 'function') refreshLockBadges();
  } catch(e) {
    setSyncStatus('error', 'Gagal sync — data lokal');
    if (!auto) toast('Gagal sync, pakai data lokal', 'warning');
    console.warn('[PM] syncFromSheets error:', e);
  } finally {
    isSyncing = false;
    document.querySelectorAll('[onclick="syncFromSheets()"], .js-sync-btn').forEach(b => {
      b.textContent = b.dataset._label || '↻ Sync'; b.disabled = false;
    });
  }
}

function renderAll() {
  const active = document.querySelector('.page.active')?.id || '';
  _invalidateCache();
  populateUnitFilters();
  updateSidebarBadges();
  renderDashboard();
  if (active === 'page-schedule')          renderScheduleList();
  if (active === 'page-list')              renderReportPage();
  if (active === 'page-input-pm')          renderInputPMPage();
  if (active === 'page-outstanding')       renderOutstandingPage();
  if (active === 'page-takeover')          renderTakeoverPage();
  if (active === 'page-resume')            renderResumePage();
  if (active === 'page-schedule-calendar') renderCalendar();
}

function startAutoSync() {
  // Sync sekali begitu halaman dibuka...
  syncFromSheets(true);
  // ...lalu polling berkala supaya perubahan dari teknisi lain terlihat
  // tanpa perlu klik manual, tapi tetap aman (auto=true → ditunda kalau perlu).
  if (_autoSyncTimer) clearInterval(_autoSyncTimer);
  _autoSyncTimer = setInterval(() => syncFromSheets(true), AUTO_SYNC_POLL_MS);

  // Sync juga saat tab kembali terlihat (misal teknisi buka lagi setelah lama idle)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncFromSheets(true);
  });
}

// ════════════════════════════════════════════════════════
//  MIGRASI SEKALI JALAN: Google Sheets (GAS lama) + data lokal → Turso
//  Jalankan dari tombol "⇪ Migrasi data lama" di halaman Template, atau
//  ketik migrateFromSheets() di console browser. Aman diulang: server
//  memakai UPSERT berdasarkan id + updatedAt (yang lebih baru menang).
// ════════════════════════════════════════════════════════
async function migrateFromSheets() {
  if (!backendEnabled()) { toast('Buka aplikasi lewat alamat Vercel dulu', 'warning'); return; }
  if (!confirm('Salin semua data dari Google Sheets lama + data di perangkat ini ke database Turso?\n\nData yang sudah ada di Turso tidak dihapus.')) return;

  const legacy = async action => {
    const url = `${LEGACY_SHEETS_URL}?data=${encodeURIComponent(JSON.stringify({ action, deviceId: DEVICE_ID }))}`;
    const res = await fetch(url);
    return res.json();
  };

  setSyncStatus('syncing', 'Migrasi data...');
  try {
    let gasSch = [], gasRep = [], gasTmpl = {};
    try {
      const [s, r, t] = await Promise.all([legacy('getSchedules'), legacy('getReports'), legacy('getTemplates').catch(() => ({}))]);
      gasSch  = Array.isArray(s?.schedules) ? s.schedules : [];
      gasRep  = Array.isArray(r?.reports)   ? r.reports   : [];
      gasTmpl = (t && t.templates) || {};
    } catch (e) {
      if (!confirm('Google Sheets lama tidak bisa dihubungi. Lanjutkan hanya dengan data di perangkat ini?')) return;
    }

    const schedules = mergeById(getData(STORE.SCHEDULES), gasSch.filter(s => s && isSafeId(s.id)));
    const reports   = mergeById(getData(STORE.REPORTS),   gasRep.map(_sanitizeReport).filter(r => r && isSafeId(r.id)))
                        .map(serializeReport);
    const sigs = Object.entries(getLocalSigs()).filter(([id]) => isSafeId(id)).map(([pmId, s]) => ({
      pmId, spvName: s.spvName || '', spvSignature: s.spvSig || '', spvSignedAt: s.spvAt || '',
      leaderName: s.leaderName || '', leaderSignature: s.leaderSig || '', leaderSignedAt: s.leaderAt || '',
      updatedAt: s.updatedAt || ''
    }));
    const templates = { ...getLocalTemplates(), ...gasTmpl };

    const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
    const batches = [
      ...chunk(schedules, 100).map(c => ({ schedules: c })),
      ...chunk(reports,   100).map(c => ({ reports: c })),
      ...chunk(sigs,       15).map(c => ({ signatures: c })),
      { templates }
    ];

    let sent = 0, rejected = 0;
    for (const b of batches) {
      const res = await api('bulkUpsert', b, 2);
      if (!res?.success) throw new Error(res?.message || 'bulkUpsert gagal');
      sent += res.count || 0;
      rejected += res.rejected || 0;
    }
    toast(`✅ Migrasi selesai: ${sent} record terkirim${rejected ? `, ${rejected} ditolak (data rusak)` : ''}`, 'success');
    await syncFromSheets(false);
  } catch (e) {
    console.error('[Migrasi]', e);
    setSyncStatus('error', 'Migrasi gagal');
    toast('❌ Migrasi gagal: ' + e.message, 'error');
  }
}
