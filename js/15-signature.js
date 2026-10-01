// ════════════════════════════════════════════════════════
//  SIGNATURE SYSTEM
// ════════════════════════════════════════════════════════
let _sigPmId = null;

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
  document.getElementById('sig-spv-name').value = existing.spvName || '';
  document.getElementById('sig-leader-name').value = existing.leaderName || '';

  setupSigCanvas('spv');
  setupSigCanvas('leader');

  if (existing.spvSig) { loadImgToCanvas('sig-canvas-spv', existing.spvSig); document.getElementById('sig-spv-saved').style.display = 'block'; document.getElementById('sig-spv-hint').style.display = 'none'; }
  else { document.getElementById('sig-spv-saved').style.display = 'none'; document.getElementById('sig-spv-hint').style.display = 'flex'; }
  if (existing.leaderSig) { loadImgToCanvas('sig-canvas-leader', existing.leaderSig); document.getElementById('sig-leader-saved').style.display = 'block'; document.getElementById('sig-leader-hint').style.display = 'none'; }
  else { document.getElementById('sig-leader-saved').style.display = 'none'; document.getElementById('sig-leader-hint').style.display = 'flex'; }

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
  const nameInput = document.getElementById(role === 'spv' ? 'sig-spv-name' : 'sig-leader-name');
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
  const spvName = document.getElementById('sig-spv-name').value.trim();
  const leaderName = document.getElementById('sig-leader-name').value.trim();
  const spvEmpty = isCanvasBlank('sig-canvas-spv');
  const leaderEmpty = isCanvasBlank('sig-canvas-leader');
  if (!spvEmpty && !spvName) { toast('Isi nama Supervisor','error'); return; }
  if (!leaderEmpty && !leaderName) { toast('Isi nama Leader','error'); return; }

  const now = new Date().toISOString();
  const spvC = document.getElementById('sig-canvas-spv');
  const ldC = document.getElementById('sig-canvas-leader');
  const sigData = {
    spvName, spvSig: spvEmpty ? '' : spvC.toDataURL('image/png'), spvAt: spvEmpty ? '' : now,
    leaderName, leaderSig: leaderEmpty ? '' : ldC.toDataURL('image/png'), leaderAt: leaderEmpty ? '' : now
  };
  saveLocalSig(_sigPmId, sigData);
  toast('Tanda tangan disimpan ✓','success');

  // FIX: dulu dikirim lewat URL GET — gambar TTD base64 terlalu panjang untuk
  // URL sehingga SELALU gagal, dan kegagalannya ditelan catch kosong. Sekarang
  // POST + antrian retry.
  if (backendEnabled()) {
    const r = getData(STORE.REPORTS).find(x=>x.id===_sigPmId)||{};
    apiOrQueue('saveSignature',{signature:{pmId:_sigPmId,tagNo:r.tagNo||'',equipmentName:r.equipmentName||'',tanggal:r.date||'',
      spvName:sigData.spvName, spvSignature:sigData.spvSig, spvSignedAt:sigData.spvAt,
      leaderName:sigData.leaderName, leaderSignature:sigData.leaderSig, leaderSignedAt:sigData.leaderAt,
      updatedAt:now}}, 'SIG:' + _sigPmId);
  }
  closeOverlay('signatureOverlay');
  downloadPMPDFById(_sigPmId);
}
