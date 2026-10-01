<?php
// Salin file ini menjadi  backup-config.php  (di folder yang sama), lalu isi.
// backup-config.php sudah masuk .gitignore & .vercelignore — jangan dibagikan.
return [
    // Dari dashboard Turso / perintah: turso db show nama-db --url
    'turso_url'   => 'libsql://nama-db-namaorg.turso.io',
    // Buat token READ-ONLY khusus backup (lihat DEPLOY-TURSO-VERCEL.md)
    'turso_token' => 'ISI_TOKEN_READ_ONLY',
    // Hanya untuk tools\seed-turso.php (impor data). Token yang BISA menulis.
    // Kosongkan lagi setelah impor selesai.
    'turso_write_token' => '',

    // MySQL lokal XAMPP (default XAMPP: user root tanpa password)
    'mysql_host'  => '127.0.0.1',
    'mysql_port'  => 3306,
    'mysql_user'  => 'root',
    'mysql_pass'  => '',
    'mysql_db'    => 'pm_backup',

    'keep'        => 30,   // simpan 30 file backup terakhir
];
