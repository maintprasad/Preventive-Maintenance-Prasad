// ════════════════════════════════════════════════════════
//  PWA — registrasi service worker, pasang ke layar utama, update, status offline
//
//  • Android/Chrome/Edge : tombol "Pasang Aplikasi" memakai beforeinstallprompt
//  • iOS/iPadOS Safari   : tidak ada prompt resmi → tampil petunjuk "Tambah ke Layar Utama"
//  • Update              : versi baru menunggu; pengguna mengetuk "Perbarui" (tidak memuat
//                          ulang paksa, supaya form yang sedang diisi aman)
// ════════════════════════════════════════════════════════
const PWA_DISMISS_KEY = 'pm_pwa_install_dismissed_v1';
let _deferredInstall = null;
let _swReg = null;
let _swVersion = '';
let _reloadingForUpdate = false;

const pwaIsStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const pwaIsIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const pwaSecure = () => location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
function _dismissed() { try { return localStorage.getItem(PWA_DISMISS_KEY) === '1'; } catch { return false; } }

// ── Service worker ──────────────────────────────────────
function pwaRegister() {
  if (!('serviceWorker' in navigator) || !pwaSecure()) { pwaRefreshUI(); return; }
  navigator.serviceWorker.register('sw.js').then(reg => {
    _swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) pwaShowUpdateBar();
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) pwaShowUpdateBar();
      });
    });
    pwaAskVersion();
    pwaRefreshUI();
    // Cek update saat aplikasi dibuka kembali dari background
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(e => console.warn('[PWA] registrasi service worker gagal:', e));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_reloadingForUpdate) location.reload();
  });
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'VERSION') { _swVersion = e.data.version; pwaRefreshUI(); }
    if (e.data?.type === 'CACHES_CLEARED') toast('Cache offline dihapus. Muat ulang untuk mengunduh ulang.', 'success');
  });
}

function pwaAskVersion() {
  navigator.serviceWorker.ready.then(reg => reg.active && reg.active.postMessage({ type: 'GET_VERSION' })).catch(() => {});
}

function pwaShowUpdateBar() {
  if (document.getElementById('pwa-update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'pwa-update-bar';
  bar.className = 'pwa-bar';
  bar.innerHTML = `<span>🔄 Versi baru aplikasi tersedia.</span><button class="btn-primary" onclick="pwaApplyUpdate()">Perbarui</button><button class="pwa-bar-x" aria-label="Tutup" onclick="this.parentNode.remove()">×</button>`;
  document.body.appendChild(bar);
}

function pwaApplyUpdate() {
  const waiting = _swReg && _swReg.waiting;
  if (!waiting) { location.reload(); return; }
  _reloadingForUpdate = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

async function pwaCheckUpdate() {
  if (!_swReg) { toast('Mode offline/PWA tidak aktif di alamat ini', 'warning'); return; }
  toast('Memeriksa pembaruan…', 'info');
  try {
    await _swReg.update();
    if (_swReg.waiting) pwaShowUpdateBar(); else toast('Aplikasi sudah versi terbaru ✓', 'success');
  } catch { toast('Gagal memeriksa pembaruan (cek koneksi)', 'warning'); }
}

function pwaClearCache() {
  if (!confirm('Hapus cache offline di perangkat ini?\n\nData laporan & jadwal TIDAK terhapus (tersimpan terpisah). Aplikasi akan mengunduh ulang berkasnya saat online.')) return;
  navigator.serviceWorker?.ready.then(reg => reg.active && reg.active.postMessage({ type: 'CLEAR_CACHES' }));
}

// ── Pasang ke layar utama ───────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  pwaRefreshUI();
  if (!_dismissed() && !pwaIsStandalone()) pwaShowInstallBar();
});
window.addEventListener('appinstalled', () => {
  _deferredInstall = null;
  document.getElementById('pwa-install-bar')?.remove();
  toast('✅ Aplikasi terpasang di perangkat', 'success');
  pwaRefreshUI();
});

function pwaShowInstallBar(ios = false) {
  if (document.getElementById('pwa-install-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'pwa-install-bar';
  bar.className = 'pwa-bar';
  bar.innerHTML = ios
    ? `<span>📲 Pasang di iPhone/iPad: ketuk <b>Bagikan</b> <span aria-hidden="true">⎙</span> lalu <b>Tambah ke Layar Utama</b>.</span><button class="pwa-bar-x" aria-label="Tutup" onclick="pwaDismissInstall()">×</button>`
    : `<span>📲 Pasang aplikasi PM di perangkat ini untuk akses cepat &amp; offline.</span><button class="btn-primary" onclick="pwaInstall()">Pasang</button><button class="pwa-bar-x" aria-label="Tutup" onclick="pwaDismissInstall()">×</button>`;
  document.body.appendChild(bar);
  // Tidak mengganggu terus-menerus: hilang sendiri setelah 15 dtk (tombol tetap ada di Pengaturan → Aplikasi)
  setTimeout(() => bar.remove(), 15000);
}
function pwaDismissInstall() {
  try { localStorage.setItem(PWA_DISMISS_KEY, '1'); } catch {}
  document.getElementById('pwa-install-bar')?.remove();
}

async function pwaInstall() {
  if (_deferredInstall) {
    _deferredInstall.prompt();
    const choice = await _deferredInstall.userChoice.catch(() => null);
    if (choice && choice.outcome === 'accepted') toast('Memasang aplikasi…', 'success');
    _deferredInstall = null;
    document.getElementById('pwa-install-bar')?.remove();
    pwaRefreshUI();
  } else if (pwaIsIOS()) {
    pwaShowInstallBar(true);
  } else {
    toast('Buka menu browser (⋮) lalu pilih "Instal aplikasi" / "Tambahkan ke layar utama".', 'info');
  }
}

// ── Status online/offline ───────────────────────────────
function pwaNetUpdate() {
  const off = !navigator.onLine;
  document.body.classList.toggle('is-offline', off);
  let b = document.getElementById('pwa-offline-banner');
  if (off && !b) {
    b = document.createElement('div');
    b.id = 'pwa-offline-banner';
    b.textContent = '⚫ Offline — data disimpan di perangkat dan dikirim otomatis saat online';
    document.body.appendChild(b);
  } else if (!off && b) {
    b.remove();
    if (typeof flushSyncQueue === 'function') flushSyncQueue();
  }
  pwaRefreshUI();
}
window.addEventListener('online', pwaNetUpdate);
window.addEventListener('offline', pwaNetUpdate);

// ── Kartu "Aplikasi" di halaman Pengaturan ──────────────
function pwaRefreshUI() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const standalone = pwaIsStandalone();
  set('pwa-status', standalone ? 'Terpasang (mode aplikasi)' : (_deferredInstall ? 'Bisa dipasang' : (pwaIsIOS() ? 'Belum dipasang — lihat petunjuk iOS' : 'Dibuka di browser')));
  set('pwa-net', navigator.onLine ? '🟢 Online' : '⚫ Offline');
  set('pwa-sw', !('serviceWorker' in navigator) ? 'Tidak didukung browser ini' : !pwaSecure() ? 'Butuh HTTPS' : (_swReg ? 'Aktif' + (navigator.serviceWorker.controller ? '' : ' (aktif setelah muat ulang)') : 'Mendaftar…'));
  set('pwa-version', _swVersion || '—');
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = standalone ? 'none' : '';
}

// Halaman bisa dibuka langsung ke menu tertentu: ?page=input-pm (dipakai shortcut ikon aplikasi)
function pwaOpenRequestedPage() {
  try {
    const page = new URLSearchParams(location.search).get('page');
    if (page && document.getElementById('page-' + page)) {
      showPage(page);
      if (page === 'input-pm') renderInputPMPage();
      if (page === 'outstanding') renderOutstandingPage();
    }
  } catch {}
}

window.addEventListener('load', () => {
  pwaRegister();
  pwaNetUpdate();
  pwaOpenRequestedPage();
  // iOS Safari: tidak ada beforeinstallprompt → tampilkan petunjuk sekali
  if (pwaIsIOS() && !pwaIsStandalone() && !_dismissed()) setTimeout(() => pwaShowInstallBar(true), 2500);
});
