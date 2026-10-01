// ════════════════════════════════════════════════════════
//  NAV
// ════════════════════════════════════════════════════════
const _pageHistory = [];
let _currentPage = 'dashboard';

function showPage(page, fromHistory = false) {
  if (_currentPage === 'reports' && page !== 'reports') {
    window._activeScheduleId = null;
  }

  if (!fromHistory && _currentPage && _currentPage !== page) {
    _pageHistory.push(_currentPage);
    if (_pageHistory.length > 20) _pageHistory.shift();
  }

  _currentPage = page;

  if (!fromHistory) {
    try { history.pushState({ page }, '', '#' + page); } catch(e) {}
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mnav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(b => b.classList.add('active'));
  const morePages = ['list','resume','schedule-calendar','takeover','templates'];
  const mnavId = morePages.includes(page) ? 'mnav-more' : 'mnav-' + page.split('-')[0];
  const mnav = document.getElementById(mnavId);
  if (mnav) mnav.classList.add('active');
  closeSidebar();
  closeMoreSheet();

  const content = document.querySelector('.content');
  if (content) content.scrollTop = 0;

  if (page === 'dashboard') renderDashboard();
  if (page === 'schedule') renderScheduleList();
  if (page === 'schedule-calendar') renderCalendar();
  if (page === 'list') renderReportList();
  if (page === 'input-pm') renderInputPMPage();
}

window.addEventListener('popstate', function() {
  const openOverlays = document.querySelectorAll('.overlay.open');
  if (openOverlays.length > 0) {
    openOverlays.forEach(o => o.classList.remove('open'));
    try { history.pushState({ page: _currentPage }, '', '#' + _currentPage); } catch(e2) {}
    return;
  }
  const sb = document.getElementById('sidebar');
  if (sb && sb.classList.contains('open')) {
    closeSidebar();
    try { history.pushState({ page: _currentPage }, '', '#' + _currentPage); } catch(e2) {}
    return;
  }
  if (_pageHistory.length > 0) {
    const prev = _pageHistory.pop();
    showPage(prev, true);
    try { history.replaceState({ page: prev }, '', '#' + prev); } catch(e2) {}
  } else {
    try { history.pushState({ page: _currentPage }, '', '#' + _currentPage); } catch(e2) {}
  }
});

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebarBackdrop');
  const open = sb.classList.toggle('open');
  if (open) bd.classList.add('open'); else bd.classList.remove('open');
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
}
function openOverlay(id) { document.getElementById(id)?.classList.add('open'); }

// deleteOverlay dipakai bersama oleh hapus, takeover, dan reset template.
// FIX: kalau dialog takeover/reset dibatalkan, tombolnya tetap berlabel
// "🔄 TAKEOVER"/"↺ RESET DEFAULT" (oranye) saat dialog hapus berikutnya dibuka.
function resetDeleteConfirmBtn() {
  const btn = document.getElementById('delete-confirm-btn');
  if (!btn) return;
  btn.textContent = '🗑 HAPUS';
  btn.className = 'btn-red';
}
function closeOverlay(id) { document.getElementById(id)?.classList.remove('open'); }

function toggleMoreSheet() {
  const sheet = document.getElementById('moreSheet');
  const bd    = document.getElementById('moreSheetBackdrop');
  if (!sheet) return;
  const isOpen = sheet.style.display === 'block';
  if (isOpen) { closeMoreSheet(); return; }
  sheet.style.display = 'block';
  bd?.classList.add('open');
}
function closeMoreSheet() {
  const sheet = document.getElementById('moreSheet');
  const bd    = document.getElementById('moreSheetBackdrop');
  if (sheet) sheet.style.display = 'none';
  bd?.classList.remove('open');
}

function quickStatus(s) { showPage('schedule'); document.getElementById('sch-filter-status').value=s; renderScheduleList(); }

// ── Full lock zoom (cegah pinch & double-tap zoom di semua browser) ──
(function lockZoom() {
  document.addEventListener('touchmove', function(e) {
    if (e.scale !== undefined && e.scale !== 1) e.preventDefault();
  }, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
})();
