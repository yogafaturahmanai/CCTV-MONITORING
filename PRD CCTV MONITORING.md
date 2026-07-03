# PRD: CCTV NVR Monitoring Dashboard

## 1. Latar Belakang
ATI Business Group memiliki banyak NVR Hikvision (sebagian dikelola via iVMS-4200) yang tersebar di beberapa site. Saat ini pengecekan status kamera (online/offline), status recording, dan kapasitas HDD dilakukan manual per-NVR (login satu-satu ke web UI / iVMS). Hal ini tidak efisien untuk monitoring proaktif, terutama saat ada kamera mati atau recording berhenti tanpa disadari.

## 2. Tujuan
Membangun aplikasi web internal yang menjadi **single pane of glass** untuk memonitor seluruh NVR Hikvision di semua site, dengan kemampuan:
1. Memilih NVR mana yang ingin dilihat (dropdown/list per site).
2. Menampilkan status tiap channel/kamera: online/offline, sinyal video ada/tidak.
3. Menampilkan status recording per channel (recording aktif, terhenti, atau error).
4. Menampilkan usage HDD per NVR (total, used, free, status disk - normal/error/uninitialized).
5. (Opsional, nice-to-have) Alerting bila kamera offline, recording berhenti, atau HDD penuh.

## 3. Target Pengguna
- Tim IT/Network ATI Business Group (admin & engineer) sebagai pengguna utama.
- Tidak ditujukan untuk end-user non-teknis di tahap awal.

## 4. Scope

### 4.1 In Scope (MVP)
- Registrasi/manajemen daftar NVR (IP, port, username, password terenkripsi, site/label).
- Polling status NVR via **Hikvision ISAPI** (HTTP/HTTPS, Digest Auth).
- Dashboard list semua NVR dengan status ringkas (online/offline, jumlah kamera bermasalah).
- Halaman detail per NVR:
  - Daftar channel/kamera + status online/offline.
  - Status recording per channel.
  - Usage HDD (kapasitas, terpakai, sisa, status disk).
- Auto-refresh berkala (polling interval, misal 30-60 detik).
- Autentikasi user untuk akses dashboard (login internal, bisa reuse pola JWT seperti di Yogsdius).

### 4.2 Out of Scope (MVP)
- Live streaming video kamera (hanya status, bukan playback).
- Playback rekaman / export video.
- Integrasi mendalam dengan iVMS-4200 API privat (akan dicoba via ISAPI standar dulu; iVMS sebagian besar adalah software client, bukan device, sehingga kemungkinan tetap menyasar device-nya langsung via ISAPI).
- Manajemen konfigurasi NVR dari dashboard (read-only di MVP).

### 4.3 Future Enhancements
- Notifikasi Telegram/email saat kamera offline, recording stop, atau HDD > threshold.
- Histori uptime kamera (grafik/trend).
- Snapshot thumbnail per kamera (ISAPI mendukung ambil snapshot JPEG).
- Role-based access (admin vs viewer).
- Export laporan harian/mingguan ke PDF/Excel.

## 4.4 Cakupan Tambahan: PC-based NVR (iVMS-4200 PCNVR)
Selain NVR fisik (hardware appliance), terdapat PC yang difungsikan sebagai NVR menggunakan software **iVMS-4200 PCNVR** (encoding/recording dilakukan di PC, bukan di hardware NVR). Karakteristiknya berbeda dari NVR fisik:
- Statusnya bergantung pada kondisi PC (service Windows nyala/mati), bukan cuma kondisi network device.
- HDD yang dipakai untuk recording adalah disk internal PC (bisa C:/D:/drive lain), bukan disk bay khusus seperti di NVR hardware.
- Kemungkinan ada beberapa metode untuk ambil status, perlu dicek satu-satu validitasnya di lapangan:
  1. **ISAPI lokal** - sebagian versi PCNVR menjalankan mini web service yang juga compatible dengan ISAPI di port tertentu (perlu dicek apakah PC ini bisa diakses lewat ISAPI seperti NVR hardware, karena beberapa versi PCNVR mendukung ini).
  2. **Agent kecil di PC** - jika ISAPI tidak tersedia/tidak stabil, pasang small agent/script (mis. Python/PowerShell) yang membaca:
     - Status proses PCNVR (apakah service/aplikasi masih running).
     - Usage disk tempat folder recording berada (via WMI/PowerShell `Get-PSDrive` atau `Get-Volume`).
     - Status recording dengan cek apakah file rekaman di folder masih ter-update (timestamp terbaru < beberapa menit yang lalu = recording aktif).
     - Agent ini report status ke backend dashboard secara periodik (push), berbeda dari NVR hardware yang di-poll (pull).
  3. **Windows Service Monitoring** - kombinasi cek port/process (mirip Node Exporter yang sudah dipakai di monitoring stack `10.90.30.237`) untuk tahu PC hidup/mati, lalu agent khusus untuk detail status kamera & recording.
- Untuk status tiap kamera per channel di PCNVR, kemungkinan besar tetap perlu cek ISAPI/API lokal PCNVR (poin 1) karena agent OS-level tidak tahu soal channel kamera individual.
- PC-based NVR ini akan ditampilkan di dashboard yang sama, dibedakan dengan tipe `PCNVR` di data model, tapi dengan sumber data status berbeda (campuran ISAPI/agent, bukan murni ISAPI seperti NVR hardware).

## 5. Pendekatan Teknis

### 5.1 Cara Ambil Data dari NVR
Hikvision NVR menyediakan **ISAPI** (HTTP REST-like, berbasis XML) yang bisa diakses langsung ke IP NVR, tanpa perlu lewat iVMS, dengan Digest Authentication. Endpoint yang relevan (perlu divalidasi langsung di tiap firmware NVR yang dipakai, karena versi ISAPI bisa sedikit berbeda):
- Status channel/kamera (online/offline per channel).
- Status streaming/video loss per channel.
- Status recording per channel.
- Status & kapasitas HDD (jumlah disk, kapasitas total, terpakai, status S.M.A.R.T/health bila tersedia).
- Info device (nama, model, firmware) untuk identifikasi.

Karena tiap NVR punya kredensial & IP berbeda, sistem perlu menyimpan kredensial terenkripsi dan melakukan request ISAPI per-NVR secara terjadwal (polling) atau on-demand saat user membuka halaman detail.

### 5.2 Arsitektur (selaras dengan stack yang sudah dipakai - Yogsdius style)
- **Backend**: Node.js/Express (atau bisa Python/FastAPI jika ingin reuse pola dari project bandwidth monitor sebelumnya), bertugas:
  - CRUD daftar NVR.
  - Worker/scheduler (cron/interval) untuk polling tiap NVR via ISAPI.
  - Cache hasil polling ke database (jangan hit NVR setiap kali frontend refresh, supaya tidak membebani NVR).
  - Endpoint API untuk frontend.
- **Database**: PostgreSQL/MySQL/SQLite (selaras dengan Prisma seperti Yogsdius) untuk menyimpan:
  - Master data NVR (IP, port, kredensial terenkripsi, site, lokasi).
  - Snapshot status terakhir tiap kamera/HDD per NVR.
  - (Future) histori status untuk trend/alerting.
- **Frontend**: React + Vite, dengan komponen:
  - List/grid NVR dengan indikator status (warna hijau/merah/kuning).
  - Halaman detail NVR (tabel channel + status, tabel HDD).
- **Deployment**: Docker Compose via Dokploy, mengikuti pola monitoring stack yang sudah berjalan di `10.90.30.237`.

### 5.3 Pertimbangan Khusus
- **Network reachability**: pastikan server aplikasi punya akses jaringan ke semua NVR di tiap site (lewat BGP routing antar site yang sudah ada). Perlu whitelist firewall/Sophos jika ada pembatasan.
- **Rate limiting ke NVR**: jangan polling terlalu sering, karena NVR punya resource terbatas dan banyak koneksi ISAPI bersamaan bisa membebani CPU NVR.
- **Keamanan kredensial**: simpan password NVR terenkripsi (mis. AES) di database, jangan plaintext.
- **Timeout & retry**: NVR yang sedang down/network putus harus terdeteksi sebagai "unreachable" dengan timeout yang wajar (misal 5 detik), bukan membuat dashboard hang.
- **iVMS-4200**: karena iVMS adalah software desktop (bukan server API publik resmi), untuk NVR yang "pakai iVMS" pendekatan paling realistis tetap polling langsung ke device NVR via ISAPI (NVR-nya sendiri yang punya IP & ISAPI, iVMS hanya client viewer). Perlu konfirmasi apakah semua NVR ini reachable langsung di network.

## 6. Data Model (Draft)

**NVR**
- id, name/label, site, type (`hardware_nvr` / `pcnvr`), ip_address, port, protocol (http/https), username, password_encrypted, agent_token (khusus pcnvr, untuk autentikasi push dari agent), created_at, updated_at, is_active

**Channel** (per NVR)
- id, nvr_id, channel_no, camera_name, last_status (online/offline), last_recording_status, last_checked_at

**HDD**
- id, nvr_id, disk_id, capacity_mb, freespace_mb, status (normal/error/uninitialized), last_checked_at

**PollingLog** (opsional untuk histori/debug)
- id, nvr_id, status, response_time_ms, error_message, checked_at

## 7. UI/UX (Garis Besar)

### 7.1 Dashboard Utama
- Grid/list card per NVR: nama, site, status keseluruhan (online/partial/offline), jumlah kamera offline (badge merah jika > 0), HDD usage ringkas (progress bar %).

### 7.2 Halaman Detail NVR
- Header: nama NVR, IP, site, last updated.
- Tabel channel: No, Nama kamera, Status (●hijau/merah), Status recording (●hijau/kuning/merah).
- Tabel HDD: Disk #, Kapasitas, Terpakai, Sisa, Status.
- Tombol "Refresh Now" untuk polling manual on-demand.

## 8. Non-Functional Requirements
- Polling interval default 30-60 detik, bisa dikonfigurasi per NVR.
- Dashboard tetap responsif walau salah satu/lebih NVR down (tidak boleh blocking).
- Mendukung minimal jumlah NVR sesuai jumlah site saat ini (5 site), dengan desain yang scalable untuk penambahan NVR baru.
- Akses dashboard dibatasi dengan login (reuse pola auth internal yang sudah ada).

## 9. Metrik Keberhasilan
- Tim IT bisa mengecek status seluruh NVR dalam < 1 menit tanpa login satu-satu.
- Deteksi kamera offline/recording berhenti tanpa menunggu komplain user.
- (Setelah fase alerting) waktu deteksi insiden HDD penuh/kamera mati turun signifikan dibanding proses manual.

## 10. Milestone Usulan
1. **Fase 1 - Riset & PoC**: Validasi endpoint ISAPI yang tersedia di firmware NVR yang dipakai (test manual via Postman/curl ke 1-2 NVR).
2. **Fase 2 - Backend Core**: CRUD NVR + worker polling + simpan ke DB.
3. **Fase 3 - Frontend Dashboard**: List NVR + halaman detail.
4. **Fase 4 - Deployment**: Dockerize, deploy via Dokploy.
5. **Fase 5 - Enhancement**: Alerting Telegram, histori/trend, snapshot thumbnail.

## 11. Open Questions
- Berapa total NVR & berapa channel rata-rata per NVR (untuk estimasi beban polling)?
- Apakah semua NVR reachable langsung dari satu server pusat (via BGP antar site), atau perlu agent di tiap site?
- Versi firmware NVR bervariasi atau seragam? (Mempengaruhi konsistensi endpoint ISAPI).
- Apakah dibutuhkan histori status jangka panjang (untuk SLA reporting) sejak awal, atau cukup status real-time dulu?
- Berapa banyak PC yang dijadikan PCNVR, dan versi iVMS-4200 PCNVR apa yang dipakai? (perlu dicek apakah versinya mendukung ISAPI lokal atau harus pakai agent).
- Apakah PC-PCNVR ini berjalan dengan OS Windows yang bisa dipasangi agent kecil (PowerShell/Python service), atau ada restriksi (misal PC milik user lain, tidak boleh install apapun)?
- Folder lokasi recording di PC PCNVR ada di drive mana, supaya bisa dipastikan agent membaca path yang benar untuk cek usage HDD & aktivitas recording.


---

# 12. Functional Requirements (Tambahan)

## Prioritas MVP
| Priority | Fitur |
|---|---|
| P0 | Login, CRUD NVR, Dashboard, Polling Worker, Detail NVR |
| P1 | Manual Refresh, Filter Site, Search |
| P2 | Telegram Alert, History Status, Snapshot |
| P3 | Export Report |

## Acceptance Criteria
### Dashboard
- Menampilkan seluruh NVR yang aktif.
- Tetap responsif walaupun satu atau lebih NVR offline.
- Auto refresh tanpa reload halaman.

### Polling
- Timeout default 5 detik.
- Retry maksimal 2 kali.
- Kegagalan satu NVR tidak boleh menghentikan polling NVR lain.

### Login / Auth
- Login gagal setelah N kali percobaan salah (misal 5x) men-trigger temporary lockout/rate limit.
- Session/JWT expired otomatis setelah durasi tertentu (misal 8 jam), user harus login ulang.

### CRUD NVR
- Tambah NVR gagal divalidasi (ditolak) kalau IP/port tidak valid format, atau IP+port duplikat dengan NVR yang sudah ada.
- Hapus NVR harus konfirmasi dulu (tidak boleh hapus langsung sekali klik), dan ikut menghapus channel/HDD/log terkait (cascade) atau soft-delete (`is_active = false`) supaya histori tetap ada.
- Field password tidak ditampilkan ulang di form edit (hanya bisa "ganti password baru", tidak bisa lihat password lama).

### PCNVR Agent
- Device berstatus `AGENT_STALE` jika tidak menerima heartbeat melebihi 2x interval yang disepakati.
- Request agent ditolak (401) jika token tidak valid/sudah di-rotate.
- Push status dari agent tidak boleh menimpa data kamera per-channel dengan data kosong/null (kalau agent gagal baca, biarkan data terakhir yang valid tetap tersimpan, tandai `last_checked_at` saja).

# 13. State Definition

## Camera Status
- ONLINE
- OFFLINE
- VIDEO_LOSS
- NETWORK_TIMEOUT
- AUTH_FAILED
- UNKNOWN

## Recording Status
- RECORDING
- NO_RECORDING
- DISK_FULL
- HDD_ERROR
- UNKNOWN

*Catatan: untuk device tipe `pcnvr`, ada state tambahan khusus terkait kondisi agent — lihat Section 16.1 PCNVR Agent Contract.*

## Alarm Severity
- Critical: NVR Offline, HDD Error, Recording Stop
- Warning: Camera Offline, HDD >90%
- Info: Manual Refresh, Login, Konfigurasi

# 14. Security Requirements
- Password NVR dienkripsi menggunakan AES-256-GCM.
- Encryption key disimpan pada Environment Variable.
- Password tidak pernah dikirim kembali ke frontend.
- Semua akses API menggunakan JWT.

# 15. Audit Log
Simpan aktivitas:
- Login
- Logout
- Tambah/Edit/Hapus NVR
- Manual Refresh
- Perubahan konfigurasi
- Regenerate Agent Token (khusus PCNVR)

**Retention**: log disimpan default 90 hari, auto-purge via scheduled job supaya tabel tidak terus membesar. Durasi retensi sebaiknya dibuat configurable (env var), bukan hardcode, kalau kebutuhan compliance/audit internal berubah.

# 16. API Draft
- GET /api/dashboard
- GET /api/nvr
- POST /api/nvr
- PUT /api/nvr/:id
- DELETE /api/nvr/:id
- POST /api/nvr/:id/poll
- GET /api/nvr/:id/channels
- GET /api/nvr/:id/hdd
- POST /api/nvr/:id/regenerate-token *(khusus tipe `pcnvr`)*

*Endpoint khusus untuk agent PCNVR (push, bukan poll) dijelaskan terpisah di Section 16.1.*

# 16.1 PCNVR Agent Contract
Khusus untuk device tipe `pcnvr`, flow datanya **push dari agent**, bukan poll dari backend seperti NVR hardware. Bagian ini menyamakan state, endpoint, dan keamanan token supaya konsisten dengan device hardware.

## State Tambahan (khusus PCNVR)
- `AGENT_OFFLINE` - agent belum pernah heartbeat / token belum pernah dipakai.
- `AGENT_STALE` - agent sebelumnya aktif, tapi tidak heartbeat melebihi threshold (misal > 2x interval heartbeat yang disepakati, default heartbeat 60 detik → stale jika > 120 detik tanpa report).
- State kamera (`ONLINE`/`OFFLINE`/`VIDEO_LOSS`/dst) dan recording tetap pakai state yang sama di Section 13, hanya sumber datanya beda (dari ISAPI lokal PCNVR jika tersedia, atau dari hasil baca agent jika tidak).

## Endpoint Tambahan
- `POST /api/agent/:nvr_id/heartbeat` - dipanggil agent secara periodik, berisi timestamp + status proses PCNVR (running/stopped). Backend update `last_heartbeat_at`.
- `POST /api/agent/:nvr_id/status` - dipanggil agent untuk push data detail: status disk (capacity/used/free), status recording per channel (berdasarkan cek timestamp file rekaman), dan status kamera per channel (jika agent juga punya akses ke ISAPI lokal).
- Backend job berkala (mirip polling worker NVR hardware) mengecek `last_heartbeat_at` semua PCNVR; jika melewati threshold, ubah status jadi `AGENT_STALE` tanpa menunggu push selanjutnya.

## Token Handling
- `agent_token` di-generate backend saat NVR tipe `pcnvr` dibuat (random string, panjang minimal 32 karakter, disimpan hashed di DB - mirip pola simpan password, jangan plaintext).
- Token dikirim manual (di luar sistem, misal lewat chat/email internal) ke yang setup agent di PC tersebut, dimasukkan ke config file agent.
- Setiap request dari agent (`heartbeat`/`status`) wajib menyertakan token di header (misal `X-Agent-Token`), divalidasi terhadap hash di DB.
- Token bisa di-rotate manual dari dashboard (tombol "Regenerate Token"), token lama otomatis invalid begitu yang baru di-generate.
- Tidak perlu expiry otomatis di MVP, tapi field `agent_token` perlu kolom `rotated_at` untuk audit kapan terakhir diganti.

# 17. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Firmware berbeda | Adapter per versi ISAPI |
| Password berubah | Tandai AUTH_FAILED |
| Network putus | Timeout + Retry |
| HDD rusak | Critical Alert |
| Banyak NVR | Worker Queue & Concurrent Polling |

# 18. Scalability
- Worker polling asynchronous.
- Maksimal 10 concurrent polling (configurable).
- Frontend hanya membaca database/cache.
- Siap ditingkatkan menggunakan Redis Queue apabila jumlah NVR bertambah.
- **Backoff strategy**: NVR yang berstatus `OFFLINE`/`AUTH_FAILED`/`NETWORK_TIMEOUT` tidak di-retry dengan interval normal terus-menerus, melainkan exponential backoff (misal mulai 1x interval, lalu 2x, 4x, maksimal capped di angka tertentu misal 10x interval normal), supaya resource polling tidak terbuang ke device yang sudah jelas bermasalah. Begitu device kembali `ONLINE`, interval kembali normal.

# 19. Future Architecture
- Backend API
- Polling Worker
- PostgreSQL
- React Frontend
- Telegram Notification Worker
- PC Agent untuk PCNVR
