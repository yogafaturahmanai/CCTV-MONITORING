/**
 * notify.cjs
 * Titik masuk tunggal untuk alert real-time.
 *
 * Alert cuma lewat Telegram. Email hanya dipakai untuk laporan
 * terjadwal (06:00/15:00/21:00 WIB) & test koneksi SMTP manual,
 * lihat emailNotifier.cjs — sengaja tidak ikut broadcast alert
 * real-time supaya inbox tidak kebanjiran tiap ada perubahan status.
 */

const { sendAlert: sendTelegramAlert } = require('./telegramNotifier.cjs');

const notify = (severity, title, message) => {
  sendTelegramAlert(severity, title, message);
};

module.exports = { notify };
