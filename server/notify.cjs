/**
 * notify.cjs
 * Titik masuk tunggal untuk alert real-time — broadcast ke semua channel
 * notifikasi yang aktif (Telegram & Email).
 */

const { sendAlert: sendTelegramAlert } = require('./telegramNotifier.cjs');
const { sendEmailAlert } = require('./emailNotifier.cjs');

const notify = (severity, title, message) => {
  sendTelegramAlert(severity, title, message);
  sendEmailAlert(severity, title, message);
};

module.exports = { notify };
