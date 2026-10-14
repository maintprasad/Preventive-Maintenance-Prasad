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

---

# Rilis Oktober 2026 — Modal per Unit/Area, Master Data, PM Cold Storage, RCA

## 7. Perubahan

| # | Perubahan | Berkas |
|---|---|---|
| 1 | Modal **Download PDF Schedule**: pilih Unit dan Area (jumlah equipment tampil) | `index.html`, `js/17-pdf-schedule.js` |
| 2 | Modal baru **Report Ketercapaian** (PDF/Excel): pilih Unit, Area, Format. Laporan memuat rincian per area di bawah tiap unit | `js/17-pdf-schedule.js`, `js/18-excel.js` |
| 3 | **Kelola Data Master** (tombol "⚙ Kelola Master" di Schedule): tambah Unit, Area di dalam Unit, Equipment (membuka form schedule yang sudah terisi), serta Tipe Equipment baru beserta checklist-nya. Unit/Area kosong tetap muncul di semua pilihan | `js/21-master.js`, `index.html`, `js/09-schedule.js` |
| 4 | Tipe equipment dinamis: semua dropdown (form PM, schedule, template, filter) dibangun dari `EQ_LABELS`; tipe lama di database tanpa label (mis. `pipe_gas`) kini muncul | `js/21-master.js`, `js/14-templates.js` |
| 5 | Tipe **Cold Storage** dengan **10 item checklist** PM *(kemudian diganti 12 item — lihat bagian 12)* (suhu/RH, evaporator, defrost, kondensor, kompresor, refrigeran, pintu & gasket, insulasi, kelistrikan/kontrol, alarm & pengaman). Periode: Quarterly (3 bulanan) | `js/00-config.js` |
| 6 | **RCA** (temuan, akar penyebab, tindakan perbaikan, pencegahan) per item anomali: kotak muncul saat item ditandai "Tidak", tersimpan di `aktivitas[i].rca`, tampil di PDF, dan akar penyebab ikut ke deskripsi WO. Submit dengan RCA belum lengkap meminta konfirmasi | `js/11-form-pm.js`, `js/16-pdf-report.js`, `js/19-wo.js` |
| 7 | Pesan sync yang jelas bila `/api/db` tidak ditemukan (mis. dibuka lewat XAMPP) | `js/04-sync.js` |
| 8 | Backend: tabel `master`, aksi `getMaster` / `saveMaster` (digabung union di server), dan `master` di `bulkUpsert` | `api/db.js`, `sql/schema.sql` |
| 9 | Data PM Cold Storage Unit 2: CS1–CS4 (Quarterly), 19 mesin, 19 laporan Aynur Jun–Sep 2026 lengkap 12 checklist (lihat bagian 12), anomali dengan RCA | `tools/seed-coldstorage.js` |
| 10 | Uji integrasi API (SQLite in-memory sebagai pengganti Turso) | `tools/test-api.js` |

## 8. Langkah rilis produksi

1. **Push ke `main`** — Vercel deploy otomatis. Tabel `master` dibuat sendiri oleh `api/db.js`
   (`CREATE TABLE IF NOT EXISTS`) saat request pertama; tidak ada migrasi manual dan tidak ada
   perubahan pada tabel yang sudah ada.
2. **Muat data Cold Storage** (sekali, aman diulang) dari komputer yang punya Node 18+:
   ```
   node tools/seed-coldstorage.js                       # dry-run: hanya validasi
   set PM_URL=https://<alamat-vercel>  &  set PM_APP_KEY=<APP_ACCESS_KEY>
   node tools/seed-coldstorage.js --send
   ```
3. Di aplikasi klik **↻ Sync** — Unit 2 → Cold Storage muncul beserta 3 jadwal dan 4 laporan.
4. Uji sebelum rilis: `node tools/test-api.js` (butuh Node 22+ karena memakai `node:sqlite`).

## 9. Catatan data seed Cold Storage

- Mengikuti data yang sudah ada di database: **Cold Storage <n> Mesin <m>** dengan tag aslinya —
  CS1 5 mesin (TAG-449..453), CS2 5 mesin (TAG-454..458), CS3 4 mesin (TAG-459..462),
  CS4 5 mesin (TAG-463..467) — total **19 mesin**.
- Jadwal mesin yang sudah ada **diperbarui di tempat** (id dan field lain dipertahankan): tipe jadi
  `cold_storage`, periode **Annual → Quarterly**, bulan start CS1 Juni, CS2 Juli, CS3 Agustus,
  CS4 September (berikutnya +3 bulan). Panel MCC/Antiroom tidak disentuh. Salinan jadwal sebelum
  diubah: `backups/cs-schedules-before-quarterly.json` (tidak di-commit).
- 19 laporan PM oleh Aynur, 12 checklist per mesin, kolom keterangan dikosongkan; 7 anomali dilengkapi RCA. Laporan PM kompresor
  tahunan CS1 Mesin 1–3 (14 Juli) tetap ada.
- Isi laporan (angka pengukuran, temuan, dan RCA) adalah data contoh untuk pengisian awal, bukan
  hasil pengukuran lapangan. Koreksi lewat **Daftar Laporan → ✏ Edit** bila perlu.

---

# Rilis Oktober 2026 (2) — Menu Pengaturan, PWA, tampilan Android & iOS

## 10. Perubahan

| # | Perubahan | Berkas |
|---|---|---|
| 1 | Menu sidebar **Pengaturan** → halaman **Unit, Area & Equipment**: tambah Unit, Area, Equipment, Tipe Equipment + checklist, dan **tambah item checklist** ke tipe yang ada (modal "Kelola Master" dihapus; tombolnya di Schedule/Template dipindah ke sini). Juga ada di menu More (HP) | `index.html`, `js/21-master.js`, `js/06-nav.js` |
| 2 | **PWA**: `manifest.webmanifest` (ikon any + maskable, shortcut Input PM / Outstanding / Schedule), service worker `sw.js` (offline, network-first untuk aplikasi, cache-first untuk CDN, `/api` tidak pernah di-cache), ikon aplikasi di `icons/` | `manifest.webmanifest`, `sw.js`, `icons/`, `js/22-pwa.js` |
| 3 | Pasang ke layar utama: tombol/bar **Pasang** (Android/desktop), petunjuk **Tambah ke Layar Utama** (iOS), bar **Perbarui** saat versi baru (tidak memuat ulang paksa), banner **Offline**, kartu "Aplikasi" di Pengaturan (status, versi, periksa pembaruan, hapus cache) | `js/22-pwa.js`, `index.html` |
| 4 | Tampilan HP: safe-area (notch/status bar iOS, gesture bar), `100dvh`, modal sebagai bottom sheet, **checklist PM jadi kartu per item** (OK/Tidak besar, seluruh sel bisa diketuk), top bar ringkas, tombol header tidak terpotong, sidebar tertutup tidak lagi membocorkan bayangan | `css/style.css`, `js/11-form-pm.js` |
| 5 | Viewport tidak lagi mengunci zoom; kunci zoom JS (yang menelan ketukan cepat berurutan) dihapus | `index.html`, `js/06-nav.js` |
| 6 | `vercel.json`: `connect-src` untuk CDN (dipakai service worker), `worker-src`, `manifest-src`, header `sw.js` (no-cache) dan manifest | `vercel.json` |
| 7 | Logo di top bar memakai ikon baru (`assets/logo.png` memang tidak ada di repo); PDF schedule menyembunyikan logo yang gagal dimuat | `index.html`, `js/17-pdf-schedule.js` |

## 11. Catatan rilis PWA

- **HTTPS wajib** untuk service worker & pemasangan (Vercel sudah HTTPS; `localhost` juga boleh untuk uji).
- **Naikkan `VERSION` di `sw.js`** (dan `js/22-pwa.js` bila perlu) setiap kali daftar berkas aplikasi berubah
  (menambah/menghapus `js/*.js`, ikon, dsb.), supaya cache lama dibersihkan. Perubahan isi berkas biasa
  tidak perlu: aplikasi memakai network-first sehingga selalu mengambil versi terbaru saat online.
- Data laporan/jadwal disimpan di `localStorage` (bukan di cache service worker), jadi "Hapus Cache Offline"
  tidak menghapus data. Antrian sync tetap terkirim otomatis saat kembali online.
- iOS: tidak ada prompt resmi — pengguna memasang lewat Bagikan → Tambah ke Layar Utama. Notifikasi push tidak dipakai.

---

# Revisi checklist Cold Storage — 12 item

## 12. Perubahan

- Checklist **Cold Storage** diganti menjadi **12 item**: nomor 1–3 tetap (suhu & RH, evaporator, defrost); item
  kondensor lama dihapus karena sama dengan kondensor baru; lalu 9 item baru: kondensor, kompresor, kebocoran oli &
  refrigeran, sistem refrigeran, pintu, panel insulasi & lantai, panel listrik & kontrol (setpoint 12°C), alarm &
  pengaman, evaluasi kestabilan suhu & RH (target < 40%). Sumber: `PM_TEMPLATES.cold_storage` di `js/00-config.js`.
- Data PM Cold Storage CS1–CS4 (19 laporan): checklist 12 item, **kolom keterangan dikosongkan**. Nomor item anomali
  disesuaikan (pintu = 8, kondensor = 4, panel listrik = 10, kebocoran refrigeran = 6) dan teks RCA diselaraskan
  dengan setpoint 12°C.
- **Turso**: template `cold_storage` dan 19 laporan diperbarui lewat `node tools/seed-coldstorage.js --send`.
  Laporan yang sudah tersinkron di perangkat lain otomatis ditimpa versi baru saat sync (updatedAt lebih baru).

---

# Perbaikan: UI HP tidak bisa di-scroll (freeze)

## 13. Penyebab & perbaikan

- **Gejala:** di Android dan iOS halaman terasa freeze — tidak bisa di-scroll naik/turun.
- **Penyebab:** aturan `body{overscroll-behavior-y:none}` (ditambahkan di rilis PWA). Karena `html` dan `body` sama-sama
  `overflow-x:hidden`, `body` ikut menjadi scroll container; nilai `none` di sana memutus gestur scroll ke halaman.
- **Perbaikan:** `overscroll-behavior-y:none` dipindah ke `html` (root), aturan di `body` dihapus, dan `body` memakai
  `overflow-x:clip` sehingga tidak lagi menjadi scroll container. Diuji dengan event sentuh nyata (bukan scroll lewat JS):
  Dashboard, Daftar Laporan, Pengaturan, Input PM, isi modal, dan sidebar bisa di-scroll; tidak ada overflow horizontal.
- `sw.js` VERSION dinaikkan ke `pm-3.1.1` agar perangkat yang sudah memasang aplikasi mengambil CSS baru.
- `tools/check-css.js` — penjaga regresi (gagal bila `overscroll-behavior` kembali dipasang di `body`).

---

# Cetak laporan PM: tidak ada bagian yang terpotong

## 14. Perubahan

- **Masalah:** saat dicetak, tabel Pengesahan (beserta tanda tangan digital) bisa terbelah di antara dua halaman sehingga
  sebagian terpotong; laporan 12 item juga memakai dua halaman.
- **Perbaikan** (`js/16-pdf-report.js`): aturan `break-inside: avoid` untuk setiap baris tabel, setiap item checklist beserta
  RCA-nya (satu `<tbody class="it">`), dan blok kecil (PPE, Spare Parts, Catatan, Pengesahan + footer) yang dibungkus
  `.blk`; judul seksi tidak ditinggal sendirian di akhir halaman. Saat dicetak tata letak sedikit dipadatkan (margin,
  padding baris, tinggi tanda tangan) sehingga laporan 12 item (termasuk yang punya satu RCA) muat **satu halaman A4**.
  Laporan dengan banyak RCA tetap memakai dua halaman, tetapi pemisahnya bersih (tidak ada yang terpotong).
- Fungsi baru `buildPMBatchHTML(list, sigs, title)` — menggabungkan banyak laporan menjadi satu dokumen cetak (tiap laporan
  mulai di halaman baru); dipakai oleh "Print Semua" di Daftar Laporan.

---

# CS4 Mesin 5: laporan dibersihkan

- Laporan `PM-CS-202609-CS4M1` (di aplikasi bernama "Cold Storage 4 Mesin 5", TAG-463): RCA dihapus, seluruh 12 item **YES**,
  catatan diubah menjadi "Tidak ada temuan, semua checklist OK." (Turso diperbarui lewat `saveReport`; tanda tangan tidak berubah).
  Spare part (bearing & grease) belum diubah.
- `tools/seed-coldstorage.js` diselaraskan (tanpa temuan untuk CS4 Mesin 1) → total RCA data seed menjadi 6; ditambah peringatan
  bahwa `--send` menimpa laporan dengan id yang sama.

---

# Tanpa laporan ganda

- Laporan seed `PM-CS-202609-CS4M5` (TAG-467, belum ditandatangani) dihapus (soft delete, bisa dipulihkan) karena namanya sama dengan
  laporan "Cold Storage 4 Mesin 5" (`PM-CS-202609-CS4M1`, TAG-463) yang sudah ditandatangani. Kini hanya ada satu laporan "Mesin 5".
- `tools/seed-coldstorage.js --send` sekarang **menolak berjalan** bila laporan seed (`PM-CS-*`) sudah ada di database
  (mencegah laporan ganda dan data yang sudah diedit/ditandatangani tertimpa). Gunakan `--force` hanya bila memang ingin menimpa.
  Dicakup oleh `tools/test-api.js`.
