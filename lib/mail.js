/**
 * Optional e-mail notification to a seller. Enabled when SMTP_HOST is set and `nodemailer` is installed.
 * Inquiries are always stored in the seller's dashboard inbox, so a mail failure never loses a message.
 */
export async function notifySeller({ to, subject, text, replyTo }) {
  if (!process.env.SMTP_HOST) return false;
  try {
    const name = 'nodemailer';
    const nodemailer = (await import(/* webpackIgnore: true */ name)).default;
    const port = Number(process.env.SMTP_PORT) || 587;
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, replyTo, subject, text });
    return true;
  } catch (e) {
    console.error('[mail] failed:', e.message);
    return false;
  }
}
