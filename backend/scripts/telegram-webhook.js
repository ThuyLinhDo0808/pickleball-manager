// One-time setup: tell Telegram where to send bot updates.
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/telegram-webhook.js https://<your-api>.onrender.com
// (or `npm run telegram:webhook -- https://...` with the values in .env)
require('dotenv').config();

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const base = (process.argv[2] || process.env.PUBLIC_API_URL || '').replace(/\/+$/, '');
  if (!token || !secret || !/^https:\/\//.test(base)) {
    console.error('Need TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and the https URL of this API.');
    process.exit(1);
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${base}/api/public/telegram`, secret_token: secret, allowed_updates: ['message'] }),
  });
  console.log(r.status, await r.text());
  if (!r.ok) process.exit(1);
}

main();
