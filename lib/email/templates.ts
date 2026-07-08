/**
 * Branded transactional email templates. Navy + gold, same family as the app.
 * HARD RULES:
 *  - Customer emails use a branded CTA button, never a plain-text link.
 *  - No dashes in customer-facing copy: use commas, colons and full stops.
 */

const NAVY = "#081231";
const NAVY_CARD = "#0d1d4b";
const GOLD = "#f59e0b";
const TEXT = "#e8ecf6";
const MUTED = "#a8b2cc";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Outer shell shared by all customer emails. */
function shell(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${NAVY};color:${TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${NAVY_CARD};border:1px solid rgba(255,255,255,0.10);border-radius:18px;overflow:hidden;">
      <tr><td style="padding:28px 32px 8px 32px;">
        <div style="font-size:15px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">
          Be Care <span style="color:${GOLD};">Compliant</span>
        </div>
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;">
        <h1 style="margin:12px 0 8px 0;font-size:20px;line-height:1.3;color:#ffffff;font-weight:700;">${escapeHtml(opts.heading)}</h1>
        <div style="font-size:14px;line-height:1.6;color:${TEXT};">${opts.bodyHtml}</div>
      </td></tr>
      <tr><td style="padding:24px 32px 8px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:${GOLD};">
          <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:${NAVY};text-decoration:none;border-radius:12px;">${escapeHtml(opts.ctaLabel)}</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:20px 32px 28px 32px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(opts.footerNote)}</p>
      </td></tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0 auto;font-size:11px;color:${MUTED};text-align:center;">
      Be Care Compliant, compliance management for UK care providers.
    </p>
  </td></tr>
</table>
</body>
</html>`;
}

export function inviteSubject(companyName: string): string {
  return `You have been invited to ${companyName} on Be Care Compliant`;
}

/** Invite email for a new user. actionUrl is the one time secure link. */
export function inviteEmailHtml(opts: {
  companyName: string;
  inviterName: string;
  roleLabel: string;
  actionUrl: string;
}): string {
  const body = `
    <p style="margin:0 0 12px 0;">${escapeHtml(opts.inviterName)} has invited you to join
    <strong style="color:#ffffff;">${escapeHtml(opts.companyName)}</strong> on Be Care Compliant
    as <strong style="color:#ffffff;">${escapeHtml(opts.roleLabel)}</strong>.</p>
    <p style="margin:0;">Use the button below to set your password and sign in. This link is personal to you,
    so please do not forward it.</p>`;
  return shell({
    preheader: `Join ${opts.companyName} on Be Care Compliant.`,
    heading: "Your invitation",
    bodyHtml: body,
    ctaLabel: "Accept invitation",
    ctaUrl: opts.actionUrl,
    footerNote:
      "If you were not expecting this invitation you can ignore this email and no account will be created. This link expires for your security.",
  });
}
