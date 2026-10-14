// ════════════════════════════════════════════════════════
//  MASTER DATA — Unit, Area, Equipment, Tipe Equipment (+ checklist)
//
//  Unit & Area sebelumnya hanya "ada" kalau sudah punya schedule. Master data
//  menyimpan daftar Unit (berikut Area di dalamnya) dan Tipe Equipment tambahan
//  secara terpisah, sehingga bisa dibuat lebih dulu sebelum equipment-nya ada.
//
//  Bentuk data (juga dipakai server, tabel `master`):
//    units   : [{ name, areas: [string] }]
//    eqtypes : [{ key, label }]          key = a-z0-9_ → dipakai sbg equipmentType
//
//  Sifatnya tambah-saja dan digabung (union) — di perangkat maupun di server —
//  jadi dua orang yang menambah bersamaan tidak saling menghapus.
// ════════════════════════════════════════════════════════
const _EQ_SELECT_IDS = ['pm-equipment-type', 'sch-eq-type', 'tmpl-filter-type', 'tmpl-item-eq-type', 'rep-filter-type', 'res-filter-type'];

function getMaster() {
  try {
    const raw = _useLS ? localStorage.getItem(STORE_MASTER) : _mem[STORE_MASTER];
    const m = raw ? JSON.parse(raw) : {};
    return {
      units:   Array.isArray(m.units)   ? m.units   : [],
      eqtypes: Array.isArray(m.eqtypes) ? m.eqtypes : []
    };
  } catch { return { units: [], eqtypes: [] }; }
}

function saveMasterLocal(m) {
  try {
    const s = JSON.stringify(m);
    if (_useLS) localStorage.setItem(STORE_MASTER, s); else _mem[STORE_MASTER] = s;
  } catch (e) { console.warn('[Master] simpan lokal gagal:', e); }
}

// Union dua master (urutan tidak berpengaruh).
function mergeMasterData(a, b) {
  const units = new Map();
  [...(a?.units || []), ...(b?.units || [])].forEach(u => {
    const name = neutralizeText(String(u?.name || '')).trim();
    if (!name) return;
    const set = units.get(name) || new Set();
    (Array.isArray(u.areas) ? u.areas : []).forEach(x => { const t = neutralizeText(String(x || '')).trim(); if (t) set.add(t); });
    units.set(name, set);
  });
  const types = new Map();
  [...(a?.eqtypes || []), ...(b?.eqtypes || [])].forEach(t => {
    const key = String(t?.key || '').trim();
    const label = neutralizeText(String(t?.label || '')).trim();
    if (key && /^[a-z0-9_]{1,40}$/.test(key) && label && !types.has(key)) types.set(key, { key, label });
  });
  return {
    units:   [...units].map(([name, set]) => ({ name, areas: [...set].sort() })).sort((x, y) => x.name.localeCompare(y.name)),
    eqtypes: [...types.values()].sort((x, y) => x.label.localeCompare(y.label))
  };
}

// Kirim satu jenis master ke server; gagal → masuk antrian sync.
function pushMaster(kind) {
  if (!backendEnabled()) return;
  apiOrQueue('saveMaster', { kind, data: getMaster()[kind] }, 'MASTER:' + kind);
}

// ── Daftar gabungan (master + yang sudah dipakai schedule/laporan) ──
function getAllUnits() {
  const set = new Set(getMaster().units.map(u => u.name));
  getData(STORE.SCHEDULES).forEach(s => { if (s.unit) set.add(s.unit); });
  return [...set].filter(Boolean).sort();
}
function getAllAreas(unit = '') {
  const set = new Set();
  getMaster().units.filter(u => !unit || u.name === unit).forEach(u => u.areas.forEach(a => set.add(a)));
  getData(STORE.SCHEDULES).filter(s => !unit || s.unit === unit).forEach(s => { if (s.area) set.add(s.area); });
  return [...set].filter(Boolean).sort();
}

// ── Tipe equipment: daftarkan ke EQ_LABELS / PM_TEMPLATES lalu isi ulang semua dropdown ──
function _titleFromKey(key) { return key.split('_').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }

function applyMasterToRuntime() {
  getMaster().eqtypes.forEach(t => { if (!EQ_LABELS[t.key]) EQ_LABELS[t.key] = t.label; });
  // Template yang ada di server/lokal tapi belum punya label (mis. data lama "pipe_gas")
  Object.keys(getLocalTemplates()).forEach(k => { if (!EQ_LABELS[k]) EQ_LABELS[k] = _titleFromKey(k); });
  populateEquipmentTypeSelects();
}

function populateEquipmentTypeSelects() {
  const entries = Object.entries(EQ_LABELS).sort((a, b) => a[1].localeCompare(b[1]));
  const html = entries.map(([k, l]) => `<option value="${escapeHtml(k)}">${escapeHtml(l)}</option>`).join('');
  _EQ_SELECT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    const first = el.options[0] ? el.options[0].outerHTML : '';   // opsi pertama = placeholder / "Semua"
    el.innerHTML = first + html;
    el.value = EQ_LABELS[cur] ? cur : '';
  });
}

// Isi <datalist> Unit/Area; daftar Area mengikuti Unit yang sedang diisi.
function refreshUnitAreaDatalists(unitInputId, unitListId, areaListId) {
  const unit = (document.getElementById(unitInputId)?.value || '').trim();
  const opts = arr => arr.map(v => `<option value="${escapeHtml(v)}">`).join('');
  const ul = document.getElementById(unitListId), al = document.getElementById(areaListId);
  if (ul) ul.innerHTML = opts(getAllUnits());
  if (al) al.innerHTML = opts(getAllAreas(unit));
}

// ════════════════════════════════════════════════════════
//  HALAMAN "PENGATURAN" (menu sidebar): Unit, Area, Equipment, Tipe + Checklist
// ════════════════════════════════════════════════════════
function loadSettingsPage() {
  applyMasterToRuntime();
  renderSettingsPage();
  if (typeof pwaRefreshUI === 'function') pwaRefreshUI();
}

function _fillSelect(id, values, placeholder, keep = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>` + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  el.value = values.includes(keep) ? keep : '';
}

function onMasterEqUnitChange() {
  const unit = document.getElementById('mst-eq-unit')?.value || '';
  _fillSelect('mst-eq-area', unit ? getAllAreas(unit) : [], unit ? '-- Pilih Area --' : '-- Pilih Unit dulu --');
}

function renderSettingsPage() {
  const units = getAllUnits();
  _fillSelect('mst-area-unit', units, '-- Pilih Unit --', document.getElementById('mst-area-unit')?.value);
  _fillSelect('mst-eq-unit', units, '-- Pilih Unit --', document.getElementById('mst-eq-unit')?.value);
  onMasterEqUnitChange();

  const schedules = getData(STORE.SCHEDULES);
  const tree = units.map(u => {
    const areas = getAllAreas(u);
    const unitCount = schedules.filter(s => s.unit === u).length;
    const areaHtml = areas.length ? areas.map(a => {
      const n = schedules.filter(s => s.unit === u && s.area === a).length;
      return `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0 3px 18px;font-size:12px;color:var(--text2)"><span>📍 ${escapeHtml(a)}</span><span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:${n ? 'var(--text3)' : 'var(--orange)'}">${n ? n + ' equipment' : 'belum ada equipment'}</span></div>`;
    }).join('') : `<div style="padding:3px 0 3px 18px;font-size:11px;color:var(--orange)">Belum ada area</div>`;
    return `<div style="padding:6px 0;border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:var(--navy)"><span>🏭 ${escapeHtml(u)}</span><span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);font-weight:400">${unitCount} equipment</span></div>${areaHtml}</div>`;
  }).join('') || '<div style="font-size:12px;color:var(--text3)">Belum ada unit.</div>';
  document.getElementById('mst-tree').innerHTML = tree;

  _fillChecklistTypeSelect();
  renderChecklistPreview();

  const templates = getLocalTemplates();
  document.getElementById('mst-types').innerHTML = Object.entries(EQ_LABELS)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([k, l]) => `<span class="badge b-monthly" style="font-size:10px;margin:2px 4px 2px 0" title="${escapeHtml(k)}">${escapeHtml(l)} · ${(templates[k] || []).length}</span>`).join('');
}

function addMasterUnit() {
  const input = document.getElementById('mst-unit-name');
  const name = neutralizeText((input.value || '').trim()).slice(0, 100);
  if (!name) { toast('Isi nama unit terlebih dahulu', 'error'); return; }
  if (getAllUnits().some(u => u.toLowerCase() === name.toLowerCase())) { toast(`Unit "${name}" sudah ada`, 'warning'); return; }
  saveMasterLocal(mergeMasterData(getMaster(), { units: [{ name, areas: [] }] }));
  pushMaster('units');
  input.value = '';
  renderSettingsPage();
  populateUnitFilters();
  toast(`Unit "${name}" ditambahkan — lanjut tambah Area`, 'success');
  const sel = document.getElementById('mst-area-unit'); if (sel) sel.value = name;
}

function addMasterArea() {
  const unit = document.getElementById('mst-area-unit').value;
  const input = document.getElementById('mst-area-name');
  const name = neutralizeText((input.value || '').trim()).slice(0, 100);
  if (!unit) { toast('Pilih unit terlebih dahulu', 'error'); return; }
  if (!name) { toast('Isi nama area terlebih dahulu', 'error'); return; }
  if (getAllAreas(unit).some(a => a.toLowerCase() === name.toLowerCase())) { toast(`Area "${name}" sudah ada di ${unit}`, 'warning'); return; }
  saveMasterLocal(mergeMasterData(getMaster(), { units: [{ name: unit, areas: [name] }] }));
  pushMaster('units');
  input.value = '';
  renderSettingsPage();
  toast(`Area "${name}" ditambahkan ke ${unit}`, 'success');
}

function addMasterEquipment() {
  const unit = document.getElementById('mst-eq-unit').value;
  const area = document.getElementById('mst-eq-area').value;
  if (!unit || !area) { toast('Pilih unit dan area terlebih dahulu', 'error'); return; }
  openScheduleModal(null, { unit, area });
}

// ── Tambah item checklist ke tipe yang sudah ada (tanpa pindah halaman) ──
function _fillChecklistTypeSelect(select = '') {
  const el = document.getElementById('mst-chk-type');
  if (!el) return;
  const cur = select || el.value;
  const entries = Object.entries(EQ_LABELS).sort((a, b) => a[1].localeCompare(b[1]));
  el.innerHTML = '<option value="">-- Pilih tipe equipment --</option>' + entries.map(([k, l]) => `<option value="${escapeHtml(k)}">${escapeHtml(l)}</option>`).join('');
  el.value = EQ_LABELS[cur] ? cur : '';
}

function renderChecklistPreview() {
  const type = document.getElementById('mst-chk-type')?.value || '';
  const box = document.getElementById('mst-chk-list');
  if (!box) return;
  if (!type) { box.innerHTML = '<div class="settings-hint">Pilih tipe equipment untuk melihat checklist-nya.</div>'; return; }
  const items = getLocalTemplates()[type] || [];
  box.innerHTML = items.length
    ? `<div class="settings-hint">${items.length} item saat ini:</div><ol>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ol>`
    : '<div class="settings-hint">Belum ada item checklist untuk tipe ini.</div>';
}

function addChecklistItemFromSettings() {
  const type = document.getElementById('mst-chk-type')?.value || '';
  const input = document.getElementById('mst-chk-item');
  const text = neutralizeText((input.value || '').trim()).slice(0, 300);
  if (!type) { toast('Pilih tipe equipment terlebih dahulu', 'error'); return; }
  if (!text) { toast('Isi item checklist terlebih dahulu', 'error'); return; }
  const templates = getLocalTemplates();
  const items = templates[type] || [];
  if (items.some(i => i.trim().toLowerCase() === text.toLowerCase())) { toast('Item itu sudah ada di checklist', 'warning'); return; }
  if (items.length >= 100) { toast('Maksimal 100 item checklist per tipe', 'error'); return; }
  templates[type] = [...items, text];
  saveLocalTemplates(templates);
  applyLocalTemplates();
  _pushTemplate(type, templates[type]);
  input.value = '';
  renderChecklistPreview();
  renderSettingsPage();
  if (document.getElementById('page-templates')?.classList.contains('active')) renderTemplatePage();
  toast(`Item ditambahkan ke checklist ${EQ_LABELS[type]}`, 'success');
}

function _slugEqType(label) {
  return label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function addMasterEquipmentType() {
  const label = neutralizeText((document.getElementById('mst-type-label').value || '').trim()).slice(0, 60);
  const items = (document.getElementById('mst-type-items').value || '').split('\n')
    .map(s => neutralizeText(s.trim()).slice(0, 300)).filter(Boolean);
  if (!label) { toast('Isi nama tipe equipment terlebih dahulu', 'error'); return; }
  const key = _slugEqType(label);
  if (!key) { toast('Nama tipe harus memuat huruf atau angka', 'error'); return; }
  if (EQ_LABELS[key] || Object.values(EQ_LABELS).some(l => l.toLowerCase() === label.toLowerCase())) {
    toast(`Tipe "${label}" sudah ada. Tambah item checklist-nya lewat menu Kelola Template PM`, 'warning'); return;
  }
  if (!items.length) { toast('Isi minimal 1 item checklist (satu item per baris)', 'error'); return; }
  if (items.length > 100) { toast('Maksimal 100 item checklist', 'error'); return; }

  saveMasterLocal(mergeMasterData(getMaster(), { eqtypes: [{ key, label }] }));
  const templates = getLocalTemplates();
  templates[key] = items;
  saveLocalTemplates(templates);
  applyLocalTemplates();
  applyMasterToRuntime();
  pushMaster('eqtypes');
  _pushTemplate(key, items);

  document.getElementById('mst-type-label').value = '';
  document.getElementById('mst-type-items').value = '';
  renderSettingsPage();
  if (document.getElementById('page-templates')?.classList.contains('active')) renderTemplatePage();
  _fillChecklistTypeSelect(key);
  renderChecklistPreview();
  toast(`Tipe "${label}" ditambahkan dengan ${items.length} item checklist`, 'success');
}

// Dipanggil dari sync: gabungkan master dari server, daftarkan tipe baru, dan
// tarik template-nya bila perangkat ini belum punya.
async function pullMasterFromServer() {
  const res = await api('getMaster', {}, 1);
  if (!res?.success || !res.master) return false;
  saveMasterLocal(mergeMasterData(getMaster(), res.master));
  const missing = getMaster().eqtypes.some(t => !(PM_TEMPLATES[t.key] && PM_TEMPLATES[t.key].length));
  if (missing) { try { await syncTemplatesFromGAS(true); } catch {} }
  applyMasterToRuntime();
  return true;
}
