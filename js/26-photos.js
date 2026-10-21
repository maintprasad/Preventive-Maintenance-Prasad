// ════════════════════════════════════════════════════════
//  FOTO EQUIPMENT — diunggah ke SERVER SENDIRI (bukan ke Turso/Vercel)
//
//  STATUS: kode lengkap, tetapi NONAKTIF sampai PHOTO_CONFIG.enabled = true (js/00-config.js).
//
//  Alur (bila aktif):
//    1. Teknisi memotret / memilih foto di form PM.
//    2. Foto diperkecil di perangkat (sisi terpanjang PHOTO_CONFIG.maxEdgePx, JPEG) lalu dikirim
//       (POST multipart) ke PHOTO_CONFIG.uploadUrl → server mengembalikan {success:true, url:"https://..."}.
//    3. Hanya URL foto yang disimpan di laporan (kolom photos); gambar-nya tetap di server Anda.
//    4. PDF laporan menampilkan foto dari URL tersebut.
//  Penerima di sisi server: tools/foto-server/upload.php (lihat README.md di folder itu).
//
//  Foto yang dihapus dari laporan TIDAK dihapus dari server (file tetap ada sebagai arsip).
// ════════════════════════════════════════════════════════
let _pmPhotos = [];            // { id, url, name, caption, at, status:'uploading'|'done'|'error', error, blob, thumb }
let _photoSeq = 0;

// Aktif hanya bila enabled=true DAN alamat server sudah diisi (bukan placeholder bawaan)
function photoEnabled() {
  const c = PHOTO_CONFIG;
  return c.enabled === true && _photoUrlOk(c.uploadUrl) && _photoUrlOk(c.publicBaseUrl)
    && !/domain-anda/i.test(c.uploadUrl + c.publicBaseUrl);
}
// URL foto harus https. Pengecualian: http://localhost / 127.0.0.1 (hanya untuk uji di komputer sendiri).
const _photoUrlOk = u => /^https:\/\//.test(u || '') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u || '');
const photoPending = () => _pmPhotos.filter(p => p.status === 'uploading').length;
const photoFailed = () => _pmPhotos.filter(p => p.status === 'error').length;
function photoCollect() {
  return _pmPhotos.filter(p => p.status === 'done' && p.url).map(p => ({ url: p.url, name: p.name || '', caption: (p.caption || '').trim(), at: p.at || '' }));
}
function photoReset() { _pmPhotos = []; photoRender(); }
function photoLoad(list) {
  _pmPhotos = (Array.isArray(list) ? list : []).map(p => ({ id: 'p' + (++_photoSeq), url: p.url, name: p.name || '', caption: p.caption || '', at: p.at || '', status: 'done', thumb: p.url }));
  photoRender();
}

function photoRender() {
  const on = photoEnabled();
  const off = document.getElementById('pm-photo-off'), grid = document.getElementById('pm-photo-grid'), st = document.getElementById('pm-photo-state');
  if (!grid) return;
  if (off) off.style.display = on ? 'none' : 'block';
  if (st) { st.textContent = on ? 'aktif' : 'belum diaktifkan'; st.className = 'badge ' + (on ? 'b-done' : 'b-yearly'); }
  ['pm-photo-cam', 'pm-photo-gal'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle('disabled', !on); });
  const cnt = document.getElementById('pm-photo-count');
  if (cnt) cnt.textContent = on ? `${_pmPhotos.length} / ${PHOTO_CONFIG.maxPhotos} foto` : '';

  grid.innerHTML = _pmPhotos.map(p => {
    const badge = p.status === 'uploading' ? '<span class="photo-badge up">⏳ mengunggah…</span>'
      : p.status === 'error' ? `<span class="photo-badge err" title="${escapeHtml(p.error || '')}">⚠ gagal</span>`
      : '<span class="photo-badge ok">✓</span>';
    const retry = p.status === 'error' ? `<button type="button" class="tbl-btn" onclick="photoRetry('${p.id}')">↻ Coba lagi</button>` : '';
    return `<div class="photo-item ${p.status}">
      <a ${p.url ? `href="${escapeHtml(p.url)}" target="_blank" rel="noopener"` : ''} class="photo-thumb"><img src="${escapeHtml(p.thumb || p.url || '')}" alt="Foto equipment" loading="lazy"></a>
      ${badge}
      <input type="text" class="finput photo-cap" maxlength="200" placeholder="Keterangan foto (opsional)" value="${escapeHtml(p.caption || '')}" oninput="photoCaption('${p.id}',this.value)">
      <div class="photo-row">${retry}<button type="button" class="tbl-btn del" onclick="photoRemove('${p.id}')">🗑 Hapus</button></div>
    </div>`;
  }).join('');
}
function photoCaption(id, v) { const p = _pmPhotos.find(x => x.id === id); if (p) p.caption = v; }
function photoRemove(id) { _pmPhotos = _pmPhotos.filter(p => p.id !== id); photoRender(); }

// ── Memilih & memperkecil ───────────────────────────────
async function photoPick(fileList) {
  if (!photoEnabled()) { toast('Fitur foto belum diaktifkan (lihat PHOTO_CONFIG di js/00-config.js)', 'warning'); return; }
  const files = [...(fileList || [])].filter(f => /^image\//.test(f.type));
  if (!files.length) return;
  const room = PHOTO_CONFIG.maxPhotos - _pmPhotos.length;
  if (room <= 0) { toast(`Maksimal ${PHOTO_CONFIG.maxPhotos} foto per laporan`, 'warning'); return; }
  if (files.length > room) toast(`Hanya ${room} foto lagi yang muat — sisanya diabaikan`, 'warning');
  for (const f of files.slice(0, room)) {
    const item = { id: 'p' + (++_photoSeq), url: '', name: f.name || 'foto.jpg', caption: '', at: new Date().toISOString(), status: 'uploading', thumb: '' };
    _pmPhotos.push(item); photoRender();
    try {
      const { blob, thumb } = await photoShrink(f);
      item.blob = blob; item.thumb = thumb; photoRender();
      await photoUpload(item);
    } catch (e) { item.status = 'error'; item.error = e.message || String(e); }
    photoRender();
  }
}

// Perkecil di perangkat: hemat kuota & cepat. createImageBitmap menghormati orientasi EXIF.
async function photoShrink(file) {
  const bmp = await (window.createImageBitmap ? createImageBitmap(file, { imageOrientation: 'from-image' }) : new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Foto tidak bisa dibaca')); i.src = URL.createObjectURL(file); }));
  const w = bmp.width, h = bmp.height, k = Math.min(1, PHOTO_CONFIG.maxEdgePx / Math.max(w, h));
  const draw = (maxEdge, quality) => new Promise(resolve => {
    const kk = Math.min(1, maxEdge / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.round(w * kk); c.height = Math.round(h * kk);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    c.toBlob(b => resolve({ b, url: c.toDataURL('image/jpeg', quality) }), 'image/jpeg', quality);
  });
  const full = await draw(PHOTO_CONFIG.maxEdgePx, PHOTO_CONFIG.jpegQuality);
  const small = await draw(240, 0.7);
  if (bmp.close) bmp.close();
  if (!full.b) throw new Error('Gagal memperkecil foto');
  return { blob: full.b, thumb: small.url };
}

// ── Unggah ke server ────────────────────────────────────
async function photoUpload(item) {
  if (!navigator.onLine) throw new Error('Sedang offline — sambungkan internet lalu ketuk "Coba lagi"');
  item.status = 'uploading'; item.error = '';
  const fd = new FormData();
  const stamp = new Date().toISOString().slice(0, 10);
  fd.append('file', item.blob, (item.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg');
  fd.append('tag', (document.getElementById('pm-tagno')?.value || '').trim().slice(0, 60));
  fd.append('date', document.getElementById('pm-date')?.value || stamp);
  const headers = {}; if (PHOTO_CONFIG.token) headers['X-Upload-Token'] = PHOTO_CONFIG.token;
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 60000);
  let res;
  try { res = await fetch(PHOTO_CONFIG.uploadUrl, { method: 'POST', body: fd, headers, signal: ctrl.signal }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'Unggah terlalu lama (timeout)' : 'Tidak bisa menghubungi server foto'); }
  finally { clearTimeout(timer); }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.success || !json.url) throw new Error((json && json.message) || `Server foto menolak (HTTP ${res.status})`);
  // Hanya terima URL dari server foto yang dikonfigurasi (cegah URL asing masuk ke laporan)
  if (!String(json.url).startsWith(PHOTO_CONFIG.publicBaseUrl)) throw new Error('Alamat foto dari server tidak sesuai publicBaseUrl');
  item.url = json.url; item.status = 'done'; item.blob = null;
}
async function photoRetry(id) {
  const item = _pmPhotos.find(p => p.id === id);
  if (!item || !item.blob) { photoRemove(id); return; }
  item.status = 'uploading'; photoRender();
  try { await photoUpload(item); } catch (e) { item.status = 'error'; item.error = e.message || String(e); }
  photoRender();
}

window.addEventListener('load', photoRender);
