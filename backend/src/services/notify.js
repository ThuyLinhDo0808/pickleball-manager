// Tell players about their registration (moved up from the waitlist, payment confirmed
// or rejected) and the Host about new transfer screenshots. Two independent,
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

// Web app address for links in messages (ticket / payment page).
function webUrl(path) {
  const cors = (process.env.CORS_ORIGIN || '').split(',')[0].trim();
  const base = (process.env.PUBLIC_WEB_URL || (/^https:\/\//.test(cors) ? cors : '')).replace(/\/+$/, '');
  return base ? `${base}${path}` : null;
}

const hi = (name) => (name ? `${name} ơi, bạn` : 'Bạn');
const where = (event) => `kèo "${event.title}" — ${when(event)}${event.location ? ` tại ${event.location}` : ''}`;

function promotedText(event, name, { mustPay = false, payUrl = null } = {}) {
  if (mustPay) {
    return (
      `🎉 ${hi(name)} đã có chỗ ở ${where(event)}.\n` +
      `Hãy chuyển khoản và gửi ảnh xác nhận trong 2 giờ để giữ chỗ${payUrl ? `: ${payUrl}` : ' (mở lại link đăng ký kèo)'}.`
    );
  }
  return (
    `🎉 ${hi(name)} đã được đẩy lên DANH SÁCH CHÍNH THỨC ${where(event)}.\n` +
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

function payloadFor(type, event, participant, text, extra = {}) {
  return {
    type,
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
    ...extra,
    created_at: new Date().toISOString(),
  };
}

// Player (Telegram) + Host webhook. Never throws; returns { telegram, webhook }.
async function tellPlayerAndHost(type, event, participant, text, extra) {
  const [telegram, webhook] = await Promise.all([
    safe(sendToPlayer(participant, text)),
    safe(sendToHostWebhook(event.host_id, payloadFor(type, event, participant, text, extra))),
  ]);
  return { telegram, webhook };
}

async function notifyPromoted(event, participant) {
  const mustPay = participant.status === 'pending';
  const payUrl = event.public_token ? webUrl(`/e/${event.public_token}`) : null;
  return tellPlayerAndHost('waitlist_promoted', event, participant, promotedText(event, participant.full_name, { mustPay, payUrl }), {
    payment_required: mustPay,
  });
}

async function notifyPaymentConfirmed(event, participant) {
  const ticketUrl = webUrl(`/t/${participant.ticket_code}`);
  const text =
    `✅ Host đã xác nhận thanh toán — ${hi(participant.full_name).replace(' ơi, bạn', '')} đã đăng ký thành công ${where(event)}.\n` +
    `${ticketUrl ? `Vé check-in (mã QR): ${ticketUrl}\n` : ''}📸 Hãy chụp màn hình mã QR để check-in tại sân.`;
  return tellPlayerAndHost('payment_confirmed', event, participant, text, { ticket_url: ticketUrl });
}

async function notifyPaymentRejected(event, participant, note) {
  const payUrl = event.public_token ? webUrl(`/e/${event.public_token}`) : null;
  const text =
    `⚠️ Host chưa xác nhận được thanh toán của bạn cho ${where(event)}${note ? `: ${note}` : '.'}\n` +
    `Vui lòng gửi lại ảnh chuyển khoản${payUrl ? `: ${payUrl}` : ''}.`;
  return safe(sendToPlayer(participant, text)).then((telegram) => ({ telegram }));
}

// Host only: a guest uploaded a transfer screenshot to check.
async function notifyPaymentSubmitted(event, participant, amount) {
  const text = `💸 ${participant.full_name} đã gửi ảnh chuyển khoản ${Number(amount || 0).toLocaleString('vi-VN')}đ cho ${where(event)}. Vào app để xác nhận.`;
  const webhook = await safe(sendToHostWebhook(event.host_id, payloadFor('payment_submitted', event, participant, text, { amount: Number(amount || 0) })));
  return { webhook };
}

// Host cancelled the whole event: DM everyone still on it; one webhook call with the count.
async function notifyEventCancelled(event) {
  try {
    const { data: people } = await supabase
      .from('event_participants')
      .select('full_name, phone, user_id, source_club_member_id, fee_paid')
      .eq('event_id', event.id)
      .in('status', ['registered', 'checked_in', 'pending', 'waitlisted']);
    const list = people || [];
    const text = `❌ Host đã hủy ${where(event)}.`;
    await Promise.all(
      list.map((p) => safe(sendToPlayer(p, `${text}${p.fee_paid ? '\nHost sẽ liên hệ hoàn tiền cho bạn.' : ''}`)))
    );
    await safe(sendToHostWebhook(event.host_id, { ...payloadFor('event_cancelled', event, { full_name: null }, text), players: list.length, player: undefined }));
  } catch (err) {
    console.error('event cancelled notification failed', err);
  }
}

// Host only: a player says they belong to the club (linked by phone, or a new join request).
async function notifyMemberRequest(event, member, isNew) {
  const text = isNew
    ? `🙋 ${member.full_name} (${member.phone || '—'}) xin tham gia CLB qua kèo "${event.title}". Vào app → Thành viên để duyệt.`
    : `🙋 ${member.full_name} xác nhận là thành viên CLB (khớp số điện thoại). Vào app → Thành viên để xác thực.`;
  return safe(sendToHostWebhook(event.host_id, payloadFor('member_request', event, member, text, { new_member: isNew })));
}

// Automatic messages are a paid feature (plan "auto_notify"): on lower plans nothing is sent.
const { hostHas } = require('./features');
const gated = (fn) => async (event, ...rest) => {
  try {
    if (!(await hostHas(event?.host_id, 'auto_notify'))) return { skipped: 'plan' };
  } catch {
    return { skipped: 'plan' };
  }
  return fn(event, ...rest);
};

module.exports = {
  notifyMemberRequest: gated(notifyMemberRequest),
  notifyEventCancelled: gated(notifyEventCancelled),
  notifyPromoted: gated(notifyPromoted),
  notifyPaymentConfirmed: gated(notifyPaymentConfirmed),
  notifyPaymentRejected: gated(notifyPaymentRejected),
  notifyPaymentSubmitted: gated(notifyPaymentSubmitted),
  telegramSend,
  postWebhook,
  promotedText,
  webUrl,
};
