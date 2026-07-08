/**
 * emailNotifier.cjs
 * Modul untuk mengirim notifikasi alert dan laporan status CCTV menggunakan Email (SMTP).
 * Channel notifikasi kedua, berjalan paralel dengan Telegram (telegramNotifier.cjs).
 *
 * Env vars yang dibutuhkan:
 *   SMTP_HOST     — Host server SMTP (contoh: smtp.gmail.com)
 *   SMTP_PORT     — Port SMTP (587 untuk STARTTLS, 465 untuk SSL)
 *   SMTP_SECURE   — "true" untuk port 465 (SSL), "false" untuk port lain (STARTTLS)
 *   SMTP_USER     — Username/alamat email pengirim
 *   SMTP_PASS     — Password / App Password
 *   EMAIL_FROM    — Alamat pengirim yang ditampilkan (default: SMTP_USER)
 *   EMAIL_TO      — Alamat penerima laporan/alert (pisahkan koma untuk multi-penerima)
 */

const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;
const EMAIL_TO = process.env.EMAIL_TO;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_TO) {
  console.warn('[Email] SMTP_HOST/SMTP_USER/SMTP_PASS/EMAIL_TO belum lengkap di .env. Notifikasi Email tidak akan terkirim.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
});

// ─────────────────────────────────────────────
// Helper: Kirim Email
// ─────────────────────────────────────────────
const sendEmail = async (subject, html, toAddress = EMAIL_TO) => {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !toAddress) {
    console.warn('[Email] Konfigurasi SMTP/EMAIL_TO belum lengkap.');
    return false;
  }
  try {
    const info = await transporter.sendMail({ from: EMAIL_FROM, to: toAddress, subject, html });
    console.log(`[Email] Berhasil dikirim ke ${toAddress}: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error('[Email] Gagal mengirim email:', err.message);
    return false;
  }
};

const mdToHtml = (text) => text
  .replace(/\n/g, '<br>')
  .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
  .replace(/_(.*?)_/g, '<em>$1</em>')
  .replace(/`(.*?)`/g, '<code style="background:#f1f5f9;padding:2px 4px;border-radius:4px">$1</code>');

// ─────────────────────────────────────────────
// Alert Real-time (Email)
// severity: 'critical' | 'warning' | 'info'
// ─────────────────────────────────────────────
const sendEmailAlert = async (severity, title, message) => {
  const icons = { critical: '🔴', warning: '🟡', info: '🟢' };
  const icon = icons[severity] || '⚪';
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const subject = `${icon} CCTV ALERT: ${title}`;

  const html = `
    <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <h2 style="color: ${severity === 'critical' ? '#dc2626' : '#d97706'}; margin-top: 0;">${icon} ${title}</h2>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 20px;">${mdToHtml(message)}</p>
      <div style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 20px;">
        Waktu Kejadian: <strong>${now} WIB</strong><br>
        <em>Dikirim secara otomatis oleh CCTV Monitoring Dashboard</em>
      </div>
    </div>
  `;

  return sendEmail(subject, html);
};

// ─────────────────────────────────────────────
// Laporan Harian / Manual Report (Email)
// ─────────────────────────────────────────────
const sendEmailDailyReport = async (toAddress = EMAIL_TO) => {
  try {
    const nvrs = await prisma.nVR.findMany({
      where: { is_active: true },
      include: { channels: true, hdds: true },
      orderBy: [{ site: 'asc' }, { name: 'asc' }]
    });

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

    let totalOnline = 0, totalOffline = 0, totalCamOnline = 0, totalCamOffline = 0, hddWarningCount = 0;
    const offlineCameraDetails = [];

    const isNvrOnline = (nvr) => {
      if (nvr.type === 'pcnvr') {
        if (!nvr.last_heartbeat_at) return false;
        return (new Date() - new Date(nvr.last_heartbeat_at)) / 1000 <= 40;
      }
      const hasChannel = nvr.channels && nvr.channels.length > 0;
      return !hasChannel || nvr.channels.some(c => c.last_status === 'ONLINE' || c.last_status === 'RECORDING');
    };

    nvrs.forEach(nvr => {
      if (isNvrOnline(nvr)) totalOnline++; else totalOffline++;

      (nvr.channels || []).forEach(ch => {
        if (ch.last_status === 'ONLINE') {
          totalCamOnline++;
        } else {
          totalCamOffline++;
          offlineCameraDetails.push({ nvrName: nvr.name, site: nvr.site, cameraName: ch.camera_name, ip: nvr.ip_address });
        }
      });

      (nvr.hdds || []).forEach(hdd => {
        const usedPct = hdd.capacity_mb > 0 ? ((hdd.capacity_mb - hdd.freespace_mb) / hdd.capacity_mb) * 100 : 0;
        if (usedPct > 90) hddWarningCount++;
      });
    });

    const totalCam = totalCamOnline + totalCamOffline;
    const totalNvr = totalOnline + totalOffline;
    const subject = `📊 LAPORAN STATUS CCTV ATI - ${dateStr}`;

    let nvrRowsHtml = '';
    nvrs.forEach(nvr => {
      const nvrIsOnline = isNvrOnline(nvr);
      const nvrIcon = nvrIsOnline ? '🟢' : '🔴';
      const camOnline = (nvr.channels || []).filter(c => c.last_status === 'ONLINE').length;
      const camTotal = (nvr.channels || []).length;
      const typeLabel = nvr.type === 'pcnvr'
        ? `PC IVMS · Agent ${nvrIsOnline ? 'Ok' : 'Offline'}`
        : 'Hardware NVR';

      let hddInfoHtml = '<em style="color:#94a3b8">Tidak ada HDD</em>';
      if (nvr.hdds && nvr.hdds.length > 0) {
        hddInfoHtml = nvr.hdds.map(hdd => {
          const usedPct = hdd.capacity_mb > 0 ? Math.round(((hdd.capacity_mb - hdd.freespace_mb) / hdd.capacity_mb) * 100) : 0;
          const freeGB = (hdd.freespace_mb / 1024).toFixed(1) + ' GB';
          const statusSuffix = nvr.type !== 'pcnvr'
            ? ` &middot; <span style="color:${hdd.status === 'normal' ? '#16a34a' : '#dc2626'}">${hdd.status.charAt(0).toUpperCase() + hdd.status.slice(1)}</span>`
            : '';
          const color = hdd.status === 'error' ? '#dc2626' : (usedPct > 90 ? '#d97706' : '#0f172a');
          return `<span style="margin-right: 12px; color: ${color}; font-size: 13px;">💾 <strong>Disk ${hdd.disk_id}</strong>: ${usedPct}% (sisa ${freeGB})${statusSuffix}</span>`;
        }).join('<br>');
      }

      nvrRowsHtml += `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 8px; font-weight: 600;">${nvrIcon} ${nvr.name} <span style="font-weight:normal;color:#64748b;font-size:12px">(${nvr.site})</span><br><span style="font-weight:normal;color:#94a3b8;font-size:11px">${typeLabel}</span></td>
          <td style="padding: 12px 8px; font-size: 13px;">📷 ${camOnline} / ${camTotal}</td>
          <td style="padding: 12px 8px; font-size: 13px; line-height: 1.4;">${hddInfoHtml}</td>
        </tr>
      `;
    });

    let offlineCamsHtml = '';
    if (offlineCameraDetails.length > 0) {
      offlineCamsHtml = `
        <div style="margin-top: 25px; padding: 15px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
          <h3 style="color: #991b1b; margin-top: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">🔴 Kamera Offline (${offlineCameraDetails.length})</h3>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #7f1d1d; line-height: 1.6;">
            ${offlineCameraDetails.map(c => `<li><strong>${c.cameraName}</strong> &mdash; NVR ${c.nvrName} (${c.site}) [${c.ip}]</li>`).join('')}
          </ul>
        </div>
      `;
    }

    const html = `
      <div style="font-family: 'Poppins', sans-serif; max-width: 800px; margin: auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
        <h2 style="color: #2563eb; margin-top: 0; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">📊 Laporan Status CCTV ATI</h2>
        <p style="font-size: 13px; color: #64748b; margin-top: -5px; margin-bottom: 25px;">
          Tanggal: <strong>${dateStr}</strong> &bull; Waktu: <strong>${timeStr} WIB</strong>
        </p>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; text-align: center;">
            <span style="font-size: 12px; color: #166534; font-weight: 600; text-transform: uppercase;">NVR Online</span>
            <div style="font-size: 20px; font-weight: 700; color: #15803d; margin-top: 4px;">${totalOnline} / ${totalNvr}</div>
          </div>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px; border-radius: 8px; text-align: center;">
            <span style="font-size: 12px; color: #1e40af; font-weight: 600; text-transform: uppercase;">Kamera Online</span>
            <div style="font-size: 20px; font-weight: 700; color: #1d4ed8; margin-top: 4px;">${totalCamOnline} / ${totalCam}</div>
          </div>
          <div style="background: ${hddWarningCount > 0 ? '#fffbeb' : '#f8fafc'}; border: 1px solid ${hddWarningCount > 0 ? '#fde68a' : '#e2e8f0'}; padding: 12px; border-radius: 8px; text-align: center;">
            <span style="font-size: 12px; color: ${hddWarningCount > 0 ? '#92400e' : '#475569'}; font-weight: 600; text-transform: uppercase;">HDD &gt;90%</span>
            <div style="font-size: 20px; font-weight: 700; color: ${hddWarningCount > 0 ? '#b45309' : '#0f172a'}; margin-top: 4px;">${hddWarningCount} Disk</div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
              <th style="padding: 10px 8px; font-size: 12px; color: #475569; text-transform: uppercase;">NVR</th>
              <th style="padding: 10px 8px; font-size: 12px; color: #475569; text-transform: uppercase;">Kamera</th>
              <th style="padding: 10px 8px; font-size: 12px; color: #475569; text-transform: uppercase;">HDD</th>
            </tr>
          </thead>
          <tbody>${nvrRowsHtml}</tbody>
        </table>

        ${offlineCamsHtml}

        <div style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 30px; text-align: center;">
          Laporan otomatis dari CCTV Monitoring Dashboard.
        </div>
      </div>
    `;

    return sendEmail(subject, html, toAddress);
  } catch (err) {
    console.error('[Email Report Error]', err.message);
    return false;
  }
};

// ─────────────────────────────────────────────
// Scheduler Harian (06:00, 15:00, & 21:00 WIB)
// ─────────────────────────────────────────────
let lastDailyReportHour = -1;

const checkDailyEmailReportSchedule = () => {
  const now = new Date();
  const wibHour = (now.getUTCHours() + 7) % 24;
  const wibMinute = now.getUTCMinutes();
  const isScheduledHour = (wibHour === 6 || wibHour === 15 || wibHour === 21) && wibMinute === 0;

  if (isScheduledHour && lastDailyReportHour !== wibHour) {
    lastDailyReportHour = wibHour;
    console.log(`[Email] Mengirim laporan harian (${wibHour}:00 WIB)...`);
    sendEmailDailyReport();
  }

  if (wibMinute > 5) {
    lastDailyReportHour = -1;
  }
};

module.exports = {
  sendEmailAlert,
  sendEmailDailyReport,
  checkDailyEmailReportSchedule
};
