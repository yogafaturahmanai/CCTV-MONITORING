/**
 * emailNotifier.cjs
 * Modul untuk mengirim notifikasi alert dan laporan status CCTV menggunakan Email (SMTP).
 *
 * Env vars yang dapat dikonfigurasi di Dokploy:
 *   SMTP_HOST     — Host server SMTP (e.g. smtp.atibusinessgroup.com atau internal IP)
 *   SMTP_PORT     — Port SMTP (default: 587 atau 25)
 *   SMTP_SECURE   — true untuk port 465, false untuk port lain (default: false)
 *   SMTP_USER     — Username SMTP jika membutuhkan auth
 *   SMTP_PASS     — Password SMTP jika membutuhkan auth
 *   EMAIL_FROM    — Alamat pengirim (default: "CCTV Dashboard" <cctv@atibusinessgroup.com>)
 *   EMAIL_TO      — Alamat penerima laporan/alert (default: admin@atibusinessgroup.com)
 */

const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Konfigurasi SMTP
const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com', // fallback ke gmail
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined,
  tls: {
    rejectUnauthorized: false // Bypass SSL check jika menggunakan mail server internal/self-signed
  }
};

const EMAIL_FROM = process.env.EMAIL_FROM || '"CCTV Dashboard" <cctv@atibusinessgroup.com>';
const EMAIL_TO = process.env.EMAIL_TO || 'admin@atibusinessgroup.com';

const transporter = nodemailer.createTransport(smtpConfig);

// ─────────────────────────────────────────────
// Helper: Kirim Email General
// ─────────────────────────────────────────────
const sendEmail = async (subject, html, toAddress = EMAIL_TO) => {
  try {
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: toAddress,
      subject: subject,
      html: html
    });
    console.log(`[Email] Berhasil dikirim ke ${toAddress}: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error('[Email Error] Gagal mengirim email:', err.message);
    return false;
  }
};

// ─────────────────────────────────────────────
// Alert Real-time (Email)
// ─────────────────────────────────────────────
const sendEmailAlert = async (severity, title, message) => {
  const icons = {
    critical: '🔴',
    warning:  '🟡',
    info:     '🟢'
  };
  const icon = icons[severity] || '⚪';
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const subject = `${icon} CCTV ALERT: ${title}`;
  
  // Format message to HTML (replace linebreaks and markdown bold/italic)
  const formattedMsg = message
    .replace(/\n/g, '<br>')
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:#f1f5f9;padding:2px 4px;border-radius:4px">$1</code>');

  const html = `
    <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <h2 style="color: ${severity === 'critical' ? '#dc2626' : '#d97706'}; margin-top: 0; display: flex; align-items: center; gap: 8px;">
        ${icon} ${title}
      </h2>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
        ${formattedMsg}
      </p>
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
    const dateStr = now.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit', minute: '2-digit'
    });

    // Kalkulasi metrics
    let totalOnline = 0;
    let totalOffline = 0;
    let totalCamOnline = 0;
    let totalCamOffline = 0;
    let hddWarningCount = 0;
    const offlineCameraDetails = [];

    nvrs.forEach(nvr => {
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

      if (nvrIsOnline) totalOnline++; else totalOffline++;

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

      (nvr.hdds || []).forEach(hdd => {
        const usedPct = hdd.capacity_mb > 0
          ? ((hdd.capacity_mb - hdd.freespace_mb) / hdd.capacity_mb) * 100
          : 0;
        if (usedPct > 90) hddWarningCount++;
      });
    });

    const totalCam = totalCamOnline + totalCamOffline;
    const totalNvr = totalOnline + totalOffline;

    const subject = `📊 LAPORAN STATUS CCTV ATI - ${dateStr}`;

    // Buat template detail per NVR
    let nvrRowsHtml = '';
    nvrs.forEach(nvr => {
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
      const nvrStatusText = nvrIsOnline ? 'ONLINE' : 'OFFLINE';
      const camOnline = (nvr.channels || []).filter(c => c.last_status === 'ONLINE').length;
      const camTotal  = (nvr.channels || []).length;
      
      // HDD string
      let hddInfoHtml = '<em style="color:#94a3b8">Tidak ada HDD</em>';
      if (nvr.hdds && nvr.hdds.length > 0) {
        hddInfoHtml = nvr.hdds.map(hdd => {
          const usedPct = hdd.capacity_mb > 0
            ? Math.round(((hdd.capacity_mb - hdd.freespace_mb) / hdd.capacity_mb) * 100)
            : 0;
          const freeGB = (hdd.freespace_mb / 1024).toFixed(1) + ' GB';
          const diskLabel = hdd.disk_id.replace(':\\\\', ':').replace(':/', ':');
          const color = hdd.status === 'error' ? '#dc2626' : (usedPct > 90 ? '#d97706' : '#0f172a');
          return `<span style="margin-right: 12px; color: ${color}; font-size: 13px;">💾 <strong>Disk ${diskLabel}</strong>: ${usedPct}% (sisa ${freeGB})</span>`;
        }).join('<br>');
      }

      nvrRowsHtml += `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 8px; font-weight: 600;">${nvrIcon} ${nvr.name} <span style="font-weight:normal;color:#64748b;font-size:12px">(${nvr.site})</span></td>
          <td style="padding: 12px 8px;"><span style="color: ${nvrIsOnline ? '#10b981' : '#ef4444'}; font-weight: 700; font-size: 12px;">${nvrStatusText}</span></td>
          <td style="padding: 12px 8px; font-size: 13px;">📷 ${camOnline} / ${camTotal}</td>
          <td style="padding: 12px 8px; font-size: 13px; line-height: 1.4;">${hddInfoHtml}</td>
        </tr>
      `;
    });

    // Buat template kamera offline
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
        <h2 style="color: #2563eb; margin-top: 0; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
          📊 Laporan Status CCTV ATI
        </h2>
        <p style="font-size: 13px; color: #64748b; margin-top: -5px; margin-bottom: 25px;">
          Tanggal: <strong>${dateStr}</strong> &bull; Waktu: <strong>${timeStr} WIB</strong>
        </p>

        <!-- KPI Strip -->
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
            <span style="font-size: 12px; color: ${hddWarningCount > 0 ? '#92400e' : '#475569'}; font-weight: 600; text-transform: uppercase;">Alert HDD</span>
            <div style="font-size: 20px; font-weight: 700; color: ${hddWarningCount > 0 ? '#b45309' : '#0f172a'}; margin-top: 4px;">${hddWarningCount} Disk</div>
          </div>
        </div>

        <!-- Table Details -->
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
              <th style="padding: 10px 8px; font-size: 12px; color: #475569; text-transform: uppercase;">Nama NVR</th>
              <th style="padding: 10px 8px; font-size: 12px; color: #475569; text-transform: uppercase;">Status</th>
              <th style="padding: 10px 8px; font-size: 12px; color: #475569; text-transform: uppercase;">Kamera</th>
              <th style="padding: 10px 8px; font-size: 12px; color: #475569; text-transform: uppercase;">Kapasitas HDD</th>
            </tr>
          </thead>
          <tbody>
            ${nvrRowsHtml}
          </tbody>
        </table>

        ${offlineCamsHtml}

        <div style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 30px; text-align: center;">
          Laporan ini digenerate secara berkala dari CCTV Monitoring System.<br>
          Untuk mengubah konfigurasi email penerima silakan edit environment variable di Dokploy.
        </div>
      </div>
    `;

    return sendEmail(subject, html);
  } catch (err) {
    console.error('[Email Report Error]', err.message);
    return false;
  }
};

// ─────────────────────────────────────────────
// Scheduler Harian (06:00, 15:00, dan 21:00 WIB)
// ─────────────────────────────────────────────
let lastDailyReportHour = -1;

const checkDailyEmailReportSchedule = () => {
  const now = new Date();
  const wibHour   = (now.getUTCHours() + 7) % 24;
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
