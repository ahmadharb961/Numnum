// Minimal email hook. Dashboard notifications are always stored; email is
// best-effort and only sent when SMTP_URL is configured. Without a mail
// transport installed we log instead of pretending to send.

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!process.env.SMTP_URL) return false;
  try {
    const mod = (await import(/* webpackIgnore: true */ "nodemailer" as string).catch(() => null)) as
      | { createTransport: (url: string) => { sendMail: (o: object) => Promise<unknown> } }
      | null;
    if (!mod) {
      console.warn("[email] SMTP_URL set but nodemailer is not installed; skipping email to", to);
      return false;
    }
    await mod.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.EMAIL_FROM, to, subject, text });
    return true;
  } catch (e) {
    console.error("[email] failed", e);
    return false;
  }
}
