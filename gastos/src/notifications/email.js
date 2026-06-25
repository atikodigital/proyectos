let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  // nodemailer es una dependencia opcional — si no está instalado, el módulo falla
  // graciosamente y solo se envía por WhatsApp.
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch (e) { return null; }
  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text,
    });
    return true;
  } catch (e) {
    console.error('[email]', e.message);
    return false;
  }
}

module.exports = { sendEmail };
