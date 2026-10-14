/* ════════════════════════════════════════════════════════
   sw.js — Service Worker aplikasi PM (PWA)

   Tujuan: aplikasi bisa dibuka & dipakai tanpa sinyal (data tetap di
   localStorage + antrian sync, lihat js/03-api.js), dan terasa instan.

   Strategi:
   • /api/*                      → TIDAK PERNAH di-cache (data selalu dari server;
                                   kegagalan ditangani antrian offline aplikasi)
   • Halaman & aset same-origin  → network-first (selalu versi terbaru bila online,
                                   cache sebagai cadangan saat offline)
   • CDN & font (Chart.js, ExcelJS, Google Fonts) → cache-first + perbarui di belakang
   • Update: versi baru menunggu (waiting) sampai pengguna mengetuk "Perbarui"
     (pesan SKIP_WAITING dari js/22-pwa.js) supaya form yang sedang diisi tidak
     tiba-tiba dimuat ulang.

   NAIKKAN VERSION setiap rilis yang mengubah daftar berkas di SHELL_FILES.
   ════════════════════════════════════════════════════════ */
'use strict';
const VERSION = 'pm-3.1.1';
const SHELL_CACHE = VERSION + '-shell';
const CDN_CACHE = 'pm-cdn-v1';              // CDN versinya sudah dikunci di URL → tidak ikut VERSION
const NETWORK_TIMEOUT_MS = 5000;

const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'js/00-config.js', 'js/01-utils.js', 'js/02-store.js', 'js/03-api.js', 'js/04-sync.js', 'js/05-lock.js',
  'js/06-nav.js', 'js/07-dashboard.js', 'js/08-inputpm.js', 'js/09-schedule.js', 'js/10-calendar.js',
  'js/11-form-pm.js', 'js/12-reports.js', 'js/13-outstanding-takeover.js', 'js/14-templates.js',
  'js/15-signature.js', 'js/16-pdf-report.js', 'js/17-pdf-schedule.js', 'js/18-excel.js', 'js/19-wo.js',
  'js/21-master.js', 'js/22-pwa.js', 'js/20-main.js',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Satu per satu: berkas yang gagal diambil tidak menggagalkan seluruh instalasi.
    await Promise.allSettled(SHELL_FILES.map(f => cache.add(new Request(f, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, CDN_CACHE]);
    for (const k of await caches.keys()) if (k.startsWith('pm-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const d = event.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'GET_VERSION' && event.source) event.source.postMessage({ type: 'VERSION', version: VERSION });
  if (d.type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pm-')).map(k => caches.delete(k))))
      .then(() => event.source && event.source.postMessage({ type: 'CACHES_CLEARED' })));
  }
});

function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (fallbackUrl) { const page = await cache.match(fallbackUrl); if (page) return page; }
    return new Response('Offline — data belum tersimpan di perangkat ini.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CDN_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || new Response('', { status: 504 });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/api/')) return;                  // data: langsung ke jaringan
    if (url.pathname.endsWith('/sw.js')) return;                 // jangan cache SW itu sendiri
    event.respondWith(networkFirst(req, req.mode === 'navigate' ? 'index.html' : null));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(req));
});
