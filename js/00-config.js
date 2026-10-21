// ════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════
// Backend utama: Vercel Serverless Function api/db.js → database Turso.
// Token Turso TIDAK ada di sini — disimpan sebagai Environment Variable di
// Vercel, jadi tidak bisa dilihat lewat "View Source".
const API_URL = '/api/db';

// Backend lama (Google Sheets). Hanya dipakai sekali oleh migrateFromSheets()
// (lihat 04-sync.js) untuk memindahkan data lama ke Turso.
const LEGACY_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbw7mZX2OplLpKPS-prU27U1GM1KE9dvvZwggGHYgjBFvtkv2CSJ-HKW8FxjHSIzpgi0/exec';
// Fitur Work Order dari PM sedang dimatikan sementara. Ubah ke false untuk
// mengaktifkan kembali — data WO lokal & antriannya tetap tersimpan.
let WO_MAINTENANCE = true;
const WO_URL     ='https://script.google.com/macros/s/AKfycbxWC3esNUKacXKDx1cGqzrtaaH0vKW4pbsVV6_zmUj5jSXBTP2aZLJ73X6M9vW9W3ro/exec';

// Backend hanya aktif kalau app dibuka lewat http(s) — dibuka langsung dari
// file:// (dobel klik index.html) → mode offline, data tetap di localStorage.
function backendEnabled() { return location.protocol === 'http:' || location.protocol === 'https:'; }
const STORE_APP_KEY = 'pm_app_key_v1';   // kunci akses (APP_ACCESS_KEY di Vercel), diisi user sekali

// Identitas perangkat/sesi ini — dipakai untuk sistem lock PM & antrian sync,
// supaya server tahu "siapa" yang sedang mengerjakan sebuah equipment.
const DEVICE_ID = (() => {
  const KEY = 'pm_device_id_v1';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = 'DEV-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 8);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch (e) {
    return 'DEV-' + Date.now().toString(36);
  }
})();

const STORE = { REPORTS: 'pm_reports_v3', SCHEDULES: 'pm_schedules_v3', LAST_SYNC: 'pm_last_sync_v3' };
const STORE_QUEUE     = 'pm_sync_queue_v1';
const STORE_TMPL      = 'pm_custom_templates_v1';
const STORE_SIGS      = 'pm_signatures_v1';
const STORE_NAME_SIGS = 'pm_name_signatures_v1';
const STORE_WO        = 'work_orders_v1';
const STORE_WO_QUEUE  = 'wo_sync_queue_v1';

// Status WO yang dikenali PM app. Sumber kebenaran status tetap di aplikasi WO;
// nilai di sini hanya untuk menampilkan badge & warna di daftar laporan PM.
const WO_STATUS = {
  open:        { label: 'Open',        color: 'var(--red)',    bg: 'rgba(192,57,43,.1)' },
  in_progress: { label: 'Dikerjakan',  color: 'var(--orange)', bg: 'rgba(230,126,34,.1)' },
  pending:     { label: 'Pending',     color: 'var(--orange)', bg: 'rgba(230,126,34,.1)' },
  closed:      { label: 'Closed',      color: 'var(--green2)', bg: 'rgba(74,158,63,.1)' },
  done:        { label: 'Selesai',     color: 'var(--green2)', bg: 'rgba(74,158,63,.1)' },
  cancelled:   { label: 'Dibatalkan',  color: 'var(--text3)',  bg: 'rgba(136,145,168,.12)' }
};
const WO_PRIORITAS = {
  low:    { label: '🟢 Low',    color: 'var(--green2)' },
  medium: { label: '🟡 Medium', color: 'var(--orange)' },
  high:   { label: '🔴 High',   color: 'var(--red)' }
};

// Lock TTL: berapa lama sebuah "sedang dikerjakan" dianggap masih valid tanpa heartbeat.
const LOCK_TTL_MS       = 15 * 60 * 1000; // 15 menit
const LOCK_HEARTBEAT_MS = 60 * 1000;      // heartbeat tiap 1 menit selagi form terbuka
const AUTO_SYNC_POLL_MS = 45 * 1000;      // auto-sync berkala tiap 45 detik

const PM_TEMPLATES = {
  air_dryer:['Bersihkan filter udara masuk dan keluar','Periksa kondisi desiccant/molecular sieve','Cek kebocoran pada fitting dan koneksi pipa','Periksa tekanan inlet dan outlet','Cek kondisi solenoid valve dan fungsinya','Periksa arus motor dan koneksi kelistrikan','Cek kondisi dan kebersihan cooler/heat exchanger','Periksa drain valve dan pastikan berfungsi','Lakukan pembersihan menyeluruh pada unit','Pasang dan periksa kembali cover mesin'],
  belt_conveyor:['Bersihkan seluruh bagian mesin dari kotoran','Periksa kondisi belt: keausan, sobekan, alignment','Cek ketegangan belt dan sesuaikan jika diperlukan','Periksa dan lumasi semua bearing pillow block','Cek kondisi dan kekencangan baut-mur struktur','Periksa kondisi pulley: keausan, kerak, alignment','Cek kondisi skirt rubber dan belt cleaner','Periksa sistem idler: semua berputar bebas','Periksa arus motor dan semua koneksi kelistrikan','Pasang dan periksa kembali cover mesin'],
  blower:['Bersihkan housing blower dari kotoran dan debu','Periksa kondisi impeller/fan blade dari keausan','Cek balancing impeller (tidak ada getaran berlebihan)','Periksa dan lumasi bearing','Cek kondisi belt: ketegangan dan keausan','Periksa baut-mur pengikat dan kencangkan','Periksa kondisi flexible coupling/joint','Periksa arus motor dan koneksi kelistrikan','Cek kondisi filter inlet jika ada','Pasang dan periksa kembali cover mesin'],
  bucket_elevator:['Bersihkan bucket dan casing dari sisa material','Periksa kondisi bucket: retak, bengkok, kehilangan baut','Cek ketegangan chain/belt dan sesuaikan','Periksa kondisi sprocket/pulley dari keausan','Lumasi chain/bearing sesuai jadwal','Periksa alignment head dan boot pulley','Cek kondisi casing dan seal/gasket','Periksa arus motor dan koneksi kelistrikan','Periksa fungsi interlocking dan safety device','Pasang dan periksa kembali cover mesin'],
  cleaner:['Bersihkan semua screen/ayakan dari material','Periksa kondisi screen: sobekan, tersumbat, alignment','Cek ketegangan belt dan semua V-belt','Periksa kondisi bearing dan berikan pelumasan','Periksa kondisi eccentric shaft dan lakukan pelumasan','Cek kekencangan semua baut-mur','Periksa kondisi aspirator dan air flow','Periksa arus motor dan koneksi kelistrikan','Pastikan semua cover pada tempatnya','Pasang dan periksa kembali cover mesin'],
  compressor:['Periksa level oli dan tambahkan jika kurang','Ganti filter udara jika sudah kotor/tersumbat','Cek kondisi v-belt: ketegangan dan keausan','Periksa safety valve dan pastikan berfungsi','Drain kondensat dari tangki dan filter','Periksa kebocoran pada fitting, pipa, dan sambungan','Cek kondisi cylinder liner dan piston ring','Periksa arus motor dan koneksi kelistrikan','Cek fungsi pressure switch dan unloader valve','Pasang dan periksa kembali cover mesin'],
  dust_collector:['Bersihkan atau ganti filter bag sesuai jadwal','Periksa kondisi hopper dan pastikan tidak tersumbat','Cek sistem screw conveyor di bawah hopper','Periksa tekanan differential filter (ΔP)','Cek sistem pulse jet cleaning dan solenoid valve','Periksa kondisi fan/blower dan bearing','Cek kondisi rotary valve/airlock','Periksa arus motor dan koneksi kelistrikan','Bersihkan area sekitar dust collector','Pasang dan periksa kembali cover mesin'],
  electric_panel:['Bersihkan panel dari debu menggunakan vacuum/blower','Periksa dan kencangkan semua terminal koneksi','Cek kondisi MCB/MCCB/Fuse: tidak ada yang trip atau rusak','Periksa kondisi kontaktor dan relay: fungsi normal','Cek thermal relay setting vs nameplate motor','Periksa kondisi kabel: tidak ada yang terkelupas','Cek fungsi emergency stop dan interlocking','Ukur tegangan supply dan catat','Periksa kondisi PLC/inverter jika ada','Cek sistem grounding/earthing','Pasang dan periksa kembali cover dan pintu panel; pastikan tertutup rapat, baut terkunci, dan tidak ada kabel terjepit'],
  gravity:['Bersihkan deck screen dari material yang menempel','Periksa kondisi deck: sobekan, keausan, alignment','Cek ketegangan dan kondisi V-belt','Periksa eksentrik/vibration mechanism','Lumasi bearing sesuai jadwal','Cek air flow di seluruh deck (distribusi merata)','Periksa kekencangan semua baut-mur','Periksa arus motor dan koneksi kelistrikan','Pastikan semua adjustable outlet berfungsi','Pasang dan periksa kembali cover mesin'],
  packing_machine:['Bersihkan semua bagian dari sisa bahan kimia','Periksa kondisi dan kalibrasi load cell','Cek kondisi dan bersihkan vertical/horizontal sealer','Periksa ketajaman cutter','Cek kondisi filter udara pada block regulator','Periksa lubricator pneumatik dan level oli','Periksa electrical valve dan koneksinya','Ukur arus motor dan periksa koneksi kelistrikan','Lakukan kalibrasi load cell','Pasang dan periksa kembali cover mesin'],
  screw_conveyor:['Bersihkan seluruh bagian dari kotoran','Periksa dan kencangkan semua baut-mur','Pastikan semua cover terpasang','Lumasi pillow block dan bearing','Periksa gearbox: kebocoran oli dan level oli','Cek kondisi screw (tidak berbenturan dengan body)','Pastikan tidak ada kotoran yang menghambat screw','Periksa arus motor dan koneksi kelistrikan','Pasang dan periksa kembali cover mesin'],
  sheller:['Bersihkan kotoran pada unit penggerak','Periksa mesh/ayakan dan bersihkan dari kotoran','Periksa screw dan bersihkan dari material sisa','Periksa dan bersihkan blower output','Lumasi bearing dan cek V-belt','Periksa kekencangan baut-mur pada struktur','Periksa arus motor dan koneksi kelistrikan','Pasang dan periksa kembali cover mesin'],
  sliding_gate:['Bersihkan area gate dari kotoran dan material sisa','Periksa kondisi gate plate: keausan, kerataan','Cek kondisi actuator/cylinder (pneumatik/elektrik)','Periksa kebocoran pada sistem pneumatik jika ada','Lumasi rail guide dan pivot point','Cek kondisi limit switch dan proximity sensor','Periksa kekencangan baut-mur pengikat','Uji operasi buka-tutup beberapa kali','Periksa koneksi kelistrikan dan kontrol','Pasang dan periksa kembali cover mesin'],
  // Cold Storage — PM 3 bulanan (Quarterly). 12 item: suhu/RH, evaporator, defrost, kondensor, kompresor,
  // kebocoran oli & refrigeran, sistem refrigeran, pintu, insulasi & lantai, panel listrik/kontrol, alarm & pengaman, evaluasi suhu & RH.
  cold_storage:['Catat suhu & kelembaban ruang (setpoint vs aktual) dan verifikasi pembacaan sensor/data logger','Periksa evaporator: kebersihan coil, bunga es berlebih, fan motor, getaran dan kebisingan','Uji siklus defrost: heater/hot gas, timer/controller, serta drain pan dan drain line tidak tersumbat','Periksa kondensor: kebersihan coil/fan, kondisi fan motor, dan tekanan kondensasi','Periksa kompresor: level oli, tekanan suction/discharge, arus motor, getaran, dan crankcase heater','Periksa kebocoran oli dan refrigeran: sambungan pipa, fitting, valve, seal kompresor, evaporator, dan kondensor; pastikan tidak ada bekas oli atau indikasi kebocoran refrigeran','Periksa sistem refrigeran: sight glass, filter drier, dan kondisi aliran refrigeran','Periksa pintu cold storage: gasket/seal, engsel, door closer, dan heater frame pintu; pastikan pintu menutup rapat','Periksa panel insulasi dan lantai: kerusakan panel, sambungan, kebocoran udara, dan kondensasi','Periksa panel listrik dan kontrol: terminal, kontaktor, overload, controller, kabel, dan setpoint 12°C','Uji alarm dan sistem pengaman: alarm suhu tinggi, pengaman HP/LP, dan emergency door release','Evaluasi kestabilan suhu dan RH: pastikan suhu mendekati 12°C dan RH mencapai target di bawah 40% setelah kondisi stabil','Pasang dan periksa kembali cover mesin'],
  treater:['Bersihkan tangki dan nozzle dari endapan','Periksa kondisi pompa dosing: flow rate akurat','Kalibrasi flow meter dan pastikan akurasi','Periksa kondisi selang dan fitting: tidak bocor','Bersihkan atau ganti filter jika tersumbat','Cek kondisi agitator/mixer','Periksa sistem kontrol dan sensor level','Periksa koneksi kelistrikan dan panel kontrol','Bersihkan area sekitar treater dari tumpahan','Pasang dan periksa kembali cover mesin'],
  pipe_gas:['Pengecekan Kebocoran','Pengecekan Valve','Pengecekan Regulator','Pengecekan Pressure Gauge','Periksa kondisi fisik bejana dan pipa: korosi, penyok, cat, dan label/tanda bahaya','Periksa safety valve dan pastikan berfungsi serta masih dalam masa kalibrasi','Drain kondensat/air dari bejana tekan','Periksa penyangga, baut pengikat, dan grounding bejana','Pasang dan periksa kembali cover/pelindung regulator dan pressure gauge; pastikan tidak ada kebocoran setelah dipasang'],
  trolley:['Bersihkan trolley dan rel dari kotoran dan material sisa','Periksa kondisi roda dan rel: keausan dan alignment','Periksa dan lumasi bearing serta as roda','Periksa motor penggerak dan gearbox: kebocoran oli, suhu, dan suara abnormal','Periksa kondisi kabel/rantai penggerak dan pastikan tidak aus','Cek fungsi limit switch dan emergency stop','Periksa kekencangan baut-mur struktur','Periksa arus motor dan koneksi kelistrikan','Pasang dan periksa kembali cover mesin'],
  truck_tippler:['Bersihkan platform dan area sekitar dari material sisa','Periksa sistem hidrolik: level oli, kebocoran selang dan sambungan','Periksa kondisi silinder hidrolik dan seal','Lumasi pivot/engsel dan bearing','Periksa wheel stopper/clamp penahan truk','Cek fungsi limit switch, interlock, dan emergency stop','Periksa kekencangan baut-mur struktur','Periksa arus motor pompa hidrolik dan koneksi kelistrikan','Pasang dan periksa kembali cover mesin']
};
const PM_TEMPLATES_BACKUP = JSON.parse(JSON.stringify(PM_TEMPLATES));

// ════════════════════════════════════════════════════════
//  FOTO EQUIPMENT (upload ke server sendiri) — BELUM DIAKTIFKAN
//
//  Kode lengkapnya sudah ada (js/25-photos.js, bagian "Foto Equipment" di form PM, PDF, dan kolom
//  photos di database). Yang tersisa hanya mengisi alamat server dan mengubah enabled menjadi true:
//    1. Pasang skrip penerima di server Anda: tools/foto-server/upload.php (lihat README.md di folder itu).
//    2. Isi uploadUrl (alamat upload.php) dan publicBaseUrl (alamat folder tempat foto dilayani).
//    3. Tambahkan domain server foto ke CSP di vercel.json (img-src dan connect-src).
//    4. (Opsional, disarankan) set Environment Variable PHOTO_BASE_URL di Vercel = publicBaseUrl,
//       supaya database hanya menerima URL foto dari server Anda.
//    5. Ubah enabled menjadi true.
// ════════════════════════════════════════════════════════
const PHOTO_CONFIG = {
  enabled: false,                                                      // ← ubah ke true setelah server foto siap
  uploadUrl: 'https://foto.domain-anda.com/pm-foto/upload.php',        // ← JALUR UPLOAD (POST multipart) di server Anda
  publicBaseUrl: 'https://foto.domain-anda.com/pm-foto/files/',        // ← alamat publik tempat foto dilayani (diakhiri /)
  token: '',                                                           // opsional: dikirim sbg header X-Upload-Token (samakan dengan upload.php)
  maxPhotos: 8,                                                        // maksimum foto per laporan (server DB menerima s.d. 12)
  maxEdgePx: 1600,                                                     // sisi terpanjang foto setelah diperkecil di perangkat
  jpegQuality: 0.82                                                    // kualitas JPEG (0.5–0.95)
};

// Daftar unit resmi (urutan tampil). Unit lain yang dibuat lewat Pengaturan atau sudah punya schedule tetap ikut muncul.
const PM_UNITS = ['Unit 1', 'Unit 2', 'Unit Malang'];

// Format pengesahan KHUSUS per unit. Unit tanpa entri di sini memakai format standar (Dibuat / Disetujui / Mengetahui).
// Unit Malang: 4 penanda tangan. defaultName = nama yang terisi otomatis di modal tanda tangan & halaman pengesahan PDF.
//   key        → kunci penyimpanan (kolom signatures.signers); title/sub → label di dokumen
const PM_UNIT_FORMATS = [
  { match: /malang/i, name: 'Unit Malang', roles: [
    { key: 'execute',  title: 'Teknisi PM',     sub: 'Execute by' },
    { key: 'checked',  title: 'Supervisor MTC', sub: 'Checked by', defaultName: 'Bambang / Khoirus' },
    { key: 'review',   title: 'Manager MTC',    sub: 'Review by', defaultName: 'Tumade Fefarri' },
    { key: 'approved', title: 'Plan Manager',   sub: 'Approved by', defaultName: 'Marrio Dwi Oktavianto' }
  ] }
];
const pmUnitFormat = unit => PM_UNIT_FORMATS.find(f => f.match.test(unit || '')) || null;

const STORE_MASTER    = 'pm_master_v1';   // master data: unit/area & tipe equipment tambahan (lihat 21-master.js)

// Mutable: tipe equipment baru dari menu "Kelola Data Master" ditambahkan di sini saat runtime.
const EQ_LABELS = {air_dryer:'Air Dryer',belt_conveyor:'Belt Conveyor',blower:'Blower',bucket_elevator:'Bucket Elevator',cleaner:'Cleaner',cold_storage:'Cold Storage',compressor:'Compressor',dust_collector:'Dust Collector',electric_panel:'Electric Panel',gravity:'Gravity Table',packing_machine:'Packing Machine',screw_conveyor:'Screw Conveyor',sheller:'Sheller',sliding_gate:'Sliding Gate Hopper',treater:'Treater',pipe_gas:'Pipa Gas / Bejana Tekan',trolley:'Trolley',truck_tippler:'Truck Tippler'};
const PERIODE_DAYS ={Daily:1,Weekly:7,Monthly:30,Quarterly:90,'Semi-Annual':180,Annual:365};
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
