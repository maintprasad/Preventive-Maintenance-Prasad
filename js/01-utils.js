// ════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════
function genId() { return 'PM-' + Date.now() + '-' + Math.random().toString(36).substr(2,6).toUpperCase(); }

// FIX: rumus lama `(tgl + firstDay - 2) / 7` selisih satu hari — setiap Senin
// masih dihitung minggu sebelumnya, dan kalau tanggal 1 jatuh di hari Senin
// hasilnya "minggu 0". Minggu dihitung Senin–Minggu, minggu 1 = minggu yang
// memuat tanggal 1. Seluruh UI (pilihan form, Gantt, PDF) memakai Minggu 1–5,
// jadi 1–2 hari sisa di akhir bulan yang jatuh di "minggu ke-6" ikut minggu 5.
function getWeekOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDay = d.getDay() || 7; // Mon=1..Sun=7
  return Math.min(5, Math.ceil((date.getDate() + firstDay - 1) / 7));
}

// Tanggal lokal 'YYYY-MM-DD'.
// FIX: dulu memakai new Date().toISOString().split('T')[0] — itu tanggal UTC,
// sehingga di WIB (UTC+7) input antara 00:00–06:59 tercatat sebagai KEMARIN.
function todayISO(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function toast(msg, type='info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const ico = {success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
  // FIX (XSS): pesan toast sering memuat nama equipment dari database —
  // dipasang lewat textContent, bukan innerHTML.
  const icoEl = document.createElement('span'); icoEl.textContent = ico[type]||'ℹ️';
  const msgEl = document.createElement('span'); msgEl.textContent = msg;
  t.append(icoEl, msgEl);
  c.appendChild(t);
  setTimeout(()=>t.classList.add('show'),10);
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300);},4000);
}

function _safeParseJSON(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch(e) { return fallback; }
}

// Escape teks sebelum dimasukkan lewat innerHTML.
// PENTING: item checklist & kolom "keterangan" diketik bebas oleh teknisi.
// Tanpa escape, karakter seperti < atau " merusak layout (dan berpotensi
// menyuntikkan markup) di ringkasan anomali, modal WO, dan PDF.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Netralkan teks bebas SEBELUM masuk ke data (dipakai store.js saat membaca
// laporan/schedule, dan juga dilakukan ulang oleh server di api/db.js).
// Ratusan template HTML di app ini memasukkan nama equipment/area/catatan
// langsung ke innerHTML & atribut title="...", jadi karakter yang bisa
// membuka tag/atribut diganti dengan padanan visualnya:  < → ‹   > → ›   " → ″
// (″ tetap terbaca sebagai tanda inci, mis. pipa 2″).
function neutralizeText(v) {
  if (v === null || v === undefined) return v;
  if (typeof v !== 'string') return v;
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/</g, '‹').replace(/>/g, '›').replace(/"/g, '″');
}
function neutralizeDeep(v) {
  if (typeof v === 'string') return neutralizeText(v);
  if (Array.isArray(v)) return v.map(neutralizeDeep);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach(k => { out[k] = neutralizeDeep(v[k]); });
    return out;
  }
  return v;
}
// ID dipakai di onclick="fn('ID')" — hanya karakter aman yang diterima.
const SAFE_ID_RE = /^[A-Za-z0-9._:-]{1,80}$/;
function isSafeId(id) { return typeof id === 'string' && SAFE_ID_RE.test(id); }

function fmtTanggalID(v, withTime) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  const opts = { day:'numeric', month:'short', year:'numeric' };
  return withTime
    ? d.toLocaleDateString('id-ID', opts) + ' ' + d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})
    : d.toLocaleDateString('id-ID', opts);
}

// Debounce helper — dipakai supaya auto-sync / re-render tidak dipanggil bertubi-tubi
function debounce(fn, ms) {
  let t = null;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}
