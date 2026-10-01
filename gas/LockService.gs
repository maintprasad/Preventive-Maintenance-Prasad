/**
 * LockService.gs — TAMBAHAN untuk Apps Script backend PM (SHEETS_URL).
 *
 * Cara pasang:
 * 1. Buka project Apps Script yang sudah men-deploy SHEETS_URL saat ini.
 * 2. Buat file baru "LockService.gs", tempel seluruh isi file ini.
 * 3. Di fungsi doGet(e) yang sudah ada (dispatcher action), tambahkan 4 baris
 *    "else if" berikut SEBELUM baris fallback/else terakhir:
 *
 *      else if (action === 'acquireLock')   result = acquireLock(data);
 *      else if (action === 'releaseLock')   result = releaseLock(data);
 *      else if (action === 'heartbeatLock') result = heartbeatLock(data);
 *      else if (action === 'getLocks')      result = getLocks(data);
 *
 * 4. Deploy ulang (Deploy > Manage deployments > Edit > New version).
 *
 * Kalau langkah ini belum dilakukan, aplikasi front-end TETAP JALAN NORMAL
 * (lihat 05-lock.js: semua panggilan lock dibungkus try/catch dan sistem
 * mundur ke mode "tanpa lock server" secara otomatis) — hanya saja proteksi
 * dua-teknisi-mengerjakan-equipment-yang-sama tidak akan aktif lintas device.
 *
 * Sheet yang dipakai: "Locks", dibuat otomatis kalau belum ada, dengan kolom:
 * scheduleId | equipmentName | deviceId | name | acquiredAt | heartbeatAt
 */

const LOCK_SHEET_NAME = 'Locks';
const LOCK_TTL_SECONDS = 15 * 60; // samakan dengan LOCK_TTL_MS di frontend (00-config.js)

function _getLockSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(LOCK_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(LOCK_SHEET_NAME);
    sh.appendRow(['scheduleId', 'equipmentName', 'deviceId', 'name', 'acquiredAt', 'heartbeatAt']);
  }
  return sh;
}

function _lockRowExpired_(acquiredAtOrHeartbeat) {
  if (!acquiredAtOrHeartbeat) return true;
  const t = new Date(acquiredAtOrHeartbeat).getTime();
  return (Date.now() - t) / 1000 > LOCK_TTL_SECONDS;
}

function _findLockRow_(sh, scheduleId) {
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === scheduleId) return { row: i + 1, data: values[i] };
  }
  return null;
}

/** action=acquireLock  params: scheduleId, equipmentName, name, deviceId */
function acquireLock(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // cegah race condition kalau dua request masuk bersamaan
  try {
    const sh = _getLockSheet_();
    const existing = _findLockRow_(sh, data.scheduleId);
    const now = new Date().toISOString();

    if (existing) {
      const [, , deviceId, name, acquiredAt, heartbeatAt] = existing.data;
      const stillActive = !_lockRowExpired_(heartbeatAt || acquiredAt);
      if (stillActive && deviceId !== data.deviceId) {
        return { success: false, lockedBy: deviceId, lockedByName: name, acquiredAt: acquiredAt };
      }
      // kosong/basi/milik sendiri → timpa dengan lock baru
      sh.getRange(existing.row, 1, 1, 6).setValues([[data.scheduleId, data.equipmentName || '', data.deviceId, data.name || '', now, now]]);
      return { success: true };
    }

    sh.appendRow([data.scheduleId, data.equipmentName || '', data.deviceId, data.name || '', now, now]);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/** action=releaseLock  params: scheduleId, deviceId */
function releaseLock(data) {
  const sh = _getLockSheet_();
  const existing = _findLockRow_(sh, data.scheduleId);
  if (!existing) return { success: true };
  // Hanya pemilik lock (atau kalau sudah kedaluwarsa) yang boleh melepas.
  const deviceId = existing.data[2];
  const heartbeatAt = existing.data[5] || existing.data[4];
  if (deviceId === data.deviceId || _lockRowExpired_(heartbeatAt)) {
    sh.deleteRow(existing.row);
  }
  return { success: true };
}

/** action=heartbeatLock  params: scheduleId, deviceId */
function heartbeatLock(data) {
  const sh = _getLockSheet_();
  const existing = _findLockRow_(sh, data.scheduleId);
  if (!existing) return { success: false, message: 'lock tidak ditemukan' };
  if (existing.data[2] !== data.deviceId) return { success: false, message: 'bukan pemilik lock' };
  sh.getRange(existing.row, 6).setValue(new Date().toISOString());
  return { success: true };
}

/** action=getLocks — daftar semua lock yang masih aktif (dipakai untuk badge UI) */
function getLocks(data) {
  const sh = _getLockSheet_();
  const values = sh.getDataRange().getValues();
  const locks = [];
  const rowsToClean = [];
  for (let i = 1; i < values.length; i++) {
    const [scheduleId, equipmentName, deviceId, name, acquiredAt, heartbeatAt] = values[i];
    if (!scheduleId) continue;
    if (_lockRowExpired_(heartbeatAt || acquiredAt)) { rowsToClean.push(i + 1); continue; }
    locks.push({ scheduleId, equipmentName, deviceId, name, acquiredAt: acquiredAt, heartbeatAt: heartbeatAt });
  }
  // Bersihkan lock basi supaya sheet tidak menumpuk (dilakukan dari belakang agar index tidak bergeser)
  rowsToClean.reverse().forEach(r => sh.deleteRow(r));
  return { success: true, locks };
}
