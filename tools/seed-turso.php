<?php
/**
 * seed-turso.php — Kirim sql/seed-turso.sql (data dari Google Sheets) ke database Turso.
 *
 *   D:\Xampp\php\php.exe D:\Xampp\htdocs\PM\tools\seed-turso.php
 *
 * Butuh token Turso yang BISA MENULIS (bukan token read-only untuk backup):
 * isi 'turso_write_token' di tools\backup-config.php, atau set environment
 * variable TURSO_WRITE_TOKEN. Aman diulang — seed memakai UPSERT.
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Forbidden'); }
error_reporting(E_ALL);
set_time_limit(0);

$cfg = ['turso_url' => getenv('TURSO_DATABASE_URL') ?: '', 'turso_write_token' => getenv('TURSO_WRITE_TOKEN') ?: ''];
$cfgFile = __DIR__ . DIRECTORY_SEPARATOR . 'backup-config.php';
if (is_file($cfgFile)) {
    $fileCfg = require $cfgFile;
    if (is_array($fileCfg)) $cfg = array_merge($cfg, array_filter($fileCfg, fn($v) => $v !== null && $v !== ''));
}
$file = $argv[1] ?? dirname(__DIR__) . DIRECTORY_SEPARATOR . 'sql' . DIRECTORY_SEPARATOR . 'seed-turso.sql';

if (!$cfg['turso_url'] || !$cfg['turso_write_token']) {
    fwrite(STDERR, "ERROR: isi 'turso_url' dan 'turso_write_token' di tools\\backup-config.php\n");
    exit(1);
}
if (!is_file($file)) { fwrite(STDERR, "ERROR: file tidak ada: $file\n"); exit(1); }

$baseUrl = rtrim(preg_replace('#^libsql://#', 'https://', trim($cfg['turso_url'])), '/');
$stmts = array_values(array_filter(array_map('trim', explode("\n-- @@\n", str_replace("\r\n", "\n", file_get_contents($file)))),
    fn($s) => $s !== '' && preg_match('/^\s*(--[^\n]*\n\s*)*\S/', $s)));
// buang baris komentar di awal statement
$stmts = array_map(fn($s) => trim(preg_replace('/^(\s*--[^\n]*\n)+/', '', $s)), $stmts);
$stmts = array_values(array_filter($stmts));

echo "Kirim " . count($stmts) . " statement ke " . preg_replace('#^https://#', '', $baseUrl) . "\n";

$ok = 0; $fail = 0;
foreach (array_chunk($stmts, 40) as $i => $chunk) {
    $payload = json_encode(['requests' => array_merge(
        array_map(fn($sql) => ['type' => 'execute', 'stmt' => ['sql' => rtrim($sql, ';')]], $chunk),
        [['type' => 'close']]
    )]);
    $ch = curl_init($baseUrl . '/v2/pipeline');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 120,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $cfg['turso_write_token'], 'Content-Type: application/json'],
    ]);
    $ca = dirname(__DIR__, 3) . '\\apache\\bin\\curl-ca-bundle.crt';
    if (!ini_get('curl.cainfo') && is_file($ca)) curl_setopt($ch, CURLOPT_CAINFO, $ca);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($body === false) { fwrite(STDERR, "ERROR koneksi: " . curl_error($ch) . "\n"); exit(1); }
    curl_close($ch);
    if ($code === 401 || $code === 403) { fwrite(STDERR, "ERROR: token ditolak (HTTP $code) — pakai token yang bisa menulis, bukan read-only.\n"); exit(1); }
    if ($code !== 200) { fwrite(STDERR, "ERROR: Turso HTTP $code: " . substr($body, 0, 300) . "\n"); exit(1); }

    $res = json_decode($body, true)['results'] ?? [];
    foreach ($chunk as $j => $sql) {
        if (($res[$j]['type'] ?? '') === 'ok') { $ok++; continue; }
        $fail++;
        fwrite(STDERR, "GAGAL: " . ($res[$j]['error']['message'] ?? '?') . "\n   " . substr(preg_replace('/\s+/', ' ', $sql), 0, 140) . "\n");
    }
    echo "  batch " . ($i + 1) . ": " . count($chunk) . " statement\n";
}
echo "\nSelesai: $ok berhasil, $fail gagal.\n";
exit($fail ? 1 : 0);
