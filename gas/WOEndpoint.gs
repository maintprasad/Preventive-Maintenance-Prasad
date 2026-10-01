/**
 * WOEndpoint.gs — TAMBAHAN untuk Apps Script backend WORK ORDER (WO_URL).
 *
 * Tujuan:
 *  1. doPost()  → menerima payload WO besar (checklist panjang) yang tidak
 *                 muat di query string GET. Frontend otomatis memilih POST
 *                 bila URL GET akan melebihi ~1800 karakter (lihat woApi()
 *                 di js/19-wo.js).
 *  2. saveWO()  → IDEMPOTEN: menyimpan berdasarkan id. Kalau id sudah ada,
 *                 barisnya di-update, bukan ditambah lagi. Ini yang membuat
 *                 antrian retry aman — WO yang sama dikirim dua kali tidak
 *                 menghasilkan dua baris kembar.
 *  3. getWOs()  → mengembalikan WO (opsional difilter sumber = 'PM') supaya
 *                 aplikasi PM bisa menampilkan status terbaru (open /
 *                 in_progress / closed) di kartu laporan.
 *
 * Cara pasang:
 *  1. Buka project Apps Script yang men-deploy WO_URL.
 *  2. Buat file "WOEndpoint.gs", tempel isi file ini.
 *  3. Kalau project sudah punya doGet(e), JANGAN duplikat — cukup tambahkan
 *     dispatch untuk 'getWOs' di sana, dan pastikan doPost di bawah ini ada.
 *     Kalau belum punya doPost sama sekali, file ini sudah menyediakannya.
 *  4. Deploy ulang: Deploy > Manage deployments > Edit > New version.
 *     Pastikan "Who has access" = Anyone.
 *
 * Degradasi aman: tanpa file ini aplikasi PM tetap berfungsi —
 *  - WO tetap tersimpan lokal dan tetap dicoba lewat GET;
 *  - kalau gagal, WO masuk antrian dan bisa dikirim ulang manual dari
 *    modal "Daftar WO";
 *  - status WO hanya tidak bisa ditarik otomatis (badge memakai status lokal).
 */

const WO_SHEET_NAME = 'WorkOrders';
const WO_HEADERS = [
  'id','sumber','pmId','tanggal','equipment','tagNo','unit','area','unitArea',
  'teknisiPM','deskripsi','prioritas','assignee','status','jumlahAnomali',
  'anomaliItems','materialRequests','createdAt','updatedAt','createdBy','closedAt'
];

function _woSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(WO_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(WO_SHEET_NAME);
    sh.appendRow(WO_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function _woJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Dispatcher bersama untuk GET & POST. */
function _woHandle_(data) {
  const action = data.action;
  if (action === 'saveWO')      return saveWO(data);
  if (action === 'getWOs')      return getWOs(data);
  if (action === 'updateWOStatus') return updateWOStatus(data);
  if (action === 'ping')        return { success: true, ts: new Date().toISOString() };
  return { success: false, message: 'Unknown action: ' + action };
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return _woJson_(_woHandle_(data));
  } catch (err) {
    return _woJson_({ success: false, message: String(err) });
  }
}

/* Kalau project WO BELUM punya doGet, aktifkan blok di bawah ini dengan
   menghapus tanda komentarnya. Kalau SUDAH punya doGet, biarkan tetap
   dikomentari dan cukup tambahkan `_woHandle_(data)` ke dispatcher yang ada.

function doGet(e) {
  try {
    const data = JSON.parse((e.parameter && e.parameter.data) || '{}');
    return _woJson_(_woHandle_(data));
  } catch (err) {
    return _woJson_({ success: false, message: String(err) });
  }
}
*/

function _woRowFromObj_(wo) {
  return WO_HEADERS.map(h => wo[h] !== undefined && wo[h] !== null ? wo[h] : '');
}

/** saveWO — idempoten berdasarkan id (create atau update). */
function saveWO(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);   // cegah dua request bersamaan membuat baris kembar
  try {
    const wo = data.wo || {};
    if (!wo.id) return { success: false, message: 'WO tanpa id ditolak' };

    const sh = _woSheet_();
    const values = sh.getDataRange().getValues();
    const idCol = WO_HEADERS.indexOf('id');

    for (let i = 1; i < values.length; i++) {
      if (values[i][idCol] === wo.id) {
        // Update — tapi JANGAN timpa status/assignee yang sudah diubah di
        // aplikasi WO dengan nilai lama dari PM (PM bukan pemilik field itu).
        const existing = {};
        WO_HEADERS.forEach((h, c) => existing[h] = values[i][c]);
        const merged = Object.assign({}, existing, wo, {
          status:    existing.status   || wo.status || 'open',
          assignee:  existing.assignee || wo.assignee || '',
          updatedAt: new Date().toISOString()
        });
        sh.getRange(i + 1, 1, 1, WO_HEADERS.length).setValues([_woRowFromObj_(merged)]);
        return { success: true, mode: 'updated', id: wo.id };
      }
    }

    wo.status    = wo.status || 'open';
    wo.createdAt = wo.createdAt || new Date().toISOString();
    wo.updatedAt = new Date().toISOString();
    sh.appendRow(_woRowFromObj_(wo));
    return { success: true, mode: 'created', id: wo.id };
  } catch (err) {
    return { success: false, message: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/** getWOs — daftar WO, opsional difilter sumber ('PM') dan/atau pmId. */
function getWOs(data) {
  try {
    const sh = _woSheet_();
    const values = sh.getDataRange().getValues();
    if (values.length < 2) return { success: true, wos: [] };

    const headers = values[0];
    const wos = [];
    for (let i = 1; i < values.length; i++) {
      const o = {};
      headers.forEach((h, c) => o[h] = values[i][c]);
      if (!o.id) continue;
      if (data.sumber && o.sumber !== data.sumber) continue;
      if (data.pmId   && o.pmId   !== data.pmId)   continue;
      // Tanggal dari Sheets bisa berupa objek Date — normalkan ke ISO string
      ['tanggal','createdAt','updatedAt','closedAt'].forEach(k => {
        if (o[k] instanceof Date) o[k] = o[k].toISOString();
      });
      wos.push(o);
    }
    return { success: true, wos: wos };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

/** updateWOStatus — dipakai aplikasi WO (atau tools lain) untuk menutup WO. */
function updateWOStatus(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = _woSheet_();
    const values = sh.getDataRange().getValues();
    const idCol     = WO_HEADERS.indexOf('id');
    const statusCol = WO_HEADERS.indexOf('status');
    const assigCol  = WO_HEADERS.indexOf('assignee');
    const updCol    = WO_HEADERS.indexOf('updatedAt');
    const closeCol  = WO_HEADERS.indexOf('closedAt');

    for (let i = 1; i < values.length; i++) {
      if (values[i][idCol] === data.id) {
        if (data.status)   sh.getRange(i + 1, statusCol + 1).setValue(data.status);
        if (data.assignee) sh.getRange(i + 1, assigCol + 1).setValue(data.assignee);
        sh.getRange(i + 1, updCol + 1).setValue(new Date().toISOString());
        if (data.status === 'closed' || data.status === 'done') {
          sh.getRange(i + 1, closeCol + 1).setValue(new Date().toISOString());
        }
        return { success: true };
      }
    }
    return { success: false, message: 'WO tidak ditemukan: ' + data.id };
  } finally {
    lock.releaseLock();
  }
}
