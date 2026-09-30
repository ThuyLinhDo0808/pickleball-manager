// Deliver new feedback to the developer. Both channels are optional and independent:
//
//   Resend email:  RESEND_API_KEY + FEEDBACK_TO_EMAIL  (+ FEEDBACK_FROM_EMAIL)
//     Without your own verified domain, keep the default sender onboarding@resend.dev —
//     Resend then only delivers to the email address of your Resend account.
//
//   Webhook:       FEEDBACK_WEBHOOK_URL (+ optional FEEDBACK_WEBHOOK_SECRET, sent as
//     the X-Feedback-Secret header). Receives JSON; `text`/`content` make it readable
//     as-is by Slack- or Discord-style webhooks, and Zapier/Make/Apps Script can forward it by email.

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function summary({ message, contact, page, userEmail }) {
  return `📝 Góp ý mới — Pickleball Manager\n\n${message}\n\nTừ: ${userEmail || '—'}\nLiên hệ: ${contact || '—'}\nTrang: ${page || '—'}`;
}

async function sendEmail(fb) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (!key || !to) return 'not_configured';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.FEEDBACK_FROM_EMAIL || 'Pickleball Manager <onboarding@resend.dev>',
      to: to.split(',').map((s) => s.trim()).filter(Boolean),
      reply_to: fb.contact && /@/.test(fb.contact) ? fb.contact : undefined,
      subject: 'Góp ý mới — Pickleball Manager',
      text: summary(fb),
      html: `<p style="white-space:pre-wrap">${esc(fb.message)}</p><hr><p>Từ: ${esc(fb.userEmail)}<br>Liên hệ: ${esc(fb.contact || '—')}<br>Trang: ${esc(fb.page || '—')}</p>`,
    }),
  });
  return r.ok ? 'sent' : `failed_${r.status}`;
}

async function sendWebhook(fb) {
  const url = process.env.FEEDBACK_WEBHOOK_URL;
  if (!url) return 'not_configured';
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.FEEDBACK_WEBHOOK_SECRET) headers['X-Feedback-Secret'] = process.env.FEEDBACK_WEBHOOK_SECRET;
  const text = summary(fb);
  const r = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'feedback',
      message: fb.message,
      contact: fb.contact,
      page: fb.page,
      user_email: fb.userEmail,
      created_at: new Date().toISOString(),
      text,
      content: text.slice(0, 1900), // Discord limit
    }),
    signal: AbortSignal.timeout(8000),
  });
  return r.ok ? 'sent' : `failed_${r.status}`;
}

// Never throws: feedback is already saved; delivery is best-effort.
async function notifyFeedback(fb) {
  const safe = (fn) => fn(fb).catch((err) => {
    console.error('feedback delivery failed', err);
    return 'failed';
  });
  const [email, webhook] = await Promise.all([safe(sendEmail), safe(sendWebhook)]);
  return { email, webhook };
}

module.exports = { notifyFeedback };
