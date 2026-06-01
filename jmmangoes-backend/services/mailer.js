const nodemailer = require('nodemailer');

let transporter = null;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtmlParagraphs(text = '') {
  const safe = escapeHtml(text || '');
  return safe
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px 0; line-height:1.6; color:#1f2937;">${block.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function buildBrandedEmailHtml({ subject = '', html = '', text = '' }) {
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  const logoUrl = `${clientOrigin.replace(/\/$/, '')}/images/JM_Mangoes_Logo.png`;
  const bodyContent = String(html || '').trim() || textToHtmlParagraphs(text || '');
  const safeSubject = escapeHtml(subject || 'JM Mangoes Update');

  return `
  <div style="background:#f6f8f7;padding:24px 10px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="padding:18px 22px;background:#0f5132;color:#ffffff;">
        <h2 style="margin:0;font-size:20px;font-weight:700;">${safeSubject}</h2>
      </div>
      <div style="padding:22px;">
        ${bodyContent}
        <p style="margin:18px 0 0 0;line-height:1.6;color:#1f2937;">Warm regards,<br/><strong>Team JM Mangoes</strong></p>
      </div>
      <div style="padding:16px 22px;border-top:1px solid #e5e7eb;background:#fafafa;text-align:center;">
        <img src="${logoUrl}" alt="JM Mangoes" style="max-width:180px;width:100%;height:auto;object-fit:contain;" />
        <p style="margin:10px 0 0 0;font-size:12px;color:#6b7280;">Freshness with trust from JM Mangoes.</p>
        <p style="margin:10px 0 0 0;font-size:12px;line-height:1.7;color:#4b5563;">
          Website: <a href="https://jmmangoes.pk" style="color:#0f5132;text-decoration:none;">jmmangoes.pk</a> |
          WhatsApp: <a href="https://wa.me/923218869344" style="color:#0f5132;text-decoration:none;">+92 321 8869344</a><br/>
          Facebook: <a href="https://www.facebook.com/jmmangoes1993" style="color:#0f5132;text-decoration:none;">JM Mangoes</a> |
          Instagram: <a href="https://www.instagram.com/jmmangoes1993" style="color:#0f5132;text-decoration:none;">@jmmangoes1993</a>
        </p>
      </div>
    </div>
  </div>`;
}

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
  const brandedHtml = buildBrandedEmailHtml({ subject, html, text });
  return t.sendMail({
    from,
    to,
    subject,
    text,
    html: brandedHtml,
  });
}

module.exports = {
  sendMail,
};
