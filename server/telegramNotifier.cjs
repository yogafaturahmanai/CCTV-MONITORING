/**
 * telegramNotifier.cjs
 * Modul untuk mengirim notifikasi dan laporan status CCTV ke Telegram.
 *
 * Env vars yang dibutuhkan:
 *   TELEGRAM_BOT_TOKEN  — Token dari @BotFather
 *   TELEGRAM_CHAT_ID    — ID grup/channel tujuan (format: -100xxxxxxxxxx)
 */

const https = require('https');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8179493228:AAFXGyEc7p3vqgHSjdMRjZ77awQ1gBisevg';
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '-1004330317354';

// ─────────────────────────────────────────────
// Helper: Kirim pesan ke Telegram via Bot API
// ─────────────────────────────────────────────
const sendTelegramMessage = (text, targetChatId = CHAT_ID) => {
  return new Promise((resolve, reject) => {
    if (!BOT_TOKEN || !targetChatId) {
      console.warn('[Telegram] TELEGRAM_BOT_TOKEN atau targetChatId belum dikonfigurasi.');
      return resolve(false);
    }

    const body = JSON.stringify({
      chat_id: targetChatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) {
            console.log('[Telegram] Pesan terkirim.');
            resolve(true);
          } else {
            console.error('[Telegram] API Error:', json.description);
            resolve(false);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[Telegram] Request gagal:', e.message);
      resolve(false);
    });

    req.write(body);
    req.end();
  });
};

// ─────────────────────────────────────────────
// Helper: Format ukuran bytes / MB ke GB
// ─────────────────────────────────────────────
const formatGB = (mb) => (mb / 1024).toFixed(1) + ' GB';

// ─────────────────────────────────────────────
// Alert Real-time
// severity: 'critical' | 'warning' | 'info'
// ─────────────────────────────────────────────
const sendAlert = async (severity, title, message) => {
  const icons = {
    critical: '🔴',
    warning:  '🟡',
    info:     '🟢'
  };
  const icon = icons[severity] || '⚪';
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const text =
    `${icon} *${title}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${message}\n` +
    `🕐 _${now} WIB_`;

  return sendTelegramMessage(text);
};

// ─────────────────────────────────────────────
// Laporan Harian / Manual Report
// ─────────────────────────────────────────────
const sendDailyReport = async (targetChatId = CHAT_ID) => {
  try {
    const nvrs = await prisma.nVR.findMany({
      where: { is_active: true },
      include: { channels: true, hdds: true },
      orderBy: [{ site: 'asc' }, { name: 'asc' }]
    });

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit', minute: '2-digit'
    });

    // Kalkulasi summary global
    let totalOnline = 0;
    let totalOffline = 0;
    let totalCamOnline = 0;
    let totalCamOffline = 0;
    let hddWarningCount = 0;
    const offlineCameraDetails = [];

    nvrs.forEach(nvr => {
      // Status NVR
      let nvrIsOnline = false;
      if (nvr.type === 'pcnvr') {
        if (nvr.last_heartbeat_at) {
          const diff = (new Date() - new Date(nvr.last_heartbeat_at)) / 1000;
          nvrIsOnline = diff <= 40;
        }
      } else {
        const hasChannel = nvr.channels && nvr.channels.length > 0;
        if (!hasChannel) {
          nvrIsOnline = true; // Assume online if no channel data yet
        } else {
          nvrIsOnline = nvr.channels.some(c =>
            c.last_status === 'ONLINE' || c.last_status === 'RECORDING'
          );
        }
      }

      if (nvrIsOnline) totalOnline++; else totalOffline++;

      // Status kamera
      (nvr.channels || []).forEach(ch => {
        if (ch.last_status === 'ONLINE') {
          totalCamOnline++;
        } else {
          totalCamOffline++;
          offlineCameraDetails.push({
            nvrName: nvr.name,
            site: nvr.site,
            cameraName: ch.camera_name,
            ip: nvr.ip_address
          });
        }
      });

      // Status HDD
      (nvr.hdds || []).forEach(hdd => {
        const usedPct = hdd.capacity_mb > 0
          ? ((hdd.capacity_mb - hdd.freespace_mb) / hdd.capacity_mb) * 100
          : 0;
        if (usedPct > 90) hddWarningCount++;
      });
    });

    const totalCam = totalCamOnline + totalCamOffline;
    const totalNvr = totalOnline + totalOffline;

    // ── Header Summary ──────────────────────────────────────────
    let report =
      `📊 *LAPORAN STATUS CCTV ATI*\n` +
      `📅 ${dateStr} • ${timeStr} WIB\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ *NVR Online*: ${totalOnline} / ${totalNvr}\n` +
      `📷 *Kamera Online*: ${totalCamOnline} / ${totalCam}\n`;

    if (hddWarningCount > 0) {
      report += `⚠️ *HDD >90%*: ${hddWarningCount} disk\n`;
    } else {
      report += `💾 *HDD*: Semua normal\n`;
    }

    // ── Detail per NVR ──────────────────────────────────────────
    report += `\n📌 *Detail per NVR:*\n`;

    for (const nvr of nvrs) {
      // Tentukan status ikon
      let nvrIsOnline = false;
      if (nvr.type === 'pcnvr') {
        if (nvr.last_heartbeat_at) {
          const diff = (new Date() - new Date(nvr.last_heartbeat_at)) / 1000;
          nvrIsOnline = diff <= 40;
        }
      } else {
        const hasChannel = nvr.channels && nvr.channels.length > 0;
        nvrIsOnline = !hasChannel || nvr.channels.some(c =>
          c.last_status === 'ONLINE' || c.last_status === 'RECORDING'
        );
      }

      const nvrIcon = nvrIsOnline ? '🟢' : '🔴';
      const camOnline = (nvr.channels || []).filter(c => c.last_status === 'ONLINE').length;
      const camTotal  = (nvr.channels || []).length;

      let nvrLine = `${nvrIcon} *${nvr.name}* _(${nvr.site})_`;
      if (camTotal > 0) {
        nvrLine += ` | 📷 ${camOnline}/${camTotal}`;
      }

      // HDD Info per disk
      if (nvr.hdds && nvr.hdds.length > 0) {
        const hddTexts = nvr.hdds.map(hdd => {
          const usedPct = hdd.capacity_mb > 0
            ? Math.round(((hdd.capacity_mb - hdd.freespace_mb) / hdd.capacity_mb) * 100)
            : 0;
          const freeGB = formatGB(hdd.freespace_mb);
          const diskLabel = hdd.disk_id.replace(':\\\\', ':').replace(':/', ':');
          const hddIcon = hdd.status === 'error' ? '🔴' : (usedPct > 90 ? '🟡' : '💾');
          return `${hddIcon}${diskLabel} ${usedPct}% (sisa ${freeGB})`;
        });
        nvrLine += `\n    ${hddTexts.join(' | ')}`;
      }

      report += nvrLine + '\n';
    }

    // ── Kamera Offline Detail ────────────────────────────────────
    if (offlineCameraDetails.length > 0) {
      report += `\n🔴 *Kamera Offline (${offlineCameraDetails.length}):*\n`;
      // Batasi maksimal 20 baris agar pesan tidak terlalu panjang
      const limit = Math.min(offlineCameraDetails.length, 20);
      for (let i = 0; i < limit; i++) {
        const cam = offlineCameraDetails[i];
        report += `  • *${cam.cameraName}* — ${cam.nvrName} (${cam.site}) \`${cam.ip}\`\n`;
      }
      if (offlineCameraDetails.length > 20) {
        report += `  _...dan ${offlineCameraDetails.length - 20} kamera lainnya._\n`;
      }
    }

    report += `\n_Laporan otomatis dari CCTV Monitoring Dashboard_`;

    return sendTelegramMessage(report, targetChatId);
  } catch (err) {
    console.error('[Telegram Report Error]', err.message);
    return false;
  }
};

// ─────────────────────────────────────────────
// Scheduler Harian (08:00 & 18:00 WIB)
// Dipanggil sekali saat server start, lalu
// dicek setiap menit apakah waktunya kirim.
// ─────────────────────────────────────────────
let lastDailyReportHour = -1;

const checkDailyReportSchedule = () => {
  const now = new Date();
  // Konversi ke WIB (UTC+7)
  const wibHour   = (now.getUTCHours() + 7) % 24;
  const wibMinute = now.getUTCMinutes();

  // Kirim pada jam 06:00, 15:00, dan 21:00 WIB (toleransi menit 0-1)
  const isScheduledHour = (wibHour === 6 || wibHour === 15 || wibHour === 21) && wibMinute === 0;

  if (isScheduledHour && lastDailyReportHour !== wibHour) {
    lastDailyReportHour = wibHour;
    console.log(`[Telegram] Mengirim laporan harian (${wibHour}:00 WIB)...`);
    sendDailyReport();
  }

  // Reset supaya bisa kirim lagi di jam berikutnya
  if (wibMinute > 5) {
    lastDailyReportHour = -1;
  }
};

// ─────────────────────────────────────────────
// Listener Pesan Masuk (Telegram Long Polling)
// ─────────────────────────────────────────────
let lastUpdateId = 0;

const runTelegramBotListener = async () => {
  if (!BOT_TOKEN) return;
  
  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`,
    method: 'GET',
    timeout: 35000 // sedikit lebih besar dari timeout API telegram
  };

  const req = https.get(options, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', async () => {
      try {
        const json = JSON.parse(data);
        if (json.ok && json.result) {
          for (const update of json.result) {
            lastUpdateId = update.update_id;
            
            const message = update.message;
            if (message && message.text) {
              const text = message.text.trim().toLowerCase();
              
              // Menerima perintah: /report, report, /status, atau status
              if (text === '/report' || text === 'report' || text === '/status' || text === 'status') {
                console.log(`[Telegram Bot] Menerima request manual report dari Chat ID: ${message.chat.id}`);
                await sendTelegramMessage("⏳ _Sedang memproses laporan status CCTV, mohon tunggu..._", message.chat.id);
                await sendDailyReport(message.chat.id);
              }
            }
          }
        }
      } catch (e) {
        // Abaikan parse error
      }
      // Poll lagi setelah 1 detik
      setTimeout(runTelegramBotListener, 1000);
    });
  });

  req.on('error', (e) => {
    // Jika koneksi gagal, coba lagi dalam 5 detik
    console.error('[Telegram Listener Error]', e.message);
    setTimeout(runTelegramBotListener, 5000);
  });
  
  req.on('timeout', () => {
    req.destroy();
  });
};

// Jalankan listener bot setelah server start 5 detik
setTimeout(runTelegramBotListener, 5000);

module.exports = {
  sendTelegramMessage,
  sendAlert,
  sendDailyReport,
  checkDailyReportSchedule
};
