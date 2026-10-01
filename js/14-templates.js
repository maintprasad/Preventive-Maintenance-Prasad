// ════════════════════════════════════════════════════════
//  TEMPLATE MANAGEMENT
// ════════════════════════════════════════════════════════
function getLocalTemplates() {
  try {
    const raw = _useLS ? localStorage.getItem(STORE_TMPL) : (_mem[STORE_TMPL]||null);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(PM_TEMPLATES));
  } catch { return JSON.parse(JSON.stringify(PM_TEMPLATES)); }
}
function saveLocalTemplates(t) {
  try { const s = JSON.stringify(t); if (_useLS) localStorage.setItem(STORE_TMPL, s); else _mem[STORE_TMPL] = s; } catch(e) {}
}
function applyLocalTemplates() {
  const t = getLocalTemplates();
  Object.keys(t).forEach(k => { if (Array.isArray(t[k]) && t[k].length > 0) PM_TEMPLATES[k] = t[k]; });
}
function loadTemplatePage() { applyLocalTemplates(); renderTemplatePage(); }

// Kirim daftar checklist LENGKAP satu equipment type (bukan per item) —
// dulu kegagalan kirim ditelan diam-diam (catch kosong), sekarang masuk antrian.
function _pushTemplate(eqType, items) {
  if (backendEnabled()) apiOrQueue('saveTemplate', { equipmentType: eqType, items: items || [] }, 'TMPL:' + eqType);
}

async function syncTemplatesFromGAS() {
  if (!backendEnabled()) { toast('Buka aplikasi lewat http(s) untuk sync template','warning'); return; }
  toast('Mengambil template dari database...','info');
  try {
    const res = await api('getTemplates');
    if (res.success && res.templates) {
      const merged = getLocalTemplates();
      Object.keys(res.templates).forEach(k => { if (Array.isArray(res.templates[k]) && res.templates[k].length > 0) merged[k] = res.templates[k].map(neutralizeText); });
      saveLocalTemplates(merged);
      applyLocalTemplates();
      renderTemplatePage();
      toast('Template berhasil disinkron dari database ✓','success');
    }
  } catch(e) { toast('Gagal sync template','error'); }
}

function renderTemplatePage() {
  const search = (document.getElementById('tmpl-search')?.value||'').toLowerCase();
  const typeFilter = document.getElementById('tmpl-filter-type')?.value||'';
  const templates = getLocalTemplates();
  const container = document.getElementById('template-list-container');
  if (!container) return;

  const allTypes = Object.keys(EQ_LABELS);
  const types = typeFilter ? [typeFilter] : allTypes;
  let html = '';

  types.forEach(eqType => {
    const label = EQ_LABELS[eqType] || eqType;
    const items = templates[eqType] || [];
    const filtered = search ? items.filter(item => item.toLowerCase().includes(search) || label.toLowerCase().includes(search)) : items;
    if (search && filtered.length === 0 && !label.toLowerCase().includes(search)) return;

    html += `<div class="section-card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="section-card-title" style="margin-bottom:0;border-bottom:none;padding-bottom:0">🔧 ${label}</div>
          <span class="badge b-monthly" style="font-size:9px">${filtered.length} item</span>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-ghost" style="font-size:10px;padding:5px 10px" onclick="openAddTemplateItemModal('${eqType}')">+ Tambah Item</button>
          <button class="btn-ghost" style="font-size:10px;padding:5px 10px" onclick="resetTemplateToDefault('${eqType}')">↺ Reset Default</button>
        </div>
      </div>
      <div class="tbl-wrap"><table class="data-table">
        <thead><tr><th style="width:36px">NO</th><th>ITEM CHECKLIST PM</th><th style="width:90px;text-align:center">AKSI</th></tr></thead>
        <tbody>
          ${filtered.length === 0
            ? `<tr><td colspan="3" style="text-align:center;padding:22px;color:var(--text3);font-size:12px">Belum ada item. Klik "+ Tambah Item" untuk menambahkan.</td></tr>`
            : filtered.map((item, i) => {
                const realIdx = items.indexOf(item);
                return `<tr><td style="text-align:center;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text3)">${i+1}</td>
                  <td style="font-size:13px">${escapeHtml(item)}</td>
                  <td style="text-align:center"><div style="display:flex;gap:4px;justify-content:center">
                    <button class="tbl-btn" onclick="editTemplateItem('${eqType}',${realIdx})" style="padding:3px 8px">✏</button>
                    <button class="tbl-btn del" onclick="confirmDeleteTemplateItem('${eqType}',${realIdx})" style="padding:3px 8px">🗑</button>
                  </div></td></tr>`;
              }).join('')}
        </tbody>
      </table></div>
    </div>`;
  });

  container.innerHTML = html || '<div class="empty"><div class="empty-ico">🔧</div><div class="empty-msg">Tidak ada template ditemukan.</div></div>';
}

function openAddTemplateItemModal(eqType = '') {
  document.getElementById('tmpl-edit-eq-type').value = '';
  document.getElementById('tmpl-edit-original-item').value = '';
  document.getElementById('tmpl-edit-item-index').value = '';
  document.getElementById('tmplItemModalTitle').textContent = 'Tambah Item Checklist PM';
  document.getElementById('tmpl-item-eq-type').value = eqType;
  document.getElementById('tmpl-item-text').value = '';
  openOverlay('addTemplateItemOverlay');
  setTimeout(() => document.getElementById('tmpl-item-text')?.focus(), 100);
}

function editTemplateItem(eqType, itemIndex) {
  const templates = getLocalTemplates();
  const item = (templates[eqType] || [])[itemIndex];
  if (item === undefined) return;
  document.getElementById('tmpl-edit-eq-type').value = eqType;
  document.getElementById('tmpl-edit-original-item').value = item;
  document.getElementById('tmpl-edit-item-index').value = itemIndex;
  document.getElementById('tmplItemModalTitle').textContent = 'Edit Item Checklist PM';
  document.getElementById('tmpl-item-eq-type').value = eqType;
  document.getElementById('tmpl-item-text').value = item;
  openOverlay('addTemplateItemOverlay');
}

async function saveTemplateItem() {
  const eqType = document.getElementById('tmpl-item-eq-type').value;
  const itemText = document.getElementById('tmpl-item-text').value.trim();
  const editIndex = document.getElementById('tmpl-edit-item-index').value;

  if (!eqType) { toast('Pilih equipment terlebih dahulu','error'); return; }
  if (!itemText) { toast('Isi item checklist terlebih dahulu','error'); return; }

  const templates = getLocalTemplates();
  if (!templates[eqType]) templates[eqType] = [];
  if (editIndex !== '') templates[eqType][parseInt(editIndex)] = itemText;
  else templates[eqType].push(itemText);

  saveLocalTemplates(templates);
  applyLocalTemplates();
  closeOverlay('addTemplateItemOverlay');
  renderTemplatePage();
  toast(`Item "${itemText.substring(0,40)}..." berhasil disimpan ✓`, 'success');

  _pushTemplate(eqType, templates[eqType]);
}

function confirmDeleteTemplateItem(eqType, itemIndex) {
  const templates = getLocalTemplates();
  const item = (templates[eqType] || [])[itemIndex] || '';
  document.getElementById('delete-confirm-msg').textContent = `Hapus item: "${item.substring(0,60)}"?`;
  resetDeleteConfirmBtn();
  document.getElementById('delete-confirm-btn').onclick = async () => {
    templates[eqType].splice(itemIndex, 1);
    saveLocalTemplates(templates);
    applyLocalTemplates();
    closeOverlay('deleteOverlay');
    renderTemplatePage();
    toast('Item dihapus', 'info');
    _pushTemplate(eqType, templates[eqType]);
  };
  openOverlay('deleteOverlay');
}

function resetTemplateToDefault(eqType) {
  document.getElementById('delete-confirm-msg').textContent = `Reset checklist "${EQ_LABELS[eqType]}" ke default? Semua perubahan kustom akan hilang.`;
  document.getElementById('delete-confirm-btn').textContent = '↺ RESET DEFAULT';
  document.getElementById('delete-confirm-btn').onclick = () => {
    const templates = getLocalTemplates();
    templates[eqType] = [...(PM_TEMPLATES_BACKUP[eqType] || [])];
    saveLocalTemplates(templates);
    applyLocalTemplates();
    closeOverlay('deleteOverlay');
    resetDeleteConfirmBtn();
    renderTemplatePage();
    toast(`Template ${EQ_LABELS[eqType]} direset ke default`, 'info');
    _pushTemplate(eqType, templates[eqType]);   // FIX: dulu reset tidak pernah dikirim ke server
  };
  openOverlay('deleteOverlay');
}
