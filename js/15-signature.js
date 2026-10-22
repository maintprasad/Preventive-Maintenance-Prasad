// ════════════════════════════════════════════════════════
//  SIGNATURE SYSTEM
// ════════════════════════════════════════════════════════
let _sigPmId = null;
let _sigRolesCur = [];   // peran yang sedang tampil di modal (format standar atau format unit, mis. Malang)

// Peran penanda tangan menurut unit laporan. Standar: Leader (spv) + Owner Area (leader).
// Unit dengan format khusus (PM_UNIT_FORMATS di 00-config.js, mis. Unit Malang): 4 peran tersimpan di signatures.signers.
function sigRolesFor(unit) {
  const f = pmUnitFormat(unit);
  if (f) return f.roles.map(r => ({ key: r.key, title: r.title + ' (' + r.sub + ')', label: 'Nama ' + r.title, defaultName: r.defaultName || '', multi: true }));
  return [{ key: 'spv', title: 'Leader Maintenance', label: 'Nama Leader', multi: false }, { key: 'leader', title: 'Owner Area', label: 'Nama Owner', multi: false }];
}
// Ada TTD sama sekali (standar atau multi)?
const sigHasAny = sig => !!(sig && (sig.spvSig || sig.leaderSig || Object.values(sig.signers || {}).some(x => x && x.sig)));
function _sigBlockHTML(r) {
  const k = r.key;
  return `<div class="section-card" style="margin-bottom:12px">
      <div class="section-card-title">${escapeHtml(r.title)}</div>
      <div class="sigp-pick"><select class="fsel2" id="sig-${k}-pick" onchange="sigApplyProfile('${k}')" aria-label="Pilih tanda tangan tersimpan">${sigProfileOptionsHTML()}</select></div>
      <div class="form-grid" style="margin-bottom:10px">
        <div class="fg"><span class="flabel">${escapeHtml(r.label)}</span><input class="finput" type="text" id="sig-${k}-name" placeholder="Nama lengkap"></div>
        <div class="fg" style="justify-content:flex-end;padding-top:18px;flex-direction:row;gap:6px">
          <button class="btn-primary" style="font-size:10px;flex:1" onclick="generateArtisticSignature('${k}')">✒️ Generate Otomatis</button>
          <button class="btn-ghost" style="font-size:10px" onclick="clearSigCanvas('${k}')">🗑 Hapus TTD</button>
          <button class="btn-ghost" style="font-size:10px" onclick="sigSaveRoleAsProfile('${k}', '${escapeHtml(r.title.replace(/ \(.*$/, ''))}')" title="Simpan nama & tanda tangan ini ke daftar tersimpan (Pengaturan)">💾 Simpan ke Daftar</button>
        </div>
      </div>
      <div style="border:2px dashed var(--border);border-radius:8px;overflow:hidden;background:#fff;position:relative">
        <canvas id="sig-canvas-${k}" width="720" height="140" style="width:100%;height:140px;display:block;cursor:crosshair;touch-action:none"></canvas>
        <div id="sig-${k}-hint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:12px;color:var(--border);font-family:'IBM Plex Mono',monospace">Tanda tangan di sini</div>
      </div>
      <div id="sig-${k}-saved" style="display:none;margin-top:6px;font-size:11px;color:var(--green2);font-family:'IBM Plex Mono',monospace">✓ Tanda tangan sudah tersimpan</div>
    </div>`;
}

function getLocalSigs() {
  try { const raw = _useLS ? localStorage.getItem(STORE_SIGS) : (_mem[STORE_SIGS]||null); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function saveLocalSig(pmId, data) {
  const sigs = getLocalSigs();
  sigs[pmId] = { ...(sigs[pmId]||{}), ...data, updatedAt: new Date().toISOString() };
  try { const s = JSON.stringify(sigs); if (_useLS) localStorage.setItem(STORE_SIGS, s); else _mem[STORE_SIGS] = s; } catch(e) {}
}

// Gabungkan TTD dari server (hasil getSignatures saat sync) ke penyimpanan lokal.
// Yang lebih baru (updatedAt) menang; TTD yang masih di antrian upload tidak ditimpa.
// signers dari server datang sebagai string JSON → object { peran: {name, sig, at} } dengan gambar & nama yang sudah divalidasi
function _parseSigners(v, isImg) {
  let o = v;
  if (typeof v === 'string') { try { o = JSON.parse(v); } catch { o = {}; } }
  const out = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    ['execute', 'checked', 'review', 'approved'].forEach(k => {
      const x = o[k]; if (!x || typeof x !== 'object') return;
      out[k] = { name: neutralizeText(String(x.name || '')), sig: isImg(x.sig) ? x.sig : '', at: x.at || '' };
    });
  }
  return out;
}
function mergeRemoteSignatures(list) {
  const sigs = getLocalSigs();
  const pending = getPendingRecordIds();
  const isImg = v => typeof v === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v);
  let changed = false;
  (list || []).forEach(s => {
    if (!s || !isSafeId(s.pmId) || pending.has('SIG:' + s.pmId)) return;
    const cur = sigs[s.pmId];
    if (cur && cur.updatedAt && s.updatedAt && new Date(cur.updatedAt) >= new Date(s.updatedAt)) return;
    sigs[s.pmId] = {
      spvName: neutralizeText(s.spvName || ''),       spvSig: isImg(s.spvSignature) ? s.spvSignature : '',       spvAt: s.spvSignedAt || '',
      leaderName: neutralizeText(s.leaderName || ''), leaderSig: isImg(s.leaderSignature) ? s.leaderSignature : '', leaderAt: s.leaderSignedAt || '',
      signers: _parseSigners(s.signers, isImg),
      updatedAt: s.updatedAt || new Date().toISOString()
    };
    changed = true;
  });
  if (!changed) return;
  try { const str = JSON.stringify(sigs); if (_useLS) localStorage.setItem(STORE_SIGS, str); else _mem[STORE_SIGS] = str; } catch(e) {}
}

function openSignatureModal(pmId) {
  const r = getData(STORE.REPORTS).find(x => x.id === pmId);
  if (!r) { toast('Laporan tidak ditemukan', 'error'); return; }
  _sigPmId = pmId;

  const dateFmt = r.date ? new Date(r.date).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}) : '—';
  document.getElementById('sig-pm-info').innerHTML =
    `<div style="font-weight:600;font-size:13px;margin-bottom:4px">${r.equipmentName||'—'} <span style="font-family:'IBM Plex Mono',monospace;color:var(--accent);font-size:11px">${r.tagNo||''}</span></div>` +
    `<div style="color:var(--text3);font-size:11px">📅 ${dateFmt} &nbsp;·&nbsp; 👤 Teknisi: <strong>${r.teknisi||'—'}</strong> &nbsp;·&nbsp; 🏭 ${r.unit||'—'}</div>`;

  const existing = getLocalSigs()[pmId] || {};
  const roles = sigRolesFor(r.unit);
  _sigRolesCur = roles;
  document.getElementById('sig-blocks').innerHTML = roles.map(_sigBlockHTML).join('');
  roles.forEach(ro => {
    const cur = ro.multi ? ((existing.signers || {})[ro.key] || {})
      : (ro.key === 'spv' ? { name: existing.spvName, sig: existing.spvSig } : { name: existing.leaderName, sig: existing.leaderSig });
    // nama awal: yang tersimpan → nama bawaan peran (mis. Plan Manager Malang) → teknisi untuk peran "execute"
    document.getElementById('sig-' + ro.key + '-name').value = cur.name || ro.defaultName || (ro.key === 'execute' ? (r.teknisi || '') : '');
    setupSigCanvas(ro.key);
    if (cur.sig) { loadImgToCanvas('sig-canvas-' + ro.key, cur.sig); document.getElementById('sig-' + ro.key + '-saved').style.display = 'block'; document.getElementById('sig-' + ro.key + '-hint').style.display = 'none'; }
    else { document.getElementById('sig-' + ro.key + '-saved').style.display = 'none'; document.getElementById('sig-' + ro.key + '-hint').style.display = 'flex'; }
  });

  openOverlay('signatureOverlay');
}

function setupSigCanvas(role) {
  const id = 'sig-canvas-' + role;
  const hintId = 'sig-' + role + '-hint';
  const old = document.getElementById(id);
  if (!old) return;
  const canvas = old.cloneNode(true);
  old.parentNode.replaceChild(canvas, old);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let drawing = false, lx, ly;
  const getXY = e => { const r = canvas.getBoundingClientRect(); const sx = canvas.width / r.width, sy = canvas.height / r.height; const src = e.touches ? e.touches[0] : e; return [(src.clientX - r.left) * sx, (src.clientY - r.top) * sy]; };
  const start = e => { e.preventDefault(); drawing = true; [lx,ly] = getXY(e); ctx.beginPath(); ctx.moveTo(lx,ly); document.getElementById(hintId).style.display = 'none'; document.getElementById('sig-'+role+'-saved').style.display = 'none'; };
  const draw = e => { e.preventDefault(); if (!drawing) return; const [x,y] = getXY(e); ctx.lineTo(x,y); ctx.stroke(); [lx,ly]=[x,y]; };
  const stop = () => drawing = false;
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stop); canvas.addEventListener('mouseleave', stop);
  canvas.addEventListener('touchstart', start, {passive:false}); canvas.addEventListener('touchmove', draw, {passive:false});
  canvas.addEventListener('touchend', stop);
}

function loadImgToCanvas(canvasId, b64) {
  const c = document.getElementById(canvasId); if (!c) return;
  const img = new Image();
  img.onload = () => { c.getContext('2d').clearRect(0,0,c.width,c.height); c.getContext('2d').drawImage(img,0,0,c.width,c.height); };
  img.src = b64;
}

function clearSigCanvas(role) {
  const c = document.getElementById('sig-canvas-' + role); if (!c) return;
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
  document.getElementById('sig-' + role + '-hint').style.display = 'flex';
  document.getElementById('sig-' + role + '-saved').style.display = 'none';
}

// ── GENERATE TANDA TANGAN ARTISTIK OTOMATIS ──
const _sigFonts = ['"Dancing Script"','"Great Vibes"','"Sacramento"','"Alex Brush"','"Pacifico"'];
const _sigInkColors = ['#12203f','#1a1a2e','#111111','#14213d','#20263d'];

function _hashName(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }

function getNameSigCache() { try { return JSON.parse(localStorage.getItem(STORE_NAME_SIGS) || '{}'); } catch { return {}; } }
function saveNameSigCache(key, data) {
  const cache = getNameSigCache();
  cache[key] = { ...data, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(STORE_NAME_SIGS, JSON.stringify(cache)); } catch(e) {}
}

async function drawArtisticSignatureToCanvas(canvas, name) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const h      = _hashName(name.toLowerCase().trim());
  const font   = _sigFonts[h % _sigFonts.length];
  const color  = _sigInkColors[(h >> 4) % _sigInkColors.length];
  const angle  = (((h >> 3) % 7) - 3) * Math.PI / 180;

  let fontSize = 64;
  try { await document.fonts.load(`italic ${fontSize}px ${font}`); } catch(e) {}
  ctx.font = `italic ${fontSize}px ${font}`;
  const maxW = canvas.width - 90;
  let tw = ctx.measureText(name).width;
  while (tw > maxW && fontSize > 22) { fontSize -= 2; ctx.font = `italic ${fontSize}px ${font}`; tw = ctx.measureText(name).width; }

  const cx = canvas.width / 2, cy = canvas.height / 2 - 6;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 0, 0);
  ctx.restore();

  const baseY  = cy + fontSize * 0.42;
  const spread = Math.min(maxW, tw + 40);
  const x0 = cx - spread / 2, x1 = cx + spread / 2;
  const wob1 = ((h >> 5) % 20) - 10;
  const wob2 = ((h >> 9) % 20) - 10;

  ctx.beginPath(); ctx.moveTo(x0, baseY);
  ctx.bezierCurveTo(cx - spread*0.2, baseY + 10 + wob1, cx + spread*0.2, baseY - 10 + wob2, x1, baseY);
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();

  ctx.beginPath(); ctx.moveTo(x0, baseY);
  ctx.quadraticCurveTo(x0 - 14, baseY - 16 - ((h >> 2) % 10), x0 - 2, baseY - 4);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

async function generateArtisticSignature(role) {
  const nameInput = document.getElementById('sig-' + role + '-name');
  const name = (nameInput?.value || '').trim();
  if (!name) { toast('Isi nama terlebih dahulu sebelum generate tanda tangan', 'error'); return; }
  const canvas = document.getElementById('sig-canvas-' + role);
  if (!canvas) return;
  const dataUrl = await drawArtisticSignatureToCanvas(canvas, name);
  document.getElementById('sig-' + role + '-hint').style.display = 'none';
  const savedLabel = document.getElementById('sig-' + role + '-saved');
  savedLabel.style.display = 'block';
  savedLabel.textContent = '✓ Tanda tangan otomatis dibuat — klik "SIMPAN & BUKA PDF" untuk menyimpan permanen';
  saveNameSigCache(name.toLowerCase(), { name, dataUrl, font: '' });
  toast(`✒️ Tanda tangan otomatis untuk "${name}" berhasil dibuat`, 'success');
}

function isCanvasBlank(canvasId) {
  const c = document.getElementById(canvasId); if (!c) return true;
  return !c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(v => v !== 0);
}

async function saveSignaturesAndPDF() {
  if (!_sigPmId) return;
  const roles = _sigRolesCur.length ? _sigRolesCur : sigRolesFor('');
  const now = new Date().toISOString();
  const read = ro => {
    const name = document.getElementById('sig-' + ro.key + '-name').value.trim();
    const empty = isCanvasBlank('sig-canvas-' + ro.key);
    return { ro, name, empty, data: empty ? '' : document.getElementById('sig-canvas-' + ro.key).toDataURL('image/png') };
  };
  const vals = roles.map(read);
  const bad = vals.find(v => !v.empty && !v.name);
  if (bad) { toast('Isi nama ' + bad.ro.title, 'error'); return; }

  let sigData, payload;
  if (roles[0].multi) {
    const signers = {};
    vals.forEach(v => { if (v.name || v.data) signers[v.ro.key] = { name: v.name, sig: v.data, at: v.empty ? '' : now }; });
    sigData = { signers };
    payload = { signers };
  } else {
    const [spv, ld] = vals;
    sigData = { spvName: spv.name, spvSig: spv.data, spvAt: spv.empty ? '' : now, leaderName: ld.name, leaderSig: ld.data, leaderAt: ld.empty ? '' : now };
    payload = { spvName: sigData.spvName, spvSignature: sigData.spvSig, spvSignedAt: sigData.spvAt, leaderName: sigData.leaderName, leaderSignature: sigData.leaderSig, leaderSignedAt: sigData.leaderAt };
  }
  saveLocalSig(_sigPmId, sigData);
  toast('Tanda tangan disimpan ✓','success');

  // FIX: dulu dikirim lewat URL GET — gambar TTD base64 terlalu panjang untuk
  // URL sehingga SELALU gagal, dan kegagalannya ditelan catch kosong. Sekarang
  // POST + antrian retry.
  if (backendEnabled()) {
    const r = getData(STORE.REPORTS).find(x=>x.id===_sigPmId)||{};
    apiOrQueue('saveSignature',{signature:{pmId:_sigPmId,tagNo:r.tagNo||'',equipmentName:r.equipmentName||'',tanggal:r.date||'',
      ...payload, updatedAt:now}}, 'SIG:' + _sigPmId);
  }
  closeOverlay('signatureOverlay');
  downloadPMPDFById(_sigPmId);
}
