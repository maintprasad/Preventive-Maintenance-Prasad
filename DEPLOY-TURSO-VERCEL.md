# PM App — Deploy ke Vercel + Turso, dan Backup ke MySQL lokal

## Arsitektur

```
Browser (index.html + js/)  ──POST /api/db {action, data}──►  Vercel Function (api/db.js)  ──SQL──►  Turso
        tidak ada token & tidak ada SQL di sini                 token + semua SQL ada di sini
```

Semua SQL "tertanam" di aplikasi, di `api/db.js`. Tabel dibuat otomatis saat
pertama dipanggil (`sql/schema.sql` hanya salinan untuk referensi). SQL dan token
sengaja **tidak** ditaruh di `index.html`: siapa pun bisa membuka *View Source*,
mengambil token, lalu menghapus seluruh database.

## 1. Buat database Turso

Lewat dashboard **app.turso.tech**:

1. **Create Database**, misalnya dengan nama `pm-prasad`, region Singapore (`sin`).
2. Salin **URL**-nya (bentuknya `libsql://pm-prasad-namaorg.turso.io`).
3. **Create Token**, akses *Full*, untuk aplikasi. Simpan token ini.
4. **Create Token** lagi dengan centang **Read-only**, khusus untuk backup.

Kalau memakai CLI Turso (di Windows lewat WSL):

```bash
turso db create pm-prasad
turso db show pm-prasad --url
turso db tokens create pm-prasad                 # token aplikasi
turso db tokens create pm-prasad --read-only     # token backup
```

## 2. Deploy ke Vercel

1. Push folder ini ke GitHub, lalu di Vercel pilih **Add New → Project → Import**.
   Framework Preset: **Other**. Tidak ada build command.
   (Alternatif tanpa GitHub: jalankan `npx vercel` dari folder ini.)
2. Buka **Settings → Environment Variables** dan isi:

   | Nama | Isi |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://pm-prasad-namaorg.turso.io` |
   | `TURSO_AUTH_TOKEN` | token **Full** dari langkah 1 |
   | `APP_ACCESS_KEY` | kunci akses aplikasi, buat sendiri, minimal 12 karakter acak |
   | `ALLOWED_ORIGINS` | *(opsional)* `https://nama-app.vercel.app` |

3. **Redeploy** supaya environment variable terbaca.
4. Buka aplikasinya. Tiap perangkat akan diminta **kunci akses** sekali saja.
   Bagikan kunci itu hanya ke tim.

`.vercelignore` memastikan `tools/`, `backups/`, `gas/`, `sql/`, dan file `.md`
tidak ikut ter-upload.

## 3. Pindahkan data lama dari Google Sheets (sekali saja)

**Cara A: dari file seed (data export `pm.pdf`, sudah disiapkan)**

- `sql/seed-turso.sql` untuk Turso. Isinya 203 schedule, 233 laporan, dan 15 template.
- `sql/seed-mysql.sql` untuk MySQL/phpMyAdmin.

Isi `turso_url` dan `turso_write_token` (token yang bisa menulis) di
`tools\backup-config.php`, lalu jalankan:

```cmd
D:\Xampp\php\php.exe D:\Xampp\htdocs\PM\tools\seed-turso.php
```

Seed aman dijalankan ulang: memakai UPSERT, data yang lebih baru di Turso tidak
ditimpa, dan data yang sudah dihapus tidak muncul lagi. Setelah selesai,
kosongkan lagi `turso_write_token`.

**Cara B: langsung dari Google Sheets** (kalau Apps Script lama masih aktif)

Buka aplikasi di Vercel, lalu pilih **Template → ⇪ Migrasi data lama**. Aplikasi
akan menyalin schedule, laporan, template dari Google Sheets lama, serta data
lokal perangkat itu (termasuk tanda tangan) ke Turso. Aman dijalankan ulang dan
tidak menimbulkan duplikat. Jalankan di perangkat yang paling lengkap datanya.

## 4. Pengamanan yang terpasang

| Lapisan | Keterangan |
|---|---|
| Token rahasia | Hanya ada di Environment Variable Vercel. Tidak ada di HTML/JS/GitHub. |
| Kunci akses | `APP_ACCESS_KEY`. Request tanpa kunci ditolak dengan 401. |
| Whitelist aksi | Hanya sekitar 20 aksi yang dikenal. Tidak ada endpoint "jalankan SQL". |
| Query berparameter | Semua nilai lewat `?` sehingga kebal SQL injection (sudah diuji). |
| Validasi input | Format id, angka, tanggal, panjang teks, ukuran JSON, dan gambar TTD (PNG saja). |
| Anti-XSS | `<` `>` `"` di teks diganti `‹` `›` `″`, di server maupun di klien. |
| Cek Origin | Request dari website lain ditolak dengan 403. |
| Anti "menang selamanya" | Timestamp masa depan dipotong, dan data lama dari antrian offline tidak menimpa data baru. |
| Soft delete + audit | Data terhapus masih bisa dipulihkan (`deletedAt`), dan semua penulisan tercatat di `audit_log`. |
| Header keamanan | CSP, HSTS, dan nosniff di `vercel.json`. |

Memulihkan data yang terhapus (di Turso shell / dashboard SQL console):

```sql
SELECT id, equipment, deletedAt FROM schedules WHERE deletedAt IS NOT NULL;
UPDATE schedules SET deletedAt = NULL, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       serverAt = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 'PM-...';
```

## 5. Backup Turso → MySQL lokal (phpMyAdmin)

Persiapan, cukup sekali:

```cmd
copy D:\Xampp\htdocs\PM\tools\backup-config.example.php D:\Xampp\htdocs\PM\tools\backup-config.php
notepad D:\Xampp\htdocs\PM\tools\backup-config.php
```

Isi `turso_url` dan `turso_token` dengan token **read-only**.

**Backup ke file `.sql` saja:**

```cmd
D:\Xampp\php\php.exe D:\Xampp\htdocs\PM\tools\backup-turso.php
```

**Backup sekaligus impor ke MySQL** (nyalakan MySQL dulu di XAMPP Control Panel):

```cmd
D:\Xampp\php\php.exe D:\Xampp\htdocs\PM\tools\backup-turso.php --import
```

Hasilnya:

- File tersimpan di `D:\Xampp\htdocs\PM\backups\turso-backup-YYYYMMDD-HHMMSS.sql`
  (30 terakhir disimpan, folder ini ditutup dari browser).
- Dengan `--import`, database **`pm_backup`** langsung muncul di phpMyAdmin.

Pilihan lain: `--db=nama_db`, `--out=D:\Backup\PM`, `--keep=60`.

Mengimpor file `.sql` secara manual:

```cmd
D:\Xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS pm_backup CHARACTER SET utf8mb4"
D:\Xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 pm_backup < D:\Xampp\htdocs\PM\backups\turso-backup-20261001-170000.sql
```

Cara lain: phpMyAdmin → pilih `pm_backup` → **Import** → pilih file `.sql`.

**Backup otomatis tiap hari jam 17:00** (Task Scheduler Windows, jalankan sekali di CMD):

```cmd
schtasks /create /tn "Backup Turso PM" /sc daily /st 17:00 /tr "\"D:\Xampp\htdocs\PM\tools\backup-turso.bat\" --import"
```

Setiap backup adalah snapshot penuh: tabel di `pm_backup` di-drop lalu diisi
ulang sama persis dengan isi Turso saat itu. Snapshot lama tetap ada sebagai
file `.sql` di folder `backups`.
