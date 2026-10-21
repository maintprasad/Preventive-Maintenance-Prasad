// ════════════════════════════════════════════════════════
//  BOOTSTRAP
// ════════════════════════════════════════════════════════
// Data contoh untuk uji di komputer sendiri: http://localhost/PM/?demo=1 (atau ?demo=reset). Folder dev/ tidak ikut ke Vercel.
function _loadDemoIfRequested(done) {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const q = new URLSearchParams(location.search).get('demo');
  if (!local || !q) { done(); return; }
  const s = document.createElement('script');
  s.src = 'dev/demo-data.js';
  s.onload = () => { try { if (window.__PM_DEMO__(q === 'reset')) toast('Data contoh dimuat (hanya di browser ini)', 'success'); } catch (e) { console.warn('[demo]', e); } done(); };
  s.onerror = () => done();
  document.head.appendChild(s);
}

window.addEventListener('load', () => _loadDemoIfRequested(_bootstrapApp));

function _bootstrapApp() {
  applyLocalTemplates();
  applyMasterToRuntime();   // tipe equipment tambahan (master data) → EQ_LABELS + semua dropdown
  // Data lama di localStorage (sebelum versi ini) belum dinetralkan — tulis
  // ulang sekali lewat setData() supaya ikut dibersihkan (lihat 02-store.js).
  setData(STORE.REPORTS,   getData(STORE.REPORTS));
  setData(STORE.SCHEDULES, getData(STORE.SCHEDULES));
  try { history.replaceState({ page: 'dashboard' }, '', '#dashboard'); } catch(e) {}

  document.getElementById('pm-date').value = todayISO();
  document.getElementById('pm-week').value = getWeekOfMonth(new Date());
  const now = new Date();
  document.getElementById('sch-month').value = now.getMonth() + 1;
  document.getElementById('sch-week').value = getWeekOfMonth(now);

  document.querySelectorAll('.overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target===el) el.classList.remove('open'); });
  });

  if (!_useLS) {
    setSyncStatus('offline','Mode Offline — localStorage tidak tersedia');
  } else if (!backendEnabled()) {
    setSyncStatus('offline','Mode Offline — buka lewat alamat Vercel');
  } else {
    // FIX (permintaan utama): dulu di sini komentarnya secara eksplisit
    // "TIDAK pull data otomatis" — sekarang app AUTO-SYNC begitu dibuka,
    // lalu polling berkala, dengan penjagaan supaya tidak menimpa form yang
    // sedang aktif diisi (lihat 04-sync.js) dan tidak menabrak equipment
    // yang sedang dikerjakan device lain (lihat 05-lock.js).
    startAutoSync();
    setInterval(refreshLockBadges, LOCK_HEARTBEAT_MS);
  }

  renderDashboard();
  renderInputPMPage();
  populateUnitFilters();
  updateSidebarBadges();
}
