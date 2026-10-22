// ════════════════════════════════════════════════════════
//  TANDA TANGAN TERSIMPAN (Pengaturan)
//
//  Pustaka tanda tangan per orang yang dibuat sekali lalu dipakai ulang di semua laporan:
//  di modal pengesahan, tiap peran tinggal memilih nama dari daftar (nama + gambar terisi otomatis).
//  Tersimpan di perangkat (localStorage) dan disinkronkan ke server (tabel sigprofiles) seperti data lain:
//  perubahan yang terlambat terkirim tidak menimpa yang lebih baru, dan hapus bersifat lunak.
//  Tanda tangan di laporan yang sudah disahkan TIDAK berubah bila entri di sini diubah/dihapus (disalin saat dipakai).
// ════════════════════════════════════════════════════════
const STORE_SIGPROFILES = 'pm_sigprofiles_v1';
const _SIGP_IMG_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
let _sigpEditId = null;

function getSigProfiles() {
  try {
    const raw = _useLS ? localStorage.getItem(STORE_SIGPROFILES) : _mem[STORE_SIGPROFILES];
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
function _saveSigProfilesLocal(list) {
  try { const s = JSON.stringify(list); if (_useLS) localStorage.setItem(STORE_SIGPROFILES, s); else _mem[STORE_SIGPROFILES] = s; }
  catch (e) { console.warn('[TTD] simpan lokal gagal:', e); toast('Penyimpanan perangkat penuh — tanda tangan tidak tersimpan lokal', 'error'); }
}
const _sigpSorted = list => [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));

function _pushSigProfile(p, deleted) {
  if (!backendEnabled()) return;
  apiOrQueue('saveSigProfile', { profile: { id: p.id, name: p.name, jabatan: p.jabatan || '', sig: deleted ? '' : p.sig, deleted: !!deleted, updatedAt: p.updatedAt } }, 'SIGP:' + p.id);
}

// Gabungkan hasil pull server (daftar + id yang dihapus). Yang lebih baru menang; yang masih antre kirim tidak ditimpa.
function mergeRemoteSigProfiles(remote, deletedIds) {
  const pending = getPendingRecordIds();
  const map = new Map(getSigProfiles().map(p => [p.id, p]));
  let changed = false;
  (remote || []).forEach(r => {
    if (!r || !isSafeId(r.id) || pending.has('SIGP:' + r.id) || !_SIGP_IMG_RE.test(r.sig || '')) return;
    const cur = map.get(r.id);
    if (cur && cur.updatedAt && r.updatedAt && new Date(cur.updatedAt) >= new Date(r.updatedAt)) return;
    map.set(r.id, { id: r.id, name: neutralizeText(r.name || ''), jabatan: neutralizeText(r.jabatan || ''), sig: r.sig, updatedAt: r.updatedAt || new Date().toISOString() });
    changed = true;
  });
  (deletedIds || []).forEach(id => { if (map.has(id) && !pending.has('SIGP:' + id)) { map.delete(id); changed = true; } });
  if (changed) { _saveSigProfilesLocal([...map.values()]); renderSigProfiles(); }
}

// ── Daftar di halaman Pengaturan ──
function renderSigProfiles() {
  const box = document.getElementById('sigp-list');
  if (!box) return;
  const list = _sigpSorted(getSigProfiles());
  if (!list.length) { box.innerHTML = '<div class="settings-hint">Belum ada tanda tangan tersimpan. Klik "+ Tambah Tanda Tangan".</div>'; return; }
  box.innerHTML = list.map(p => `
    <div class="sigp-item">
      <div class="sigp-img"><img src="${p.sig}" alt="Tanda tangan ${escapeHtml(p.name)}"></div>
      <div class="sigp-info"><div class="sigp-name">${escapeHtml(p.name)}</div><div class="sigp-role">${escapeHtml(p.jabatan || '—')}</div></div>
      <div class="sigp-act"><button class="btn-ghost" onclick="openSigProfileModal('${escapeHtml(p.id)}')">✎ Ubah</button><button class="btn-ghost" onclick="deleteSigProfile('${escapeHtml(p.id)}')">🗑 Hapus</button></div>
    </div>`).join('');
}

// ── Modal tambah / ubah ──
function openSigProfileModal(id) {
  _sigpEditId = id || null;
  const p = id ? getSigProfiles().find(x => x.id === id) : null;
  if (id && !p) return;
  document.getElementById('sigp-modal-title').textContent = p ? 'Ubah Tanda Tangan Tersimpan' : 'Tambah Tanda Tangan Tersimpan';
  document.getElementById('sig-prof-name').value = p ? p.name : '';
  document.getElementById('sigp-jabatan').value = p ? (p.jabatan || '') : '';
  document.getElementById('sigp-file').value = '';
  openOverlay('sigProfileOverlay');
  setupSigCanvas('prof');
  if (p) { loadImgToCanvas('sig-canvas-prof', p.sig); document.getElementById('sig-prof-hint').style.display = 'none'; document.getElementById('sig-prof-saved').style.display = 'block'; }
  else { document.getElementById('sig-prof-hint').style.display = 'flex'; document.getElementById('sig-prof-saved').style.display = 'none'; }
}

// Gambar dari berkas (foto/scan tanda tangan) → dimuat ke kanvas, skala menyesuaikan, latar putih dibuat transparan
function sigProfileLoadFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Pilih berkas gambar', 'error'); input.value = ''; return; }
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    const c = document.getElementById('sig-canvas-prof'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const k = Math.min(c.width / img.width, c.height / img.height), w = img.width * k, h = img.height * k, x = (c.width - w) / 2, y = (c.height - h) / 2;
    ctx.drawImage(img, x, y, w, h);
    try {   // buang latar terang (kertas putih) supaya tanda tangan tampil bersih di PDF
      const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) { const lum = (px[i] + px[i + 1] + px[i + 2]) / 3; if (px[i + 3] && lum > 215) px[i + 3] = 0; else if (px[i + 3] && lum > 170) px[i + 3] = Math.round(px[i + 3] * (215 - lum) / 45); }
      ctx.putImageData(d, 0, 0);
    } catch { /* kanvas tercemar: biarkan apa adanya */ }
    URL.revokeObjectURL(url);
    document.getElementById('sig-prof-hint').style.display = 'none';
    document.getElementById('sig-prof-saved').style.display = 'block'; document.getElementById('sig-prof-saved').textContent = '✓ Gambar dimuat — klik "Simpan" untuk menyimpan';
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Gambar tidak bisa dibaca', 'error'); };
  img.src = url;
}

function saveSigProfile() {
  const name = document.getElementById('sig-prof-name').value.trim();
  const jabatan = document.getElementById('sigp-jabatan').value.trim();
  if (!name) { toast('Isi nama terlebih dahulu', 'error'); return; }
  if (isCanvasBlank('sig-canvas-prof')) { toast('Tanda tangan masih kosong — gambar, generate otomatis, atau unggah gambar', 'error'); return; }
  const sig = document.getElementById('sig-canvas-prof').toDataURL('image/png');
  if (sig.length > 400000) { toast('Gambar terlalu besar', 'error'); return; }
  const list = getSigProfiles();
  const p = { id: _sigpEditId || ('SP-' + genId()), name, jabatan, sig, updatedAt: new Date().toISOString() };
  const i = list.findIndex(x => x.id === p.id);
  if (i >= 0) list[i] = p; else list.push(p);
  _saveSigProfilesLocal(list);
  _pushSigProfile(p, false);
  closeOverlay('sigProfileOverlay');
  renderSigProfiles();
  toast('Tanda tangan tersimpan ✓', 'success');
}

function deleteSigProfile(id) {
  const list = getSigProfiles(), p = list.find(x => x.id === id);
  if (!p) return;
  if (!confirm('Hapus tanda tangan "' + p.name + '" dari daftar?\nLaporan yang sudah disahkan tidak berubah.')) return;
  _saveSigProfilesLocal(list.filter(x => x.id !== id));
  _pushSigProfile({ ...p, updatedAt: new Date().toISOString() }, true);
  renderSigProfiles();
  toast('Tanda tangan dihapus', 'success');
}

// ── Dipakai modal pengesahan laporan: pilih orang dari daftar ──
function sigProfileOptionsHTML() {
  const list = _sigpSorted(getSigProfiles());
  return '<option value="">' + (list.length ? '— Pilih dari tanda tangan tersimpan —' : '— Belum ada (tambahkan di Pengaturan) —') + '</option>' +
    list.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.jabatan ? ' — ' + escapeHtml(p.jabatan) : ''}</option>`).join('');
}
function sigApplyProfile(role) {
  const sel = document.getElementById('sig-' + role + '-pick');
  const p = sel && getSigProfiles().find(x => x.id === sel.value);
  if (!p) return;
  document.getElementById('sig-' + role + '-name').value = p.name;
  loadImgToCanvas('sig-canvas-' + role, p.sig);
  document.getElementById('sig-' + role + '-hint').style.display = 'none';
  const lb = document.getElementById('sig-' + role + '-saved');
  lb.style.display = 'block'; lb.textContent = '✓ Tanda tangan "' + p.name + '" dipakai dari daftar tersimpan — klik "SIMPAN & BUKA PDF" untuk menyimpan ke laporan';
}
// Simpan tanda tangan yang sedang tampil di modal pengesahan ke daftar tersimpan (nama + gambar)
function sigSaveRoleAsProfile(role, jabatan) {
  const name = document.getElementById('sig-' + role + '-name').value.trim();
  if (!name) { toast('Isi nama terlebih dahulu', 'error'); return; }
  if (isCanvasBlank('sig-canvas-' + role)) { toast('Tanda tangan masih kosong', 'error'); return; }
  const list = getSigProfiles(), sig = document.getElementById('sig-canvas-' + role).toDataURL('image/png');
  const cur = list.find(x => x.name.toLowerCase() === name.toLowerCase());
  const p = { id: cur ? cur.id : 'SP-' + genId(), name, jabatan: cur ? (cur.jabatan || jabatan || '') : (jabatan || ''), sig, updatedAt: new Date().toISOString() };
  if (cur) list[list.indexOf(cur)] = p; else list.push(p);
  _saveSigProfilesLocal(list); _pushSigProfile(p, false); renderSigProfiles();
  toast(cur ? 'Tanda tangan "' + name + '" diperbarui di daftar' : 'Tanda tangan "' + name + '" disimpan ke daftar', 'success');
}
