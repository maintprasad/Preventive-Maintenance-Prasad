// ════════════════════════════════════════════════════════
//  API — panggilan ke backend (Vercel api/db.js → Turso) + antrian offline
// ════════════════════════════════════════════════════════

// Kunci akses aplikasi. Kalau di Vercel diset APP_ACCESS_KEY, server menolak
// request tanpa kunci (HTTP 401). Kunci diminta SEKALI ke pengguna lalu
// disimpan di perangkat ini — tidak pernah ditulis di source code.
function _getAppKey() { try { return localStorage.getItem(STORE_APP_KEY) || ''; } catch { return ''; } }
function _setAppKey(k) { try { localStorage.setItem(STORE_APP_KEY, k); } catch {} }

let _keyPromptDeclined = false;
let _keyPromptOpen = null;
function _askAppKey() {
  if (_keyPromptDeclined) return Promise.resolve(false);
  if (_keyPromptOpen) return _keyPromptOpen;     // banyak request 401 sekaligus → cukup satu prompt
  _keyPromptOpen = new Promise(resolve => {
    setTimeout(() => {
      const k = prompt('Masukkan KUNCI AKSES aplikasi PM (minta ke admin):');
      _keyPromptOpen = null;
      if (k && k.trim()) { _setAppKey(k.trim()); resolve(true); }
      else { _keyPromptDeclined = true; resolve(false); }
    }, 0);
  });
  return _keyPromptOpen;
}

class ApiAuthError extends Error {}

// FIX: dulu seluruh payload dikirim lewat query string GET. Laporan dengan
// checklist panjang dan terutama TANDA TANGAN (gambar base64 puluhan KB)
// melewati batas panjang URL sehingga saveSignature SELALU gagal diam-diam.
// Sekarang POST JSON ke backend sendiri (same-origin, tanpa batas URL).
async function api(action, params = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Key': _getAppKey() },
        body: JSON.stringify({ action, deviceId: DEVICE_ID, ...params })
      });
      if (res.status === 401) {
        if (await _askAppKey()) continue;        // coba lagi dengan kunci baru
        throw new ApiAuthError('Kunci akses salah / belum diisi');
      }
      const json = await res.json().catch(() => null);
      if (!json) throw new Error('HTTP ' + res.status);
      // 4xx = data ditolak validasi server → jangan di-retry, kembalikan apa adanya.
      if (res.status >= 400 && res.status < 500) return json;
      if (!res.ok) throw new Error(json.message || 'HTTP ' + res.status);
      return json;
    } catch (e) {
      if (e instanceof ApiAuthError || attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 1500 * Math.pow(2, attempt)));
    }
  }
}

// Kirim langsung; kalau gagal (offline / server error / success:false) → antrian.
// FIX: beberapa pemanggil lama hanya menangkap exception (`.catch`) — balasan
// {success:false} dari server dianggap sukses dan perubahan hilang.
async function apiOrQueue(action, payload, recordId) {
  try {
    const res = await api(action, payload, 1);
    if (res && res.success) return true;
    enqueueSync(action, payload, recordId);
  } catch (e) {
    enqueueSync(action, payload, recordId);
  }
  setSyncStatus('error', 'Masuk antrian sync');
  return false;
}

async function pingSheets() {
  try {
    const res = await api('ping', {}, 1);
    if (res.success) {
      setSyncStatus('online', 'Connected ✓');
      toast('✅ Database terhubung: ' + res.ts, 'success');
    }
  } catch(e) {
    setSyncStatus('error', 'Ping gagal');
    toast('❌ Tidak bisa terhubung ke database', 'error');
  }
}

// ── ANTRIAN SYNC (queue FIFO) ────────────────────────────
// Setiap item punya recordId eksplisit sehingga sync.js bisa tahu ID mana
// yang "masih dalam proses upload" dan harus dilindungi dari ditimpa oleh
// data yang datang dari auto-sync/pull server (lihat mergeById + pendingIds).
function _newQid() { return 'Q-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6); }
function _readQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(STORE_QUEUE) || '[]');
    if (!Array.isArray(q)) return [];
    // Antrian dari versi lama belum punya qid — beri sekali lalu simpan.
    if (q.some(i => !i.qid)) { q.forEach(i => { if (!i.qid) i.qid = _newQid(); }); _writeQueue(q); }
    return q;
  } catch { return []; }
}
function _writeQueue(q) {
  try { localStorage.setItem(STORE_QUEUE, JSON.stringify(q)); } catch(e) { console.warn('[Queue] write error:', e); }
}

function enqueueSync(action, payload, recordId) {
  const q = _readQueue();
  const item = {
    qid: _newQid(),
    action, payload, recordId: recordId || null, queuedAt: new Date().toISOString(), retries: 0
  };
  // Aksi yang sama untuk record yang sama cukup disimpan versi TERBARU-nya —
  // mengirim versi lama lebih dulu hanya membuang kuota & berisiko menimpa.
  const idx = recordId ? q.findIndex(i => i.action === action && i.recordId === recordId) : -1;
  if (idx >= 0) q[idx] = { ...item, retries: q[idx].retries }; else q.push(item);
  _writeQueue(q);
}

function _getQueueCount() { return _readQueue().length; }

// Semua id record yang masih menunggu terkirim — dipakai store.js/mergeById
// supaya auto-sync tidak menimpa perubahan yang belum sempat diupload.
function getPendingRecordIds() {
  return new Set(_readQueue().map(i => i.recordId).filter(Boolean));
}

let _flushingQueue = false;
async function flushSyncQueue() {
  if (_flushingQueue) return; // cegah beberapa flush berjalan bersamaan
  if (!backendEnabled()) return;
  _flushingQueue = true;
  try {
    const q = _readQueue();
    if (!q.length) return;

    const done = new Set();      // qid yang sudah selesai diproses (sukses ATAU ditolak permanen)
    const bumped = new Map();    // qid → item dengan retries+1
    let successCount = 0, rejected = 0;

    // FIFO — diproses berurutan (bukan Promise.all) supaya urutan submit terjaga.
    for (const item of q) {
      try {
        const res = await api(item.action, item.payload, 1);
        if (res?.success) { successCount++; done.add(item.qid); }
        else if (res?.rejected) {
          // Ditolak validasi server (data rusak) — mencoba ulang tidak akan pernah berhasil.
          rejected++; done.add(item.qid);
          console.warn('[Queue] ditolak server:', item, res.message);
        } else bumped.set(item.qid, { ...item, retries: (item.retries || 0) + 1 });
      } catch(e) {
        bumped.set(item.qid, { ...item, retries: (item.retries || 0) + 1 });
        if (e instanceof ApiAuthError) break;
      }
    }

    // FIX (kehilangan data): dulu antrian ditulis ulang dengan `failed` saja,
    // sehingga (a) item yang di-enqueue SELAMA flush berjalan ikut terhapus, dan
    // (b) item yang gagal >3x dibuang diam-diam. Sekarang antrian dibaca ulang
    // dan hanya item yang benar-benar selesai yang dikeluarkan; sisanya tetap
    // menunggu sampai berhasil.
    const remaining = _readQueue()
      .filter(i => !done.has(i.qid))
      .map(i => bumped.get(i.qid) || i);
    _writeQueue(remaining);

    if (successCount > 0) toast(`☁ ${successCount} data pending berhasil tersync`, 'success');
    if (rejected > 0)     toast(`❌ ${rejected} data ditolak server (lihat console)`, 'error');
    if (remaining.length > 0) toast(`⚠ ${remaining.length} data masih menunggu sync`, 'warning');

    setSyncStatus(
      remaining.length > 0 ? 'error' : 'online',
      remaining.length > 0 ? `${remaining.length} item belum tersync` : 'Tersinkron ✓'
    );
  } catch(e) {
    console.warn('[Queue] flush error:', e);
  } finally {
    _flushingQueue = false;
  }
}

window.addEventListener('online', () => flushSyncQueue());
