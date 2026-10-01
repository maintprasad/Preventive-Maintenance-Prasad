# PM App v3.0 — Modularisasi, Perbaikan Bug, & Multi-User Safety

## 1. Struktur baru (dulu 1 file HTML raksasa)

```
pm-app/
├─ index.html                  # struktur halaman + urutan <script> saja
├─ css/style.css                # semua CSS (dulu inline <style>)
├─ js/
│  ├─ 00-config.js              # SHEETS_URL, STORE keys, PM_TEMPLATES, dsb
│  ├─ 01-utils.js               # genId, toast, getWeekOfMonth, debounce
│  ├─ 02-store.js               # localStorage layer + mergeById (baru)
│  ├─ 03-api.js                 # fetch ke GAS + antrian offline (queue)
│  ├─ 04-sync.js                # auto-sync AMAN untuk multi-user (baru)
│  ├─ 05-lock.js                # lock per-equipment (baru)
│  ├─ 06-nav.js                 # showPage, sidebar, back-button
│  ├─ 07-dashboard.js           # status schedule + dashboard KPI/chart
│  ├─ 08-inputpm.js             # halaman "Input PM" (tugas minggu ini)
│  ├─ 09-schedule.js            # tree Schedule PM + CRUD
│  ├─ 10-calendar.js            # Calendar View (gantt mingguan)
│  ├─ 11-form-pm.js             # form laporan PM, submit/edit/eksekusi
│  ├─ 12-reports.js             # Daftar Laporan + Resume
│  ├─ 13-outstanding-takeover.js
│  ├─ 14-templates.js           # kelola checklist per equipment type
│  ├─ 15-signature.js           # tanda tangan digital
│  ├─ 16-pdf-report.js          # PDF 1 laporan, print semua, print resume
│  ├─ 17-pdf-schedule.js        # PDF jadwal tahunan + report ketercapaian
│  ├─ 18-excel.js               # export Excel ketercapaian PM
│  ├─ 19-wo.js                  # Work Order dari anomali PM
│  └─ 20-main.js                # bootstrap (window.load)
└─ gas/LockService.gs           # tambahan backend untuk sistem lock
```

Setiap file punya satu tanggung jawab jelas — gampang dicari, gampang di-diff,
gampang di-review per bagian tanpa harus scroll satu file 6000 baris.

## 2. Bug yang diperbaiki

| # | Bug lama | Perbaikan |
|---|----------|-----------|
| 1 | `_buildReportIndex()` didefinisikan **dua kali** — definisi kedua diam-diam menimpa yang pertama | Sekarang hanya satu definisi bersih di `02-store.js` |
| 2 | `_getQueueCount()` didefinisikan dua kali (di awal script & dekat `submitPM`) | Satu definisi di `03-api.js` |
| 3 | `onCalUnitChange()` dan `clearCalFilters()` didefinisikan **dua kali** (identik) | Satu definisi di `10-calendar.js` |
| 4 | `collectPMData()` — object literal punya key `week` dan `month` **dua kali** (eksplisit + shorthand), tanda sisa refactor yang tidak dibersihkan | Dirapikan jadi satu kali masing-masing |
| 5 | Kode mati (dead code) besar tidak pernah dipanggil tapi tetap dieksekusi tiap render: `renderTugasList`, `onTugasUnitChange`, `resetTugasFilter`, `populateTugasUnitFilter`, `renderWeekTarget`, `renderEqTree`, `toggleTree` (elemen HTML-nya sudah `display:none`/dihapus) | Dihapus seluruhnya — mengurangi ukuran & risiko bug tersembunyi |
| 6 | `saveSchedule()` / `deleteSchedule()` / dll: kalau `api()` gagal, perubahan **hilang begitu saja** (hanya log warning) | Sekarang otomatis masuk `enqueueSync()` dengan `recordId`, ikut di-retry oleh antrian |
| 7 | `syncFromSheets()` **selalu overwrite total** `STORE.REPORTS`/`STORE.SCHEDULES` dari server, walau sedang ada input aktif | Diganti mekanisme merge per-record (lihat §3) |
| 8 | Tidak ada apa pun yang mencegah dua teknisi mengeksekusi PM equipment yang sama secara bersamaan | Sistem lock per-equipment (lihat §4) |
| 9 | `updateScheduleLastDone` tidak menandai `updatedAt` sehingga merge/sync tidak bisa membandingkan mana yang lebih baru | Ditambahkan `updatedAt` di semua mutasi `schedules`/`reports` |

## 3. Auto-sync yang aman untuk banyak pengguna (`04-sync.js`)

- **Auto-sync saat dibuka** (`startAutoSync()` di `20-main.js`), lalu polling
  tiap 45 detik, dan sync ulang saat tab kembali aktif (`visibilitychange`).
- **Tidak lagi overwrite total.** `mergeById()` (di `02-store.js`)
  menggabungkan data lokal dan data server **per record**, berdasarkan
  `updatedAt`/`submittedAt` — record yang lebih baru yang menang, bukan
  "yang terakhir sync menang".
- **Record yang masih di antrian upload lokal tidak pernah ditimpa** oleh
  hasil pull server sampai record itu berhasil terkirim
  (`getPendingRecordIds()` dicek di setiap merge).
- **Ditunda otomatis saat berbahaya**: kalau user sedang mengetik laporan PM
  (`isReportFormDirty()`) atau ada modal terbuka (`anyOverlayOpen()`), siklus
  auto-sync itu dilewati dan dicoba lagi di siklus berikutnya — supaya form
  yang sedang diisi tidak tiba-tiba berubah/ke-reset. Sync manual (tombol
  ↻ Sync) tetap selalu jalan.

## 4. Antrian & kunci "sedang dikerjakan" (mencegah tertimpa/duplikat)

**Antrian (queue) — `03-api.js`:**
Semua tulis-ke-server yang gagal (schedule, report, dsb) otomatis masuk
`STORE_QUEUE`, diproses **FIFO** (bukan paralel) supaya urutan submit dari
device yang sama tidak saling salip, dengan retry sampai 3x dan indikator
jumlah item pending di badge sync.

**Lock per-equipment — `05-lock.js` + `gas/LockService.gs`:**
Begitu seorang teknisi menekan **"▶ Eksekusi"** pada suatu jadwal PM,
aplikasi meminta lock ke server (Apps Script, sheet "Locks"). Selama lock
ini aktif:
- Equipment tersebut muncul dengan badge **🔒 Dikerjakan** di Schedule PM,
  Input PM, Outstanding, dan Takeover, tombol Eksekusi-nya nonaktif untuk
  device lain.
- Teknisi pemegang lock dikirim *heartbeat* tiap 1 menit supaya lock tidak
  kedaluwarsa selagi masih bekerja di lapangan (TTL 15 menit tanpa heartbeat
  → otomatis lepas, jadi tidak ada equipment "terkunci selamanya" kalau
  koneksi putus).
- Lock dilepas otomatis saat: laporan disubmit, form dibatalkan/direset,
  atau tab ditutup (`beforeunload` + `sendBeacon`, best-effort).
- **Degradasi aman**: kalau backend belum di-upgrade dengan
  `gas/LockService.gs`, semua panggilan lock dibungkus try/catch dan sistem
  tetap berjalan normal tanpa proteksi lintas-device (hanya sekali
  menampilkan info bahwa mode lock-server belum aktif).

Dengan dua mekanisme ini: **laporan tidak akan saling menimpa** (merge
per-record + antrian FIFO) dan **dua orang tidak akan mengerjakan PM yang
sama secara bersamaan** (lock).

## 5. Jembatan WO ⇄ PM (`js/19-wo.js`) — ditulis ulang total

### 5.1 Bug yang dieliminasi

| # | Bug | Akibat di lapangan | Perbaikan |
|---|-----|--------------------|-----------|
| 1 | **WO yatim**: `pmId` diambil dari `pm-edit-id`, yang **selalu kosong** saat teknisi mengerjakan PM baru (belum disubmit) | WO tidak pernah tertaut ke laporan → badge "WO ✓" tidak muncul, dan WO kedua bisa dibuat untuk anomali yang sama | Sesi form (`formSessionId`) + `linkPendingWOToReport()` yang dipanggil `submitPM()` — WO otomatis tertaut ke id laporan begitu laporan tersimpan |
| 2 | **WO kembar** saat tombol simpan diklik dua kali / modal dibuka ulang | Dua WO identik masuk database WO | Kunci `_woSaving`, tombol di-disable saat proses, plus pengecekan bentrok terakhir tepat sebelum menulis |
| 3 | **Konteks basi**: penjagaan "sudah ada WO" hanya menutup modal, tapi `window._woPMContext` lama tetap hidup | Penyimpanan berikutnya memakai konteks lama → WO kembar (ini yang tertangkap test T4) | Konteks dikosongkan di setiap jalur penjagaan + dicek ulang di `simpanWOdariPM()` |
| 4 | **Payload lewat URL GET**: seluruh deskripsi + anomali dikirim di query string | Checklist panjang → URL >2000 karakter → request gagal diam-diam, WO hilang | `woApi()` memilih transport otomatis: GET untuk payload kecil, POST `text/plain` untuk payload besar (`gas/WOEndpoint.gs`) |
| 5 | **Tidak ada antrian retry**: WO gagal sync hanya jadi toast, selamanya lokal | WO hilang dari database WO tanpa disadari | Antrian `STORE_WO_QUEUE` dengan retry FIFO ×5, auto-flush saat app dibuka & saat `online`, plus tombol "Kirim Antrian" manual |
| 6 | **XSS / layout rusak**: `uraian` & `keterangan` dimasukkan lewat `innerHTML` tanpa escape | Teknisi mengetik `<`, `"`, atau `&` → tampilan anomali rusak | `escapeHtml()` di semua titik render WO |
| 7 | `getWO()`/`setWO()` memakai `localStorage` langsung tanpa fallback `_mem` | Di mode privat/browser terkunci, WO gagal simpan **tanpa pesan apa pun** | `_woRead`/`_woWrite` memakai fallback yang sama dengan store PM, dan melaporkan kegagalan ke pengguna |
| 8 | `anomaliItems` dari server berupa string JSON tidak pernah di-parse | `.length`/`.map` error saat WO dibaca balik dari Sheets | `_sanitizeWO()` menormalkan array & status |
| 9 | `renderReportList()` dipanggil setelah simpan WO | Pengguna di halaman 3 terlempar balik ke halaman 1 | Diganti `renderReportPage()` (pagination dipertahankan) |
| 10 | Badge "WO ✓" hanya boolean | Tidak tahu WO-nya masih open atau sudah selesai | Badge status nyata: `WO · Open` / `Dikerjakan` / `Closed`, plus `⏳` bila belum tersync |
| 11 | Tombol WO jadi mati (disabled) ketika WO sudah ada | Tidak ada cara melihat WO yang sudah dibuat | Berubah fungsi jadi **"🔎 Lihat WO"** yang membuka daftar WO terfilter laporan itu |
| 12 | Bar anomali & progress checklist **tidak muncul** saat membuka laporan lama untuk diedit | Teknisi mengira laporan tidak punya anomali | `editReport()` sekarang memanggil `_updateChecklistProgress()` + `_updateWOBar()` |
| 13 | Bar anomali tidak dibersihkan saat form direset | Sisa WO dari PM sebelumnya membuat tombol tetap terkunci untuk PM berikutnya | `clearPMForm()` menyembunyikan bar & memulai sesi form baru |
| 14 | Tidak ada validasi equipment kosong | WO tanpa identitas alat | Ditolak dengan pesan jelas |

### 5.2 Fitur baru

- **Manajer WO** (tombol "⚠ Daftar WO" di Daftar Laporan): lihat semua WO
  hasil PM, cari, filter status, buka detail anomali, kirim ulang yang gagal
  sync, dan hapus tautan lokal.
- **Sinkron status dua arah**: `refreshWOStatuses()` menarik status terbaru
  dari aplikasi WO (open → dikerjakan → closed) dan menampilkannya di kartu
  laporan PM. Field `status` & `assignee` dimiliki aplikasi WO — `saveWO()`
  di backend sengaja **tidak menimpanya** dengan nilai lama dari PM.
- **`saveWO` idempoten** di backend: retry mengirim WO yang sama tidak
  membuat baris kembar (dikunci `LockService`).
- **Indikator antrian** di header Daftar Laporan bila ada WO belum terkirim.

### 5.3 Hasil pengujian

`node test-wo.js` menjalankan 26 skenario terhadap kode asli (bukan salinan):
pengumpulan anomali, escaping XSS, simpan saat offline, antrian & dedupe-nya,
pencegahan WO ganda (3 jalur berbeda), penautan otomatis ke laporan,
pemilihan transport GET/POST, normalisasi data dari Sheets, dan pembersihan
antrian saat WO dihapus. **26/26 lulus.** Dua di antaranya (T4 dan T9) awalnya
gagal dan berhasil membongkar bug konteks-basi yang tidak terlihat saat
membaca kode.

## 6. Yang perlu dilakukan untuk deploy

1. Upload folder `pm-app/` (isi `index.html`, `css/`, `js/`) ke hosting statis
   Anda (Google Sites embed, GitHub Pages, atau Web App Apps Script lain).
2. Taruh logo perusahaan di `pm-app/assets/logo.png` (index.html sudah
   mereferensikan path ini; kalau file tidak ada, logo otomatis disembunyikan
   tanpa error, tidak seperti base64 raksasa yang lama membuat 1 file HTML
   sangat berat).
3. **Wajib untuk fitur lock**: tempelkan isi `gas/LockService.gs` ke project
   Apps Script yang sama dengan `SHEETS_URL` yang sudah ada, tambahkan 4 baris
   dispatcher seperti dijelaskan di komentar file tsb, lalu deploy ulang.
   Tanpa langkah ini app tetap jalan, hanya proteksi lock lintas-device
   belum aktif.
4. **Disarankan untuk fitur WO**: tempelkan `gas/WOEndpoint.gs` ke project
   Apps Script `WO_URL`. Ini memberi tiga hal: dukungan `doPost` (WO dengan
   checklist panjang), `saveWO` yang idempoten (retry tidak bikin baris
   kembar), dan `getWOs` (status WO tampil di PM). Tanpa ini app tetap jalan:
   WO tersimpan lokal, dicoba lewat GET, dan bisa dikirim ulang manual dari
   modal "Daftar WO".
5. `SHEETS_URL` dan `WO_URL` di `js/00-config.js` — ganti sesuai deployment
   Anda kalau berbeda dari sebelumnya (saat ini disalin apa adanya dari versi
   lama).
6. `test-wo.js` adalah berkas pengujian, tidak dipakai aplikasi. Boleh
   dihapus dari server produksi, tapi berguna untuk dijalankan ulang
   (`node test-wo.js`) setiap kali modul WO diubah.
