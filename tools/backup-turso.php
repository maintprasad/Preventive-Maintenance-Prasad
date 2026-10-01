<?php
/**
 * backup-turso.php — Backup database Turso → file .sql MySQL (phpMyAdmin)
 *
 * Dijalankan dari CMD (BUKAN dari browser):
 *
 *   D:\Xampp\php\php.exe D:\Xampp\htdocs\PM\tools\backup-turso.php
 *       → hanya membuat file  D:\Xampp\htdocs\PM\backups\turso-backup-YYYYMMDD-HHMMSS.sql
 *
 *   D:\Xampp\php\php.exe D:\Xampp\htdocs\PM\tools\backup-turso.php --import
 *       → membuat file .sql DAN langsung mengimpornya ke MySQL lokal
 *         (database `pm_backup`, terlihat di phpMyAdmin)
 *
 * Opsi:
 *   --import            impor langsung ke MySQL lokal (MySQL di XAMPP harus Start)
 *   --db=nama_db        nama database MySQL tujuan (default: pm_backup)
 *   --out=FOLDER        folder hasil backup (default: ..\backups)
 *   --keep=30           simpan N file backup terbaru, sisanya dihapus (0 = simpan semua)
 *
 * Konfigurasi (token TIDAK ditulis di file ini):
 *   salin tools\backup-config.example.php → tools\backup-config.php lalu isi,
 *   ATAU set environment variable TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN.
 *   Pakai token READ-ONLY khusus backup (lihat DEPLOY-TURSO-VERCEL.md).
 */

if (PHP_SAPI !== 'cli') {               // jangan pernah bisa dipanggil lewat http://localhost/...
    http_response_code(403);
    exit('Forbidden');
}
error_reporting(E_ALL);
date_default_timezone_set('Asia/Jakarta');   // php.ini bawaan XAMPP = Europe/Berlin
ini_set('memory_limit', '1024M');
set_time_limit(0);

// ── Konfigurasi ─────────────────────────────────────────
$cfg = [
    'turso_url'   => getenv('TURSO_DATABASE_URL') ?: '',
    'turso_token' => getenv('TURSO_AUTH_TOKEN') ?: '',
    'mysql_host'  => '127.0.0.1',
    'mysql_port'  => 3306,
    'mysql_user'  => 'root',
    'mysql_pass'  => '',
    'mysql_db'    => 'pm_backup',
    'out_dir'     => dirname(__DIR__) . DIRECTORY_SEPARATOR . 'backups',
    'keep'        => 30,
];
$cfgFile = __DIR__ . DIRECTORY_SEPARATOR . 'backup-config.php';
if (is_file($cfgFile)) {
    $fileCfg = require $cfgFile;
    if (is_array($fileCfg)) $cfg = array_merge($cfg, array_filter($fileCfg, fn($v) => $v !== null && $v !== ''));
}

$opts = getopt('', ['import', 'db:', 'out:', 'keep:']);
$doImport = array_key_exists('import', $opts);
if (isset($opts['db']))   $cfg['mysql_db'] = $opts['db'];
if (isset($opts['out']))  $cfg['out_dir']  = $opts['out'];
if (isset($opts['keep'])) $cfg['keep']     = (int)$opts['keep'];

if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $cfg['mysql_db'])) fail("Nama database MySQL tidak valid: {$cfg['mysql_db']}");
if (!$cfg['turso_url'] || !$cfg['turso_token']) {
    fail("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN belum diisi.\n"
       . "Salin tools\\backup-config.example.php menjadi tools\\backup-config.php lalu isi.");
}
$baseUrl = rtrim(preg_replace('#^libsql://#', 'https://', trim($cfg['turso_url'])), '/');

// ── Klien Turso (HTTP /v2/pipeline) ─────────────────────
function turso(string $sql, array $args = []): array {
    global $baseUrl, $cfg;
    $payload = json_encode(['requests' => [
        ['type' => 'execute', 'stmt' => ['sql' => $sql, 'args' => array_map('tursoArg', $args)]],
        ['type' => 'close'],
    ]]);
    $ch = curl_init($baseUrl . '/v2/pipeline');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $cfg['turso_token'], 'Content-Type: application/json'],
    ]);
    // XAMPP kadang tidak mengisi curl.cainfo → pakai bundle CA bawaan Apache XAMPP.
    $ca = dirname(__DIR__, 3) . '\\apache\\bin\\curl-ca-bundle.crt';
    if (!ini_get('curl.cainfo') && is_file($ca)) curl_setopt($ch, CURLOPT_CAINFO, $ca);

    $body = curl_exec($ch);
    if ($body === false) fail('Gagal menghubungi Turso: ' . curl_error($ch));
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code === 401 || $code === 403) fail("Token Turso ditolak (HTTP $code). Cek TURSO_AUTH_TOKEN.");
    if ($code !== 200) fail("Turso HTTP $code: " . substr($body, 0, 300));

    $data = json_decode($body, true);
    $r = $data['results'][0] ?? null;
    if (!$r || $r['type'] !== 'ok') fail('Query Turso gagal: ' . ($r['error']['message'] ?? 'unknown') . "\nSQL: $sql");
    $res  = $r['response']['result'];
    $cols = array_map(fn($c) => $c['name'], $res['cols']);
    $rows = [];
    foreach ($res['rows'] as $row) {
        $o = [];
        foreach ($row as $i => $v) $o[$cols[$i]] = $v;   // tetap simpan tipe {type,value}
        $rows[] = $o;
    }
    return ['cols' => $cols, 'rows' => $rows];
}
function tursoArg($v): array {
    if ($v === null) return ['type' => 'null'];
    if (is_int($v))  return ['type' => 'integer', 'value' => (string)$v];
    return ['type' => 'text', 'value' => (string)$v];
}
function plain(array $v) { return $v['type'] === 'null' ? null : $v['value']; }

// ── Konversi ke SQL MySQL ───────────────────────────────
function q(string $ident): string { return '`' . str_replace('`', '``', $ident) . '`'; }
function mysqlStr(string $s): string {
    return "'" . str_replace(
        ['\\',   "\0",  "\n",  "\r",  "'",   '"',   "\x1a"],
        ['\\\\', '\\0', '\\n', '\\r', "\\'", '\\"', '\\Z'],
        $s) . "'";
}
function mysqlValue(array $v): string {
    switch ($v['type']) {
        case 'null':    return 'NULL';
        case 'integer': return preg_match('/^-?\d+$/', (string)$v['value']) ? (string)$v['value'] : 'NULL';
        case 'float':   return is_numeric($v['value']) ? (string)$v['value'] : 'NULL';
        case 'blob':    return '0x' . bin2hex(base64_decode($v['base64'] ?? $v['value'] ?? ''));
        default:        return mysqlStr((string)$v['value']);
    }
}
function mysqlType(string $sqliteType, bool $isPk): string {
    $t = strtoupper($sqliteType);
    if (str_contains($t, 'INT'))                                           return 'BIGINT';
    if (str_contains($t, 'REAL') || str_contains($t, 'FLOA') || str_contains($t, 'DOUB')) return 'DOUBLE';
    if (str_contains($t, 'BLOB'))                                          return 'LONGBLOB';
    return $isPk ? 'VARCHAR(191)' : 'LONGTEXT';     // 191 = batas index utf8mb4
}

// ── Mulai ───────────────────────────────────────────────
$started = microtime(true);
echo "== Backup Turso -> MySQL ==\n";
echo "Sumber : " . preg_replace('#^https://#', '', $baseUrl) . "\n";

$tables = array_map(fn($r) => plain($r['name']), turso(
    "SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
       AND name NOT LIKE 'libsql\\_%' ESCAPE '\\'
       AND name NOT LIKE '\\_%' ESCAPE '\\'
     ORDER BY name"
)['rows']);
if (!$tables) fail('Tidak ada tabel di database Turso (aplikasi belum pernah dipakai?).');

$stmts = [
    'SET NAMES utf8mb4',
    'SET FOREIGN_KEY_CHECKS = 0',
];
$summary = [];

foreach ($tables as $table) {
    if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $table)) { echo "  - lewati tabel bernama aneh: $table\n"; continue; }

    $info = turso("PRAGMA table_info(\"$table\")")['rows'];
    $cols = [];
    $pks  = [];
    foreach ($info as $c) {
        $name = plain($c['name']);
        $isPk = (int)plain($c['pk']) > 0;
        if ($isPk) $pks[] = q($name);
        $cols[] = '  ' . q($name) . ' ' . mysqlType((string)plain($c['type']), $isPk) . ($isPk ? ' NOT NULL' : ' NULL');
    }
    if ($pks) $cols[] = '  PRIMARY KEY (' . implode(', ', $pks) . ')';

    $stmts[] = 'DROP TABLE IF EXISTS ' . q($table);
    $stmts[] = 'CREATE TABLE ' . q($table) . " (\n" . implode(",\n", $cols) . "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    // Ambil baris bertahap (500 per request) supaya tabel besar tidak timeout.
    $count = 0;
    $colNames = null;
    for ($offset = 0; ; $offset += 500) {
        $page = turso("SELECT * FROM \"$table\" ORDER BY rowid LIMIT 500 OFFSET ?", [$offset]);
        if (!$page['rows']) break;
        $colNames ??= implode(', ', array_map('q', $page['cols']));
        foreach (array_chunk($page['rows'], 100) as $chunk) {
            $values = array_map(fn($row) => '(' . implode(', ', array_map('mysqlValue', array_values($row))) . ')', $chunk);
            $stmts[] = 'INSERT INTO ' . q($table) . " ($colNames) VALUES\n" . implode(",\n", $values);
        }
        $count += count($page['rows']);
        if (count($page['rows']) < 500) break;
    }
    $summary[$table] = $count;
    printf("  %-12s %6d baris\n", $table, $count);
}
$stmts[] = 'SET FOREIGN_KEY_CHECKS = 1';

// ── Tulis file .sql ─────────────────────────────────────
$outDir = rtrim($cfg['out_dir'], '\\/');
if (!is_dir($outDir) && !mkdir($outDir, 0700, true)) fail("Tidak bisa membuat folder $outDir");
// Folder backup ada di dalam htdocs → tutup dari akses browser.
if (!is_file("$outDir/.htaccess")) file_put_contents("$outDir/.htaccess", "Require all denied\n");

$file = $outDir . DIRECTORY_SEPARATOR . 'turso-backup-' . date('Ymd-His') . '.sql';
$header = "-- Backup Turso -> MySQL\n-- Dibuat : " . date('Y-m-d H:i:s') . "\n-- Sumber : " . preg_replace('#^https://#', '', $baseUrl)
        . "\n-- Tabel  : " . implode(', ', array_map(fn($t, $n) => "$t ($n)", array_keys($summary), $summary))
        . "\n-- Impor  : phpMyAdmin > pilih database > Import, atau\n--          mysql -u root nama_db < file_ini.sql\n\n";
file_put_contents($file, $header . implode(";\n\n", $stmts) . ";\n");
echo "\nFile   : $file (" . round(filesize($file) / 1024, 1) . " KB)\n";

// ── Impor langsung ke MySQL (opsional) ─────────────────
if ($doImport) {
    echo "Impor  : MySQL {$cfg['mysql_host']}:{$cfg['mysql_port']} database `{$cfg['mysql_db']}` ... ";
    try {
        $pdo = new PDO("mysql:host={$cfg['mysql_host']};port={$cfg['mysql_port']};charset=utf8mb4",
                       $cfg['mysql_user'], $cfg['mysql_pass'],
                       [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    } catch (PDOException $e) {
        fail("tidak bisa konek ke MySQL — sudah klik Start MySQL di XAMPP Control Panel?\n" . $e->getMessage());
    }
    $pdo->exec('CREATE DATABASE IF NOT EXISTS ' . q($cfg['mysql_db']) . ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('USE ' . q($cfg['mysql_db']));
    foreach ($stmts as $s) $pdo->exec($s);
    echo "OK\n";
}

// ── Rotasi: simpan N backup terbaru ─────────────────────
if ($cfg['keep'] > 0) {
    $old = glob($outDir . DIRECTORY_SEPARATOR . 'turso-backup-*.sql');
    rsort($old);
    foreach (array_slice($old, $cfg['keep']) as $f) @unlink($f);
}

printf("Selesai dalam %.1f detik.\n", microtime(true) - $started);
exit(0);

function fail(string $msg): void {
    fwrite(STDERR, "\nERROR: $msg\n");
    exit(1);
}
