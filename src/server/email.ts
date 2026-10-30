import nodemailer from "nodemailer";

// Billing emails through an SMTP mailbox (e.g. Hostinger: smtp.hostinger.com:465).
// Dashboard notifications are always stored; email is best-effort and only sent
// when SMTP is configured.

let transport: nodemailer.Transporter | null = null;

function getTransport() {
  if (transport) return transport;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT || 465);
  transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  return transport;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
    return true;
  } catch (e) {
    console.error("[email] failed", e);
    return false;
  }
}
