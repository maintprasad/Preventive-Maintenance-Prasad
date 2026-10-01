// ════════════════════════════════════════════════════════
//  WORK ORDER ⇄ PM — jembatan antara laporan PM dan aplikasi WO
//
//  Alur yang didukung:
//   A. Teknisi mengisi checklist PM → ada item ditandai NO (anomali)
//      → bar anomali muncul → "Buat WO" → 1 WO berisi semua anomali.
//      WO boleh dibuat SEBELUM laporan disubmit; saat submitPM() berhasil,
//      WO tersebut otomatis di-link ke id laporan yang baru dibuat
//      (linkPendingWOToReport) sehingga tidak ada WO yatim tanpa pmId.
//   B. Dari Daftar Laporan, WO dibuat dari laporan yang sudah tersimpan.
//   C. WO tersimpan lokal dulu, lalu disinkronkan ke backend WO. Kalau
//      gagal/offline → masuk antrian (STORE_WO_QUEUE) dan di-retry otomatis.
//   D. Status WO (open/dikerjakan/closed) bisa ditarik balik dari backend WO
//      dan ditampilkan sebagai badge di kartu laporan PM.
// ════════════════════════════════════════════════════════

// ── Penyimpanan (memakai fallback _mem seperti store PM, supaya tetap
//    berfungsi di browser yang memblokir localStorage / mode privat) ──
function _woRead(key) {
  try {
    const raw = _useLS ? localStorage.getItem(key) : _mem[key];
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function _woWrite(key, arr) {
  try {
    const s = JSON.stringify(arr);
    if (_useLS) localStorage.setItem(key, s); else _mem[key] = s;
    return true;
  } catch (e) { console.warn('[WO] gagal menulis', key, e); return false; }
}

// Backend WO menyimpan anomaliItems/materialRequests sebagai STRING JSON.
// Saat dibaca kembali, bentuknya harus dinormalkan supaya .length/.map aman.
function _sanitizeWO(w) {
  if (!w) return w;
  w.anomaliItems     = _safeParseJSON(w.anomaliItems, []);
  if (!Array.isArray(w.anomaliItems)) w.anomaliItems = [];
  w.materialRequests = _safeParseJSON(w.materialRequests, []);
  if (!Array.isArray(w.materialRequests)) w.materialRequests = [];
  w.status = (w.status || 'open').toString().toLowerCase().replace(/[\s-]+/g, '_');
  return w;
}

function getWO()      { return _woRead(STORE_WO).map(_sanitizeWO); }
function setWO(data)  { return _woWrite(STORE_WO, data); }

// Index cepat: pmId → WO (dipakai renderReportPage untuk badge status).
let _woIndexCache = null;
function _invalidateWOCache() { _woIndexCache = null; }
function _buildWOIndex() {
  if (_woIndexCache) return _woIndexCache;
  _woIndexCache = new Map();
  getWO().forEach(w => { if (w.pmId) _woIndexCache.set(w.pmId, w); });
  return _woIndexCache;
}
/** WO yang terkait sebuah laporan PM, atau null. */
function getWOForReport(pmId) {
  if (!pmId) return null;
  return _buildWOIndex().get(pmId) || null;
}

// ── Sesi form ────────────────────────────────────────────
// Dipakai untuk menautkan WO yang dibuat SEBELUM laporan disubmit.
// eksekusiPM()/clearPMForm() akan memanggil resetWOFormSession().
let _woFormSession = null;
function resetWOFormSession() {
  _woFormSession = 'WOS-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2,5);
}
function getWOFormSession() {
  if (!_woFormSession) resetWOFormSession();
  return _woFormSession;
}

/**
 * Dipanggil dari submitPM() setelah laporan tersimpan.
 * Menautkan WO "yatim" (pmId kosong) yang dibuat pada sesi form ini ke id
 * laporan yang baru dibuat, lalu ikut memperbarui data di server WO.
 * FIX bug lama: dulu WO yang dibuat sebelum submit selalu punya pmId === ''
 * sehingga badge "WO ✓" tidak pernah muncul di Daftar Laporan dan pengguna
 * bisa membuat WO kedua untuk anomali yang sama.
 */
function linkPendingWOToReport(reportId) {
  if (!reportId) return 0;
  const sess = _woFormSession;
  if (!sess) return 0;
  const list = getWO();
  let linked = 0;
  list.forEach(w => {
    if (!w.pmId && w.formSessionId === sess) {
      w.pmId = reportId;
      w.updatedAt = new Date().toISOString();
      linked++;
      _syncWOToServer(w, true);
    }
  });
  if (linked) { setWO(list); _invalidateWOCache(); }
  return linked;
}

// ── Pengumpulan anomali ─────────────────────────────────
// Satu sumber kebenaran untuk kedua jalur (form aktif & laporan tersimpan),
// supaya tidak ada perbedaan hasil antara "Buat WO" dari form vs dari daftar.
function _collectAnomaliFromForm() {
  const out = [];
  document.querySelectorAll('#pm-aktivitas-tbody tr').forEach(row => {
    if (!row.querySelector('.pm-no')?.checked) return;
    out.push({
      uraian: row.cells[1]?.textContent?.trim() || '',
      ket:    row.querySelector('.pm-keterangan')?.value?.trim() || ''
    });
  });
  return out;
}
function _collectAnomaliFromReport(r) {
  return (r?.aktivitas || [])
    .filter(a => a.no_checked)
    .map(a => ({ uraian: a.uraian || '', ket: a.keterangan || '' }));
}

function _anomaliListHTML(items, compact) {
  if (!items.length) return '<div style="font-size:12px;color:var(--text3)">—</div>';
  return items.map((a,i) => compact
    ? `<div style="display:flex;align-items:flex-start;gap:8px;font-size:12px">
         <span style="color:var(--red);font-family:'IBM Plex Mono',monospace;flex-shrink:0">${i+1}.</span>
         <span><strong>${escapeHtml(a.uraian)}</strong>${a.ket?` <span style="color:var(--text3)">— ${escapeHtml(a.ket)}</span>`:''}</span>
       </div>`
    : `<div style="display:flex;gap:8px;font-size:12px;padding:5px 0;border-bottom:1px solid rgba(192,57,43,.15)">
         <span style="color:var(--red);font-family:'IBM Plex Mono',monospace;flex-shrink:0">${i+1}.</span>
         <div><div style="font-weight:500">${escapeHtml(a.uraian)}</div>${a.ket?`<div style="font-size:11px;color:var(--text3)">${escapeHtml(a.ket)}</div>`:''}</div>
       </div>`
  ).join('');
}

// ════════════════════════════════════════════════════════
//  TRANSPORT KE BACKEND WO (+ antrian retry)
// ════════════════════════════════════════════════════════
// FIX bug lama: seluruh payload WO (deskripsi + semua anomali) dikirim lewat
// query string GET. Checklist panjang membuat URL melewati batas aman
// (~2000 karakter) dan request gagal diam-diam. Sekarang: payload kecil tetap
// lewat GET (kompatibel dengan backend doGet yang sudah ada), payload besar
// otomatis lewat POST text/plain (tanpa preflight CORS, dibaca doPost via
// e.postData.contents — lihat gas/WOEndpoint.gs).
const WO_GET_MAX_URL = 1800;

async function woApi(action, params = {}, retries = 1) {
  const bodyObj  = { action, deviceId: DEVICE_ID, ...params };
  const bodyJson = JSON.stringify(bodyObj);
  const getUrl   = `${WO_URL}?data=${encodeURIComponent(bodyJson)}`;
  const useGet   = getUrl.length <= WO_GET_MAX_URL;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = useGet
        ? await fetch(getUrl)
        : await fetch(WO_URL, {
            method: 'POST',
            // text/plain menghindari CORS preflight yang tidak dilayani Apps Script
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: bodyJson
          });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

function _woEnqueue(action, payload, woId) {
  const q = _woRead(STORE_WO_QUEUE);
  // Dedupe: kalau sudah ada antrian aksi yang sama untuk WO yang sama,
  // ganti payloadnya saja supaya tidak menumpuk request usang.
  const idx = q.findIndex(i => i.action === action && i.woId === woId);
  const item = { action, payload, woId: woId || null, queuedAt: new Date().toISOString(), retries: 0 };
  if (idx >= 0) q[idx] = { ...item, retries: q[idx].retries }; else q.push(item);
  _woWrite(STORE_WO_QUEUE, q);
  _updateWOQueueBadge();
}

// ── Mode maintenance (WO_MAINTENANCE di 00-config.js) ──
// Semua pintu masuk WO berhenti di sini dengan pesan, tanpa request ke backend WO.
function woMaintenanceGuard(silent = false) {
  if (!WO_MAINTENANCE) return false;
  if (!silent) toast('🛠 Fitur Work Order sedang dalam maintenance', 'info');
  return true;
}

function getWOQueueCount() { return _woRead(STORE_WO_QUEUE).length; }

function _updateWOQueueBadge() {
  const el = document.getElementById('wo-queue-badge');
  if (!el) return;
  const n = getWOQueueCount();
  el.textContent = n ? `${n} WO belum tersync` : '';
  el.style.display = n ? 'inline-block' : 'none';
}

let _woFlushing = false;
async function flushWOQueue(silent = true) {
  if (woMaintenanceGuard(silent)) return;
  if (_woFlushing) return;                    // FIX: cegah dua flush berjalan bersamaan
  const q = _woRead(STORE_WO_QUEUE);
  if (!q.length) { _updateWOQueueBadge(); return; }
  _woFlushing = true;
  const failed = [];
  let ok = 0;
  try {
    for (const item of q) {                   // FIFO, berurutan — jaga urutan create→update
      try {
        const res = await woApi(item.action, item.payload, 0);
        if (res?.success) {
          ok++;
          if (item.woId) _markWOSynced(item.woId);
        } else if (item.retries < 5) {
          failed.push({ ...item, retries: item.retries + 1 });
        }
      } catch (e) {
        if (item.retries < 5) failed.push({ ...item, retries: item.retries + 1 });
      }
    }
    // FIX: dulu antrian langsung ditimpa `failed` — WO yang masuk antrian
    // SELAMA flush berjalan ikut terhapus. Sekarang antrian dibaca ulang dan
    // hanya item yang sudah diproses (objek yang sama persis) yang diganti.
    const processed = new Set(q.map(i => i.queuedAt + '|' + i.woId + '|' + i.action));
    const addedDuringFlush = _woRead(STORE_WO_QUEUE).filter(i => !processed.has(i.queuedAt + '|' + i.woId + '|' + i.action));
    _woWrite(STORE_WO_QUEUE, [...failed, ...addedDuringFlush]);
    _updateWOQueueBadge();
    if (ok && !silent)     toast(`☁ ${ok} Work Order berhasil tersync`, 'success');
    if (failed.length && !silent) toast(`⚠ ${failed.length} WO masih menunggu koneksi`, 'warning');
  } finally {
    _woFlushing = false;
    if (document.getElementById('woListOverlay')?.classList.contains('open')) renderWOList();
  }
}

function _markWOSynced(woId) {
  const list = getWO();
  const w = list.find(x => x.id === woId);
  if (!w) return;
  w.synced = true;
  w.syncedAt = new Date().toISOString();
  setWO(list);
  _invalidateWOCache();
}

function _woForServer(wo) {
  return {
    ...wo,
    anomaliItems:     JSON.stringify(wo.anomaliItems || []),
    materialRequests: JSON.stringify(wo.materialRequests || [])
  };
}

async function _syncWOToServer(wo, silent = false) {
  if (woMaintenanceGuard(true)) return false;
  const action = 'saveWO';
  try {
    const res = await woApi(action, { wo: _woForServer(wo) }, 1);
    if (res?.success) {
      _markWOSynced(wo.id);
      if (!silent) toast('☁ WO tersinkron ke database WO ✓', 'success');
      flushWOQueue();                          // sekalian kirim yang tertunda
      return true;
    }
    _woEnqueue(action, { wo: _woForServer(wo) }, wo.id);
    if (!silent) toast('⚠ WO tersimpan lokal — masuk antrian sync: ' + (res?.message || 'ditolak server'), 'warning');
    return false;
  } catch (e) {
    _woEnqueue(action, { wo: _woForServer(wo) }, wo.id);
    if (!silent) toast('⚠ WO tersimpan lokal, akan dikirim otomatis saat online', 'warning');
    console.warn('[WO] saveWO exception:', e);
    return false;
  }
}

/**
 * Tarik status WO terbaru dari backend WO dan gabungkan ke data lokal.
 * Degradasi aman: kalau backend belum punya action getWOs, fungsi diam saja
 * (WO tetap tampil dengan status lokal terakhir).
 */
let _woStatusBackendWarned = false;
async function refreshWOStatuses(silent = true) {
  if (woMaintenanceGuard(silent)) return false;
  try {
    const res = await woApi('getWOs', { sumber: 'PM' }, 0);
    if (!res?.success || !Array.isArray(res.wos)) return false;

    const local = getWO();
    const byId  = new Map(local.map(w => [w.id, w]));
    let changed = 0;

    res.wos.map(_sanitizeWO).forEach(remote => {
      const cur = byId.get(remote.id);
      if (!cur) {
        // WO yang dibuat dari perangkat lain — tampilkan juga di sini.
        byId.set(remote.id, { ...remote, synced: true });
        changed++;
        return;
      }
      // Status & assignee adalah milik aplikasi WO → server yang menang.
      if (cur.status !== remote.status || cur.assignee !== remote.assignee) {
        cur.status   = remote.status;
        cur.assignee = remote.assignee || cur.assignee;
        cur.closedAt = remote.closedAt || cur.closedAt;
        cur.synced   = true;
        changed++;
      }
    });

    if (changed) {
      setWO(Array.from(byId.values()));
      _invalidateWOCache();
      if (document.querySelector('.page.active')?.id === 'page-list') renderReportPage();
      if (document.getElementById('woListOverlay')?.classList.contains('open')) renderWOList();
      if (!silent) toast(`🔄 ${changed} status WO diperbarui`, 'info');
    } else if (!silent) {
      toast('Status WO sudah paling baru', 'info');
    }
    return true;
  } catch (e) {
    if (!_woStatusBackendWarned) {
      _woStatusBackendWarned = true;
      console.warn('[WO] endpoint getWOs belum tersedia — status WO memakai data lokal:', e);
    }
    if (!silent) toast('ℹ Backend WO belum mendukung sinkron status', 'info');
    return false;
  }
}

// ════════════════════════════════════════════════════════
//  BAR ANOMALI DI FORM LAPORAN PM
// ════════════════════════════════════════════════════════
function _updateWOBar() {
  const bar  = document.getElementById('wo-summary-bar');
  const list = document.getElementById('wo-summary-list');
  const btn  = document.getElementById('wo-summary-btn');
  if (!bar || !list) return;

  const anomaliItems = _collectAnomaliFromForm();
  if (!anomaliItems.length) { bar.style.display = 'none'; return; }

  bar.style.display = 'block';
  list.innerHTML = _anomaliListHTML(anomaliItems, true);

  if (!btn) return;

  if (WO_MAINTENANCE) {
    btn.textContent = '🛠 WO sedang maintenance';
    btn.disabled = true;
    btn.style.opacity = '.6';
    btn.title = 'Fitur Work Order sedang dalam maintenance';
    return;
  }

  // Cek WO yang sudah ada: lewat pmId (mode edit) ATAU lewat sesi form
  // (WO dibuat di sesi pengisian ini tapi laporannya belum disubmit).
  const pmId = document.getElementById('pm-edit-id')?.value || '';
  const existing = (pmId && getWOForReport(pmId))
    || getWO().find(w => !w.pmId && w.formSessionId === _woFormSession)
    || null;

  if (existing) {
    const st = WO_STATUS[existing.status] || WO_STATUS.open;
    btn.textContent = `✓ WO Dibuat — ${st.label}`;
    btn.disabled = true;
    btn.style.opacity = '.6';
    btn.title = `${existing.id}${existing.synced ? '' : ' (menunggu sync)'}`;
  } else {
    btn.textContent = '⚠ Buat WO dari Laporan Ini';
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.title = '';
  }
}

// ════════════════════════════════════════════════════════
//  MEMBUKA MODAL BUAT WO
// ════════════════════════════════════════════════════════
function _isiModalWO(ctx) {
  const _set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  _set('wo-equipment',   ctx.equipment || '—');
  _set('wo-tagno',       ctx.tagNo || '—');
  _set('wo-unit-area',   [ctx.unit, ctx.area].filter(Boolean).join(' / ') || '—');
  _set('wo-teknisi-ref', ctx.teknisi || '');
  _set('wo-prioritas',   ctx.prioritas || 'medium');
  _set('wo-assignee',    '');

  const listEl = document.getElementById('wo-anomali-list');
  if (listEl) listEl.innerHTML = _anomaliListHTML(ctx.anomaliItems, false);

  _set('wo-deskripsi', ctx.anomaliItems.map((a,i) => `${i+1}. ${a.uraian}${a.ket ? ' (' + a.ket + ')' : ''}`).join('\n'));

  const meta = document.getElementById('wo-src-meta');
  if (meta) {
    meta.innerHTML = ctx.pmId
      ? `🔗 Ditautkan ke laporan <strong>${escapeHtml(ctx.pmId)}</strong>`
      : `ℹ WO ini akan otomatis ditautkan ke laporan PM begitu Anda menekan <strong>SUBMIT & SIMPAN</strong> pada form laporan.`;
  }

  // Tombol simpan selalu dikembalikan ke keadaan siap (FIX: dulu bisa tetap
  // ter-disable dari percobaan simpan sebelumnya).
  const saveBtn = document.getElementById('wo-save-btn');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '⚠ SIMPAN WORK ORDER'; }

  window._woPMContext = ctx;
  openOverlay('woFromPMOverlay');
  setTimeout(() => document.getElementById('wo-deskripsi')?.focus(), 150);
}

/** Jalur A — dari form laporan PM yang sedang diisi. */
function bukaBuatWOdariLaporan() {
  if (woMaintenanceGuard()) return;
  const anomaliItems = _collectAnomaliFromForm();
  if (!anomaliItems.length) { toast('Tidak ada item anomali (NO) pada checklist', 'info'); return; }

  const equipment = document.getElementById('pm-equipment-name')?.value?.trim() || '';
  if (!equipment) { toast('Isi nama Equipment terlebih dahulu sebelum membuat WO', 'error'); return; }

  const pmId = document.getElementById('pm-edit-id')?.value || '';

  // FIX: cegah WO ganda untuk laporan yang sama (mode edit).
  // Konteks lama WAJIB dikosongkan saat penjagaan ini aktif — kalau tidak,
  // window._woPMContext sisa pembukaan sebelumnya masih valid dan
  // simpanWOdariPM() bisa membuat WO kembar meski modal tidak jadi dibuka.
  if (pmId && getWOForReport(pmId)) {
    window._woPMContext = null;
    toast('⚠ Laporan ini sudah punya Work Order', 'warning');
    _updateWOBar();
    return;
  }
  // ...dan untuk sesi pengisian yang sama (laporan belum disubmit).
  if (!pmId && getWO().some(w => !w.pmId && w.formSessionId === _woFormSession)) {
    window._woPMContext = null;
    toast('⚠ WO untuk pengisian ini sudah dibuat', 'warning');
    _updateWOBar();
    return;
  }

  _isiModalWO({
    pmId,
    formSessionId: getWOFormSession(),
    tanggal:   document.getElementById('pm-date')?.value || todayISO(),
    equipment,
    tagNo:     document.getElementById('pm-tagno')?.value?.trim() || '',
    unit:      document.getElementById('pm-unit')?.value?.trim() || '',
    area:      document.getElementById('pm-area')?.value?.trim() || '',
    teknisi:   document.getElementById('pm-teknisi')?.value?.trim() || '',
    anomaliItems
  });
}

/** Jalur B — dari kartu laporan di halaman Daftar Laporan. */
function bukaWOdariDaftarLaporan(pmId) {
  if (woMaintenanceGuard()) return;
  const r = getData(STORE.REPORTS).find(x => x.id === pmId);
  if (!r) { toast('Laporan tidak ditemukan', 'error'); return; }

  const existing = getWOForReport(pmId);
  if (existing) {                    // FIX: dulu tidak ada penjagaan di sisi fungsi
    window._woPMContext = null;
    toast(`⚠ Laporan ini sudah punya WO (${existing.id})`, 'warning');
    openWOListModal(pmId);
    return;
  }

  const anomaliItems = _collectAnomaliFromReport(r);
  if (!anomaliItems.length) { toast('Tidak ada anomali di laporan ini', 'info'); return; }

  _isiModalWO({
    pmId: r.id,
    formSessionId: null,
    tanggal: r.date || todayISO(),
    equipment: r.equipmentName || '—',
    tagNo: r.tagNo || '',
    unit: r.unit || '',
    area: r.area || '',
    teknisi: r.teknisi || '',
    anomaliItems
  });
}

// ════════════════════════════════════════════════════════
//  SIMPAN WO
// ════════════════════════════════════════════════════════
let _woSaving = false;
async function simpanWOdariPM() {
  if (woMaintenanceGuard()) { closeOverlay('woFromPMOverlay'); return; }
  if (_woSaving) return;                    // FIX: klik ganda → dua WO kembar
  const ctx = window._woPMContext;
  if (!ctx || !Array.isArray(ctx.anomaliItems) || !ctx.anomaliItems.length) {
    toast('Data anomali tidak ditemukan — tutup dan ulangi', 'error');
    return;
  }

  const deskripsi = document.getElementById('wo-deskripsi')?.value?.trim();
  if (!deskripsi) { toast('Isi deskripsi pekerjaan WO', 'error'); return; }

  // Penjagaan terakhir sebelum menulis. Ini SATU-SATUNYA titik yang benar-benar
  // menentukan, karena data bisa berubah sejak modal dibuka (WO dibuat dari tab
  // lain lalu masuk lewat auto-sync, atau modal dibuka dua kali).
  // Dicek dua-duanya: tautan ke laporan (pmId) DAN sesi pengisian form.
  const bentrok = (ctx.pmId && getWOForReport(ctx.pmId))
    || (!ctx.pmId && ctx.formSessionId && getWO().some(w => !w.pmId && w.formSessionId === ctx.formSessionId));
  if (bentrok) {
    window._woPMContext = null;
    toast('⚠ Work Order untuk laporan ini sudah ada', 'warning');
    closeOverlay('woFromPMOverlay');
    _updateWOBar();
    if (document.querySelector('.page.active')?.id === 'page-list') renderReportPage();
    return;
  }

  _woSaving = true;
  const saveBtn = document.getElementById('wo-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Menyimpan...'; }

  try {
    const now = new Date();
    const stamp = todayISO(now).replace(/-/g,'');
    const wo = {
      id: `WO-${stamp}-${Math.random().toString(36).substr(2,5).toUpperCase()}`,
      sumber: 'PM',
      pmId: ctx.pmId || '',
      formSessionId: ctx.formSessionId || null,
      tanggal: ctx.tanggal,
      equipment: ctx.equipment,
      tagNo: ctx.tagNo || '',
      unit: ctx.unit || '',
      area: ctx.area || '',
      unitArea: [ctx.unit, ctx.area].filter(Boolean).join(' / '),
      teknisiPM: ctx.teknisi || '',
      anomaliItems: ctx.anomaliItems,
      jumlahAnomali: ctx.anomaliItems.length,
      deskripsi,
      prioritas: document.getElementById('wo-prioritas')?.value || 'medium',
      assignee: document.getElementById('wo-assignee')?.value?.trim() || '',
      status: 'open',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: DEVICE_ID,
      synced: false,
      materialRequests: []
    };

    const list = getWO();
    list.unshift(wo);
    if (!setWO(list)) { toast('❌ Gagal menyimpan WO ke penyimpanan lokal', 'error'); return; }
    _invalidateWOCache();

    closeOverlay('woFromPMOverlay');
    _updateWOBar();
    if (document.querySelector('.page.active')?.id === 'page-list') renderReportPage();
    toast(`✅ Work Order ${wo.id} dibuat — ${wo.jumlahAnomali} anomali`, 'success');

    await _syncWOToServer(wo);
    _updateWOQueueBadge();
    if (document.querySelector('.page.active')?.id === 'page-list') renderReportPage();
  } finally {
    _woSaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '⚠ SIMPAN WORK ORDER'; }
  }
}

// ════════════════════════════════════════════════════════
//  DAFTAR / MANAJEMEN WO DARI PM
// ════════════════════════════════════════════════════════
let _woListFilterPmId = null;

function openWOListModal(filterPmId = null) {
  if (woMaintenanceGuard()) return;
  _woListFilterPmId = filterPmId;
  renderWOList();
  openOverlay('woListOverlay');
  refreshWOStatuses(true);       // ambil status terbaru di latar belakang
}

function renderWOList() {
  const box = document.getElementById('wo-list-body');
  if (!box) return;

  let list = getWO();
  if (_woListFilterPmId) list = list.filter(w => w.pmId === _woListFilterPmId);

  const searchEl = document.getElementById('wo-list-search');
  const q = (searchEl?.value || '').toLowerCase();
  if (q) list = list.filter(w => [w.id, w.equipment, w.tagNo, w.unit, w.area, w.assignee, w.deskripsi]
    .some(v => (v || '').toString().toLowerCase().includes(q)));

  const statusF = document.getElementById('wo-list-status')?.value || '';
  if (statusF) list = list.filter(w => (w.status || 'open') === statusF);

  list.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const total    = getWO().length;
  const belumSync = getWO().filter(w => !w.synced).length;
  const cnt = document.getElementById('wo-list-count');
  if (cnt) cnt.textContent = `${list.length} dari ${total} WO${belumSync ? ` · ${belumSync} belum tersync` : ''}`;

  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="empty-ico">📄</div><div class="empty-msg">Belum ada Work Order dari laporan PM${q||statusF?' untuk filter ini':''}.</div></div>`;
    return;
  }

  box.innerHTML = list.map(w => {
    const st  = WO_STATUS[w.status] || WO_STATUS.open;
    const pr  = WO_PRIORITAS[w.prioritas] || WO_PRIORITAS.medium;
    const rep = w.pmId ? getData(STORE.REPORTS).find(r => r.id === w.pmId) : null;
    return `<div style="border:1px solid var(--border);border-left:3px solid ${st.color};border-radius:var(--r);padding:12px 14px;margin-bottom:8px;background:var(--bg2)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;color:var(--navy)">${escapeHtml(w.id)}</span>
            <span class="badge" style="background:${st.bg};color:${st.color};border:1px solid ${st.color}33">${st.label}</span>
            <span style="font-size:11px;color:${pr.color}">${pr.label}</span>
            ${w.synced ? '' : '<span class="badge" style="background:rgba(240,180,41,.15);color:#c98a00;border:1px solid rgba(240,180,41,.35)">⏳ Belum tersync</span>'}
          </div>
          <div style="font-weight:700;font-size:13px;margin-top:4px">${escapeHtml(w.equipment || '—')}
            ${w.tagNo ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent);margin-left:6px">${escapeHtml(w.tagNo)}</span>` : ''}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">
            🏭 ${escapeHtml(w.unitArea || '—')} · 📅 ${fmtTanggalID(w.tanggal)} · ⚠ ${w.jumlahAnomali || (w.anomaliItems||[]).length} anomali
            ${w.assignee ? ` · 👤 ${escapeHtml(w.assignee)}` : ''}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">
            ${w.pmId ? `🔗 Laporan: <strong>${escapeHtml(w.pmId)}</strong>${rep ? '' : ' <span style="color:var(--orange)">(laporan tidak ditemukan lokal)</span>'}`
                     : '<span style="color:var(--orange)">⚠ Belum tertaut ke laporan PM</span>'}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          ${w.synced ? '' : `<button class="tbl-btn" onclick="retryWOSync('${w.id}')">↻ Kirim ulang</button>`}
          <button class="tbl-btn" onclick="toggleWODetail('${w.id}')">👁 Detail</button>
          <button class="tbl-btn del" onclick="hapusWO('${w.id}')">🗑 Hapus</button>
        </div>
      </div>
      <div id="wo-detail-${w.id}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Deskripsi Pekerjaan</div>
        <div style="font-size:12px;white-space:pre-wrap;margin-bottom:10px">${escapeHtml(w.deskripsi || '—')}</div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Anomali</div>
        ${_anomaliListHTML(w.anomaliItems || [], false)}
        <div style="font-size:10px;color:var(--text3);margin-top:8px">Dibuat: ${fmtTanggalID(w.createdAt, true)}${w.syncedAt ? ` · Tersync: ${fmtTanggalID(w.syncedAt, true)}` : ''}</div>
      </div>
    </div>`;
  }).join('');
}

function toggleWODetail(id) {
  const el = document.getElementById('wo-detail-' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function clearWOListFilter() {
  _woListFilterPmId = null;
  const s = document.getElementById('wo-list-search'); if (s) s.value = '';
  const st = document.getElementById('wo-list-status'); if (st) st.value = '';
  renderWOList();
}

async function retryWOSync(id) {
  if (woMaintenanceGuard()) return;
  const wo = getWO().find(w => w.id === id);
  if (!wo) return;
  toast('⏳ Mengirim ulang WO...', 'info');
  const ok = await _syncWOToServer(wo);
  renderWOList();
  if (ok && document.querySelector('.page.active')?.id === 'page-list') renderReportPage();
}

function hapusWO(id) {
  const wo = getWO().find(w => w.id === id);
  if (!wo) return;
  document.getElementById('delete-confirm-msg').innerHTML =
    `Hapus Work Order <strong>${escapeHtml(id)}</strong> dari daftar lokal?<br>
     <span style="font-size:11px;color:var(--text3)">Catatan: WO yang sudah tersync tetap ada di database WO — penghapusan ini hanya melepas tautannya dari sisi PM.</span>`;
  const btn = document.getElementById('delete-confirm-btn');
  btn.textContent = '🗑 HAPUS';
  btn.className = 'btn-red';
  btn.onclick = () => {
    setWO(getWO().filter(w => w.id !== id));
    _invalidateWOCache();
    // Buang juga antrian sync yang menunggu untuk WO ini supaya tidak
    // menghidupkan kembali record yang sudah dihapus.
    _woWrite(STORE_WO_QUEUE, _woRead(STORE_WO_QUEUE).filter(i => i.woId !== id));
    _updateWOQueueBadge();
    closeOverlay('deleteOverlay');
    renderWOList();
    _updateWOBar();
    if (document.querySelector('.page.active')?.id === 'page-list') renderReportPage();
    toast('Work Order dihapus dari daftar lokal', 'info');
  };
  openOverlay('deleteOverlay');
}

// Catatan: seluruh refresh Daftar Laporan di modul ini memakai renderReportPage()
// dan BUKAN renderReportList() — renderReportList() mereset pagination ke halaman
// 1, sehingga dulu pengguna yang membuat WO dari halaman 3 tiba-tiba terlempar
// kembali ke halaman 1.

// Kirim ulang antrian WO saat aplikasi dibuka & saat koneksi kembali.
window.addEventListener('load', () => {
  if (WO_MAINTENANCE) {
    const b = document.getElementById('wo-list-btn');
    if (b) { b.textContent = '🛠 Daftar WO (maintenance)'; b.title = 'Fitur Work Order sedang dalam maintenance'; b.style.opacity = '.6'; }
  }
  _updateWOQueueBadge();
  setTimeout(() => flushWOQueue(true), 3000);
});
window.addEventListener('online', () => flushWOQueue(false));
