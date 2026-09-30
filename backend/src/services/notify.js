// Tell a player they moved from the waitlist to the main list. Two independent,
// best-effort channels — neither can fail the request that triggered them:
//
//   Telegram DM:  TELEGRAM_BOT_TOKEN (+ TELEGRAM_BOT_USERNAME for the link button).
//     Players connect once from the portal (t.me/<bot>?start=<code>); the bot
//     stores their chat id via POST /api/public/telegram.
//
//   Host webhook: users.notify_webhook_url (set on the Account page). Receives JSON,
//     so Make / Zapier / n8n can forward it to Zalo ZNS, SMS, a Telegram group...
const { supabase } = require('../supabase');
const { APP_TZ } = require('./stats');

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function when(event) {
  const [y, m, d] = event.event_date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const time = event.start_time ? `${event.start_time.slice(0, 5)} ` : '';
  return `${time}${wd} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function promotedText(event, name) {
  return (
    `🎉 ${name ? `${name} ơi, bạn` : 'Bạn'} đã được đẩy lên DANH SÁCH CHÍNH THỨC kèo "${event.title}" — ${when(event)}` +
    `${event.location ? ` tại ${event.location}` : ''}.\n` +
    'Hẹn gặp bạn ở sân! Nếu không đi được, hãy báo Host sớm để nhường chỗ.'
  );
}

async function telegramSend(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return 'not_configured';
  const api = (process.env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/+$/, ''); // or a self-hosted Bot API server
  const r = await fetch(`${api}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
  return r.ok ? 'sent' : `failed_${r.status}`;
}

// Portal accounts behind a participant: their own sign-up, or the club member record they're linked to.
async function participantUserIds(participant) {
  const ids = new Set(participant.user_id ? [participant.user_id] : []);
  if (participant.source_club_member_id) {
    const { data } = await supabase.from('club_members').select('user_id').eq('id', participant.source_club_member_id).maybeSingle();
    if (data?.user_id) ids.add(data.user_id);
  }
  return [...ids];
}

async function sendToPlayer(participant, text) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return 'not_configured';
  const ids = await participantUserIds(participant);
  if (!ids.length) return 'no_account';
  const { data } = await supabase.from('player_profiles').select('telegram_chat_id').in('user_id', ids).not('telegram_chat_id', 'is', null);
  if (!data?.length) return 'not_linked';
  const results = await Promise.all(data.map((p) => telegramSend(p.telegram_chat_id, text)));
  return results.includes('sent') ? 'sent' : results[0];
}

async function postWebhook(url, payload) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  return r.ok ? 'sent' : `failed_${r.status}`;
}

async function sendToHostWebhook(hostId, payload) {
  const { data } = await supabase.from('users').select('notify_webhook_url').eq('id', hostId).maybeSingle();
  if (!data?.notify_webhook_url) return 'not_configured';
  return postWebhook(data.notify_webhook_url, payload);
}

const safe = (p) =>
  p.catch((err) => {
    console.error('notification failed', err);
    return 'failed';
  });

// Never throws. Returns { telegram, webhook } with 'sent' | 'not_configured' | 'not_linked' | 'failed…'.
async function notifyPromoted(event, participant) {
  const text = promotedText(event, participant.full_name);
  const payload = {
    type: 'waitlist_promoted',
    event: {
      id: event.id,
      title: event.title,
      event_date: event.event_date,
      start_time: event.start_time,
      location: event.location,
      timezone: APP_TZ,
    },
    player: { full_name: participant.full_name, phone: participant.phone || null },
    text,
    content: text, // Discord-style webhooks
    created_at: new Date().toISOString(),
  };
  const [telegram, webhook] = await Promise.all([safe(sendToPlayer(participant, text)), safe(sendToHostWebhook(event.host_id, payload))]);
  return { telegram, webhook };
}

module.exports = { notifyPromoted, telegramSend, postWebhook, promotedText };
