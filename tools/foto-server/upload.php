<?php
/**
 * upload.php — Penerima FOTO EQUIPMENT untuk aplikasi PM.
 *
 * Taruh folder ini di SERVER ANDA SENDIRI (bukan di Vercel). Aplikasi PM mengirim foto yang sudah
 * diperkecil (POST multipart, field "file"); skrip ini memvalidasi, menyimpan, dan membalas
 *   {"success":true,"url":"https://server-anda/pm-foto/files/2026/10/TAG-449_ab12....jpg"}
 * Aplikasi hanya menyimpan URL itu di laporan (kolom photos).
 *
 * KEAMANAN (ringkas):
 *   • Hanya origin aplikasi PM (allowed_origins) yang boleh memanggil (CORS) + token opsional (upload_token).
 *   • Hanya gambar JPEG/PNG/WebP asli (dicek finfo + getimagesize), lalu DI-ENCODE ULANG sebagai JPEG lewat GD
 *     → metadata/EXIF dan muatan tersembunyi dibuang.
 *   • Nama file dibuat acak; input pengguna tidak pernah dipakai sebagai path.
 *   • Batas ukuran, batas dimensi, dan pembatasan kecepatan per IP.
 *   • Folder files/ berisi .htaccess yang melarang eksekusi skrip.
 *
 * KONFIGURASI: ubah $DEFAULTS di bawah, ATAU buat config.php di folder ini yang `return [ ... ]` (jangan di-commit),
 * ATAU set environment variable PM_FOTO_ORIGINS (dipisah koma), PM_FOTO_TOKEN, PM_FOTO_BASE_URL.
 */
declare(strict_types=1);

$DEFAULTS = [
    // Alamat aplikasi PM yang boleh mengunggah (tanpa garis miring di akhir). Tambah http://localhost bila menguji lokal.
    'allowed_origins' => ['https://preventive-maintenance-prasad.vercel.app'],
    // Samakan dengan PHOTO_CONFIG.token di js/00-config.js. Kosong = tanpa token (tetap dibatasi origin).
    'upload_token'    => '',
    // Folder penyimpanan (harus bisa ditulis oleh web server) dan alamat publiknya (diakhiri /).
    'files_dir'       => __DIR__ . '/files',
    'public_base_url' => 'https://foto.domain-anda.com/pm-foto/files/',   // = PHOTO_CONFIG.publicBaseUrl
    'max_bytes'       => 6 * 1024 * 1024,   // batas ukuran unggahan mentah
    'max_edge_px'     => 2400,              // sisi terpanjang setelah di-encode ulang
    'jpeg_quality'    => 85,
    'rate_per_hour'   => 120,               // maksimum unggahan per IP per jam
];
$cfg = $DEFAULTS;
if (is_file(__DIR__ . '/config.php')) { $extra = require __DIR__ . '/config.php'; if (is_array($extra)) $cfg = array_merge($cfg, $extra); }
if (($e = getenv('PM_FOTO_ORIGINS')) !== false && $e !== '') $cfg['allowed_origins'] = array_map('trim', explode(',', $e));
if (($e = getenv('PM_FOTO_TOKEN')) !== false)                $cfg['upload_token'] = $e;
if (($e = getenv('PM_FOTO_BASE_URL')) !== false && $e !== '') $cfg['public_base_url'] = $e;
if (($e = getenv('PM_FOTO_DIR')) !== false && $e !== '')      $cfg['files_dir'] = $e;

function reply(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// ── CORS ──
$origin = rtrim((string)($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
$allowed = array_map(fn($o) => rtrim((string)$o, '/'), $cfg['allowed_origins']);
if ($origin !== '') {
    if (!in_array($origin, $allowed, true)) reply(403, ['success' => false, 'message' => 'Origin tidak diizinkan']);
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: X-Upload-Token, Content-Type');
    header('Access-Control-Max-Age: 600');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST')    reply(405, ['success' => false, 'message' => 'Gunakan POST']);

// ── Token (opsional) ──
if ($cfg['upload_token'] !== '') {
    $sent = (string)($_SERVER['HTTP_X_UPLOAD_TOKEN'] ?? '');
    if (!hash_equals($cfg['upload_token'], $sent)) reply(401, ['success' => false, 'message' => 'Token salah']);
}

// ── Pembatasan kecepatan per IP (file kecil di folder sementara) ──
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'x');
$rlFile = sys_get_temp_dir() . '/pmfoto_rl_' . md5($ip) . '.json';
$now = time(); $hits = [];
if (is_file($rlFile)) { $d = json_decode((string)@file_get_contents($rlFile), true); if (is_array($d)) $hits = array_values(array_filter($d, fn($t) => is_int($t) && $t > $now - 3600)); }
if (count($hits) >= (int)$cfg['rate_per_hour']) reply(429, ['success' => false, 'message' => 'Terlalu banyak unggahan, coba lagi nanti']);
$hits[] = $now; @file_put_contents($rlFile, json_encode($hits), LOCK_EX);

// ── Berkas ──
if (!isset($_FILES['file']) || !is_array($_FILES['file'])) reply(400, ['success' => false, 'message' => 'Field "file" tidak ada']);
$f = $_FILES['file'];
if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) reply(400, ['success' => false, 'message' => 'Unggah gagal (kode ' . (int)$f['error'] . ')']);
if (!is_uploaded_file($f['tmp_name'])) reply(400, ['success' => false, 'message' => 'Berkas tidak valid']);
if ((int)$f['size'] <= 0 || (int)$f['size'] > (int)$cfg['max_bytes']) reply(413, ['success' => false, 'message' => 'Ukuran foto melebihi batas']);

$fi = new finfo(FILEINFO_MIME_TYPE);
$mime = (string)$fi->file($f['tmp_name']);
$info = @getimagesize($f['tmp_name']);
if (!$info || !in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) reply(415, ['success' => false, 'message' => 'Hanya foto JPEG/PNG/WebP']);
[$w, $h] = $info;
if ($w < 1 || $h < 1 || $w > 12000 || $h > 12000) reply(415, ['success' => false, 'message' => 'Dimensi foto tidak wajar']);

// ── Lokasi simpan: files/YYYY/MM/<TAG>_<acak>.jpg (nama acak; input pengguna tidak dipakai sebagai path) ──
$tag = substr((string)preg_replace('/[^A-Za-z0-9_-]/', '', (string)($_POST['tag'] ?? '')), 0, 24);
$sub = date('Y') . '/' . date('m');
$dir = rtrim($cfg['files_dir'], '/\\') . '/' . $sub;
if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) reply(500, ['success' => false, 'message' => 'Folder penyimpanan tidak bisa dibuat']);
$name = ($tag !== '' ? $tag . '_' : '') . bin2hex(random_bytes(12)) . '.jpg';
$path = $dir . '/' . $name;

$hasGd = function_exists('imagecreatefromjpeg') && function_exists('imagejpeg');
if ($hasGd) {
    // Encode ulang sebagai JPEG (membuang EXIF & muatan tersembunyi)
    $img = match ($mime) {
        'image/jpeg' => @imagecreatefromjpeg($f['tmp_name']),
        'image/png'  => @imagecreatefrompng($f['tmp_name']),
        'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($f['tmp_name']) : false,
    };
    if (!$img) reply(415, ['success' => false, 'message' => 'Foto tidak bisa dibaca']);
    $edge = (int)$cfg['max_edge_px'];
    if (max($w, $h) > $edge) {
        $k = $edge / max($w, $h);
        $res = imagescale($img, max(1, (int)round($w * $k)), max(1, (int)round($h * $k)));
        if ($res) { imagedestroy($img); $img = $res; }
    }
    $flat = imagecreatetruecolor(imagesx($img), imagesy($img));          // latar putih untuk PNG/WebP transparan
    imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
    imagecopy($flat, $img, 0, 0, 0, 0, imagesx($img), imagesy($img));
    imagedestroy($img);
    if (!imagejpeg($flat, $path, (int)$cfg['jpeg_quality'])) reply(500, ['success' => false, 'message' => 'Gagal menyimpan foto']);
    imagedestroy($flat);
} else {
    // Tanpa ekstensi GD (aktifkan extension=gd di php.ini bila bisa): hanya JPEG asli yang diterima & disimpan apa adanya.
    // Aplikasi sudah memperkecil + meng-encode ulang foto sebelum dikirim; folder files/ juga tidak bisa mengeksekusi skrip.
    if ($mime !== 'image/jpeg') reply(500, ['success' => false, 'message' => 'Server perlu ekstensi GD untuk PNG/WebP']);
    if (!move_uploaded_file($f['tmp_name'], $path)) reply(500, ['success' => false, 'message' => 'Gagal menyimpan foto']);
}
@chmod($path, 0644);

reply(200, ['success' => true, 'url' => rtrim($cfg['public_base_url'], '/') . '/' . $sub . '/' . $name, 'size' => filesize($path)]);
