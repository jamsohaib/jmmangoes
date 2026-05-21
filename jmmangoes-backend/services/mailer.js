const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) return { skipped: true, reason: 'Missing SMTP credentials' };
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  return t.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

module.exports = {
  sendMail,
};

