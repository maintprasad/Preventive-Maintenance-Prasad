/* Uji logika modul WO tanpa browser. Memuat file JS asli apa adanya. */
const fs = require('fs'), vm = require('vm');

let store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

const els = {};
function el(id, val) {
  if (!els[id]) els[id] = { id, value: val ?? '', textContent: '', innerHTML: '', style: {}, disabled: false, title: '',
    focus(){}, classList: { contains: () => false, add(){}, remove(){}, toggle(){} } };
  if (val !== undefined) els[id].value = val;
  return els[id];
}
let anomaliRows = [];
const document = {
  getElementById: id => els[id] || null,
  querySelectorAll: sel => {
    if (sel === '#pm-aktivitas-tbody tr') return anomaliRows;
    return [];
  },
  querySelector: () => null,
  createElement: () => ({ style: {}, appendChild(){}, remove(){} }),
  addEventListener(){}, body: { appendChild(){} }
};
const listeners = {};
const window = { addEventListener: (e, f) => { (listeners[e] = listeners[e] || []).push(f); } };

let fetchMode = 'fail';
const fetch = async () => {
  if (fetchMode === 'fail') throw new Error('offline');
  return { ok: true, json: async () => ({ success: true }) };
};

const toasts = [];
const ctx = vm.createContext({
  localStorage, document, window, fetch,
  console: { log: console.log, warn: () => {}, error: () => {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  navigator: {}, Date, Math, JSON, Array, Object, String, Number, Map, Set, Promise, isNaN, parseInt, parseFloat, encodeURIComponent,
  toast: (m, t) => toasts.push(`[${t}] ${m}`),
  openOverlay(){}, closeOverlay(){}, renderReportPage(){}, getLocalSigs: () => ({}),
});
ctx.addEventListener = (e, f) => { (listeners[e] = listeners[e] || []).push(f); };
ctx.window = ctx; ctx.globalThis = ctx;

const G = expr => vm.runInContext(expr, ctx);
for (const f of ['js/00-config.js', 'js/01-utils.js', 'js/02-store.js', 'js/19-wo.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
// Pengujian logika WO berjalan dengan fitur aktif; mode maintenance diuji di T13.
const WO_MAINTENANCE_DEFAULT = vm.runInContext('WO_MAINTENANCE', ctx);
vm.runInContext('WO_MAINTENANCE = false', ctx);

const R = [];
const check = (name, cond, extra = '') => { R.push([cond ? 'PASS' : 'FAIL', name, extra]); };

// ── Setup elemen form ──
el('wo-summary-bar'); el('wo-summary-list'); el('wo-summary-btn');
el('pm-edit-id', ''); el('pm-equipment-name', 'Belt Conveyor BC-01'); el('pm-tagno', 'TAG-BC01');
el('pm-unit', 'Unit 1'); el('pm-area', 'Cleaning'); el('pm-teknisi', 'Budi');
el('pm-date', '2026-09-10'); el('wo-deskripsi', ''); el('wo-prioritas', 'high'); el('wo-assignee', 'Tim A');
el('wo-anomali-list'); el('wo-src-meta'); el('wo-save-btn'); el('wo-equipment'); el('wo-tagno');
el('wo-unit-area'); el('wo-teknisi-ref'); el('wo-queue-badge'); el('wo-list-body'); el('wo-list-count');

// Baris checklist: 2 anomali, salah satunya mengandung karakter HTML berbahaya
const row = (uraian, no, ket) => ({
  cells: [null, { textContent: uraian }],
  querySelector: sel => sel === '.pm-no' ? { checked: no }
    : sel === '.pm-keterangan' ? { value: ket || '' } : { checked: false }
});
anomaliRows = [
  row('Periksa bearing', true, 'Bunyi kasar <script>alert(1)</script>'),
  row('Cek belt', false, ''),
  row('Cek pulley "utama"', true, 'Aus & retak')
];

// ── T1: pengumpulan anomali ──
const an = ctx._collectAnomaliFromForm();
check('T1 hanya item NO yang jadi anomali (2 dari 3)', an.length === 2, JSON.stringify(an.map(a=>a.uraian)));

// ── T2: escaping XSS di bar anomali ──
ctx._updateWOBar();
const html = els['wo-summary-list'].innerHTML;
check('T2 tag <script> ter-escape di ringkasan anomali', !html.includes('<script>') && html.includes('&lt;script&gt;'));
check('T2b kutip ganda ter-escape', html.includes('&quot;utama&quot;'));
check('T2c bar anomali tampil', els['wo-summary-bar'].style.display === 'block');

// ── T3: buat WO saat OFFLINE → tersimpan lokal + masuk antrian ──
ctx.window._woPMContext = null;
ctx.bukaBuatWOdariLaporan();
// modal mereset prioritas/assignee ke default; pengguna mengisinya SETELAH modal terbuka
els['wo-deskripsi'].value = '1. Periksa bearing (Bunyi kasar)';
els['wo-prioritas'].value = 'high';
els['wo-assignee'].value  = 'Tim A';
(async () => {
  await ctx.simpanWOdariPM();

  const wos = ctx.getWO();
  check('T3 WO tersimpan lokal', wos.length === 1, JSON.stringify(wos.map(w=>w.id)));
  check('T3b WO ditandai belum tersync', wos[0] && wos[0].synced === false);
  check('T3c masuk antrian retry', ctx.getWOQueueCount() === 1);
  check('T3d prioritas & assignee terbawa', wos[0].prioritas === 'high' && wos[0].assignee === 'Tim A');
  check('T3e jumlahAnomali benar', wos[0].jumlahAnomali === 2);
  check('T3f punya formSessionId (WO yatim sementara)', !!wos[0].formSessionId && wos[0].pmId === '');

  // ── T4: klik dua kali tidak menghasilkan WO kembar ──
  ctx.bukaBuatWOdariLaporan();
  await ctx.simpanWOdariPM();
  check('T4 WO ganda dicegah (tetap 1)', ctx.getWO().length === 1, 'total=' + ctx.getWO().length);

  // ── T5: tombol berubah jadi "sudah dibuat" ──
  ctx._updateWOBar();
  check('T5 tombol terkunci setelah WO dibuat', els['wo-summary-btn'].disabled === true, els['wo-summary-btn'].textContent);

  // ── T6: link otomatis ke laporan saat submit ──
  const linked = ctx.linkPendingWOToReport('PM-123-ABC');
  check('T6 WO tertaut ke id laporan', linked === 1 && ctx.getWO()[0].pmId === 'PM-123-ABC');
  check('T6b getWOForReport menemukan WO', !!ctx.getWOForReport('PM-123-ABC'));
  check('T6c laporan lain tidak ikut tertaut', ctx.getWOForReport('PM-999-XYZ') === null);

  // ── T7: laporan yang sudah punya WO ditolak membuat WO kedua ──
  els['pm-edit-id'].value = 'PM-123-ABC';
  const before = ctx.getWO().length;
  ctx.bukaBuatWOdariLaporan();
  check('T7 WO kedua untuk laporan sama ditolak', ctx.getWO().length === before);

  // ── T8: antrian ter-flush saat online, WO ditandai tersync ──
  fetchMode = 'ok';
  await ctx.flushWOQueue(true);
  check('T8 antrian kosong setelah online', ctx.getWOQueueCount() === 0);
  check('T8b WO ditandai tersync', ctx.getWO()[0].synced === true);

  // ── T9: antrian tidak menumpuk untuk WO yang sama ──
  fetchMode = 'fail';
  const w = ctx.getWO()[0];
  await ctx._syncWOToServer(w, true);
  await ctx._syncWOToServer(w, true);
  check('T9 antrian di-dedupe (1 entri, bukan 2)', ctx.getWOQueueCount() === 1, 'count=' + ctx.getWOQueueCount());

  // ── T10: pemilihan transport GET vs POST untuk payload besar ──
  const kecil = ctx.getWO()[0];
  const besar = JSON.parse(JSON.stringify(kecil));
  besar.deskripsi = 'x'.repeat(4000);
  const urlKecil = `${G('WO_URL')}?data=${encodeURIComponent(JSON.stringify({action:'saveWO', wo:kecil}))}`;
  const urlBesar = `${G('WO_URL')}?data=${encodeURIComponent(JSON.stringify({action:'saveWO', wo:besar}))}`;
  check('T10 payload kecil muat di GET', urlKecil.length <= G('WO_GET_MAX_URL'));
  check('T10b payload besar akan dialihkan ke POST', urlBesar.length > G('WO_GET_MAX_URL'), 'len=' + urlBesar.length);

  // ── T11: WO dari sheet (field JSON berupa string) ternormalisasi ──
  const dariSheet = ctx._sanitizeWO({ id:'WO-X', anomaliItems:'[{"uraian":"a","ket":"b"}]', materialRequests:'[]', status:'IN PROGRESS' });
  check('T11 anomaliItems string JSON jadi array', Array.isArray(dariSheet.anomaliItems) && dariSheet.anomaliItems.length === 1);
  check('T11b status dinormalkan', dariSheet.status === 'in_progress', dariSheet.status);
  check('T11c status punya label tampilan', !!G('WO_STATUS')[dariSheet.status]);

  // ── T12: hapus WO juga membersihkan antriannya ──
  const id = ctx.getWO()[0].id;
  el('delete-confirm-msg'); el('delete-confirm-btn');
  ctx.hapusWO(id);
  els['delete-confirm-btn'].onclick();
  check('T12 WO terhapus', ctx.getWO().length === 0);
  check('T12b antrian WO ikut dibersihkan', ctx.getWOQueueCount() === 0);

  // ── T13: mode maintenance memblokir semua pintu masuk WO ──
  G('WO_MAINTENANCE = true');
  toasts.length = 0;
  ctx.__toasts = toasts; G('toast = (m, t) => __toasts.push(String(m))');
  fetchMode = 'ok';
  let fetched = 0; const origFetch = ctx.fetch; ctx.fetch = async (...a) => { fetched++; return origFetch(...a); };
  window._woPMContext = null;
  ctx.bukaBuatWOdariLaporan();
  await ctx.simpanWOdariPM();
  await ctx.flushWOQueue(false);
  await ctx.refreshWOStatuses(false);
  ctx.openWOListModal();
  check('T13 maintenance: tidak ada WO dibuat', ctx.getWO().length === 0);
  check('T13b maintenance: tidak ada request ke backend WO', fetched === 0);
  check('T13c maintenance: pengguna diberi pesan', toasts.some(t => t.includes('maintenance')), toasts[0]);
  ctx.fetch = origFetch;
  G('WO_MAINTENANCE = ' + WO_MAINTENANCE_DEFAULT);

  // ── Laporan hasil ──
  console.log('\n' + '='.repeat(64));
  R.forEach(([s, n, e]) => console.log(`${s === 'PASS' ? '✅' : '❌'} ${s}  ${n}${e ? '   → ' + e : ''}`));
  const fail = R.filter(r => r[0] === 'FAIL').length;
  console.log('='.repeat(64));
  console.log(`${R.length - fail}/${R.length} lulus${fail ? ` — ${fail} GAGAL` : ' — semua lulus'}`);
  process.exit(fail ? 1 : 0);
})();
