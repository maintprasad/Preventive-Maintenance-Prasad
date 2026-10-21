# Server foto — penerima foto equipment untuk aplikasi PM

Foto PM **tidak** disimpan di Vercel/Turso. Aplikasi mengirim foto ke server Anda sendiri; yang masuk ke database
hanya **URL**-nya. Folder ini adalah penerimanya (PHP). **Fitur foto di aplikasi saat ini NONAKTIF** sampai langkah 4 dikerjakan.

## Jalur yang disiapkan

| Apa | Contoh jalur | Diisi di |
|---|---|---|
| Alamat upload (POST) | `https://foto.domain-anda.com/pm-foto/upload.php` | `PHOTO_CONFIG.uploadUrl` di `js/00-config.js` |
| Alamat publik foto | `https://foto.domain-anda.com/pm-foto/files/` | `PHOTO_CONFIG.publicBaseUrl` di `js/00-config.js` |
| Folder penyimpanan di server | `.../pm-foto/files/YYYY/MM/TAG_acak.jpg` | `files_dir` di `upload.php` |

Alamat di atas masih **placeholder** (`domain-anda.com`); aplikasi menolak mengaktifkan fitur selama placeholder itu belum diganti.

## Langkah mengaktifkan

1. **Salin folder ini** (`upload.php`, `files/.htaccess`) ke server Anda, mis. `/var/www/html/pm-foto/` atau `D:\Xampp\htdocs\pm-foto\`.
   Pastikan folder `files/` bisa ditulis web server dan `.htaccess`-nya terbaca (`AllowOverride All`) — isinya melarang eksekusi skrip.
   Server selain Apache (Nginx): pastikan `files/` hanya melayani gambar dan **tidak** meneruskan `.php` ke PHP.
2. **Konfigurasi `upload.php`** (edit `$DEFAULTS`, atau buat `config.php` di sebelahnya yang `return [...]`, atau environment variable):
   - `allowed_origins` → alamat aplikasi PM (mis. `https://preventive-maintenance-prasad.vercel.app`; tambah `http://localhost` bila menguji lokal)
   - `public_base_url` → sama dengan `publicBaseUrl` di aplikasi
   - `upload_token` → rahasia opsional, samakan dengan `PHOTO_CONFIG.token`
   - PHP 8.0+, ekstensi **fileinfo** (wajib) dan **GD** (disarankan: encode ulang foto & buang EXIF; tanpa GD hanya JPEG yang diterima apa adanya).
     Di XAMPP: hapus tanda `;` pada `;extension=gd` di `php.ini`, lalu restart Apache.
3. **Izinkan domain server foto di aplikasi.** Tambahkan ke CSP di `vercel.json` (header `Content-Security-Policy`):
   `img-src` … `https://foto.domain-anda.com` dan `connect-src` … `https://foto.domain-anda.com`. Tanpa ini browser memblokir tampilan/unggahan foto.
4. **Aktifkan** di `js/00-config.js`: isi `uploadUrl`, `publicBaseUrl`, `token` (bila dipakai), lalu `enabled: true`. Deploy.
5. *(Disarankan)* Di Vercel → Environment Variables: `PHOTO_BASE_URL` = nilai `publicBaseUrl`. Database lalu hanya menerima URL foto dari server Anda.

## Uji cepat (tanpa aplikasi)

```bash
curl -i -X POST https://foto.domain-anda.com/pm-foto/upload.php \
  -H "Origin: https://preventive-maintenance-prasad.vercel.app" -H "X-Upload-Token: ISI_TOKEN" \
  -F "file=@contoh.jpg" -F "tag=TAG-449"
# → {"success":true,"url":"https://foto.domain-anda.com/pm-foto/files/2026/10/TAG-449_ab12....jpg","size":123456}
```

Uji lokal (tanpa Apache): `php -d extension=gd -S 127.0.0.1:8099 -t tools/foto-server` dengan
`PM_FOTO_ORIGINS=http://localhost PM_FOTO_BASE_URL=http://127.0.0.1:8099/files/`.

## Perilaku & batas

- Foto diperkecil di HP (sisi terpanjang 1600 px, JPEG) sebelum dikirim; server memeriksa ulang dan membatasi (6 MB mentah, 12000 px, 120 unggahan/jam/IP).
- Tiap laporan maksimal 8 foto di aplikasi (database menerima 12). Foto yang dihapus dari laporan **tetap ada di server** (arsip) — bersihkan manual bila perlu.
- Jangan menaruh `config.php` (token) di repo — sudah ada di `.gitignore`.
