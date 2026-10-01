// ════════════════════════════════════════════════════════
//  BOOTSTRAP
// ════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  applyLocalTemplates();
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
});
