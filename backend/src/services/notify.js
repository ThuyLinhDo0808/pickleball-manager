// Tell players about their registration (moved up from the waitlist, payment confirmed
// or rejected) and the Host about new transfer screenshots. Two independent,
// best-effort channels — neither can fail the request that triggered them:
//
//   Host webhook: users.notify_webhook_url (set on the Account page). Receives JSON,
//     so Make / Zapier / n8n can forward it to Zalo ZNS, SMS, a Telegram group...
//
//   Email:  off until the Host turns it on (users.notify_players_email) and the server
//     has RESEND_API_KEY + NOTIFY_FROM_EMAIL on a verified domain. Sent under the club's
//     name, replies go to the Host; a player can opt out (player_profiles.email_notices).
const { supabase } = require('../supabase');
const { APP_TZ } = require('./stats');
const { playerEmail } = require('./emailTemplates');

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

// Portal accounts behind a participant: their own sign-up, or the club member record they're linked to.
async function participantUserIds(participant) {
  const ids = new Set(participant.user_id ? [participant.user_id] : []);
  if (participant.source_club_member_id) {
    const { data } = await supabase.from('club_members').select('user_id').eq('id', participant.source_club_member_id).maybeSingle();
    if (data?.user_id) ids.add(data.user_id);
  }
  return [...ids];
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

// Player (email) + Host webhook. Never throws; returns { email, webhook }.
// `mail`: [template kind, extra template context] for the email.
async function tellPlayerAndHost(type, event, participant, text, extra, mail) {
  const [email, webhook] = await Promise.all([
    mail ? safe(emailAbout(event, participant, mail[0], mail[1] || {})) : 'off',
    safe(sendToHostWebhook(event.host_id, payloadFor(type, event, participant, text, extra))),
  ]);
  return { email, webhook };
}

async function notifyPromoted(event, participant) {
  const mustPay = participant.status === 'pending';
  const payUrl = event.public_token ? webUrl(`/e/${event.public_token}`) : null;
  return tellPlayerAndHost('waitlist_promoted', event, participant, promotedText(event, participant.full_name, { mustPay, payUrl }), {
    payment_required: mustPay,
  }, [mustPay ? 'promoted_pay' : 'promoted', { payUrl }]);
}

async function notifyPaymentConfirmed(event, participant) {
  const ticketUrl = webUrl(`/t/${participant.ticket_code}`);
  const text =
    `✅ Host đã xác nhận thanh toán — ${hi(participant.full_name).replace(' ơi, bạn', '')} đã đăng ký thành công ${where(event)}.\n` +
    `${ticketUrl ? `Vé check-in (mã QR): ${ticketUrl}\n` : ''}📸 Hãy chụp màn hình mã QR để check-in tại sân.`;
  return tellPlayerAndHost('payment_confirmed', event, participant, text, { ticket_url: ticketUrl }, ['payment_confirmed', { ticketUrl }]);
}

async function notifyPaymentRejected(event, participant, note) {
  const payUrl = event.public_token ? webUrl(`/e/${event.public_token}`) : null;
  const text =
    `⚠️ Host chưa xác nhận được thanh toán của bạn cho ${where(event)}${note ? `: ${note}` : '.'}\n` +
    `Vui lòng gửi lại ảnh chuyển khoản${payUrl ? `: ${payUrl}` : ''}.`;
  const email = await safe(emailAbout(event, participant, 'payment_rejected', { payUrl, note }));
  return { email };
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
    const sender = await safe(emailSender(event));
    await Promise.all(
      list.map((p) =>
        sender && sender !== 'failed'
          ? safe(participantUserIds(p).then((ids) => emailPlayer(ids, playerEmail('event_cancelled', { name: p.full_name, event, clubName: sender.clubName, refund: !!p.fee_paid }), sender)))
          : null
      )
    );
    await safe(sendToHostWebhook(event.host_id, { ...payloadFor('event_cancelled', event, { full_name: null }, text), players: list.length, player: undefined }));
  } catch (err) {
    console.error('event cancelled notification failed', err);
  }
}

const emailReady = () => !!(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);

// Who an email about this event comes from: the club's name (or the organiser) on the
// app's address, replies to the Host. null = the Host hasn't turned player emails on.
async function emailSender(event) {
  if (!emailReady()) return null;
  const [{ data: host }, { data: club }] = await Promise.all([
    supabase.from('users').select('email, notify_players_email').eq('id', event.host_id).maybeSingle(),
    event.club_id ? supabase.from('clubs').select('name').eq('id', event.club_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!host?.notify_players_email) return null;
  return { clubName: club?.name || null, replyTo: host.email || null };
}

// "Name <addr>" with the club's name in front of the app's sending address.
function fromHeader(name) {
  const raw = process.env.NOTIFY_FROM_EMAIL;
  const addr = (raw.match(/<([^>]+)>/) || [null, raw])[1].trim();
  const clean = String(name || '').replace(/["<>\r\n]/g, '').trim();
  return clean ? `"${clean}" <${addr}>` : raw;
}

// Email the player's account(s), unless they turned email notices off.
async function emailPlayer(userIds, mail, sender) {
  if (!sender) return 'off';
  if (!userIds.length) return 'no_account';
  const [{ data: users }, { data: prefs }] = await Promise.all([
    supabase.from('users').select('id, email').in('id', userIds),
    supabase.from('player_profiles').select('user_id, email_notices').in('user_id', userIds),
  ]);
  const optedOut = new Set((prefs || []).filter((p) => p.email_notices === false).map((p) => p.user_id));
  const to = (users || []).filter((u) => u.email && !optedOut.has(u.id)).map((u) => u.email);
  if (!to.length) return 'no_email';
  const r = await fetch(`${process.env.RESEND_API_URL || 'https://api.resend.com'}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromHeader(sender.clubName),
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  return r.ok ? 'sent' : `failed_${r.status}`;
}

async function emailAbout(event, participant, kind, ctx) {
  const sender = await emailSender(event);
  if (!sender) return 'off';
  const ids = await participantUserIds(participant);
  return emailPlayer(ids, playerEmail(kind, { name: participant.full_name, event, clubName: sender.clubName, ...ctx }), sender);
}

// Guest played a session: thank them and send the survey link (email).
async function notifySurvey(event, participant, { clubName, url }) {
  const text =
    `🙏 Cảm ơn ${participant.full_name || 'bạn'} đã đến giao lưu ở ${where(event)}${clubName ? ` cùng ${clubName}` : ''}!\n` +
    `Bạn dành 1 phút đánh giá buổi chơi giúp CLB nhé${url ? `: ${url}` : ' (mở trang Người chơi trong app)'}.`;
  const email = await safe(emailAbout(event, participant, 'survey', { surveyUrl: url }));
  return { email, text };
}

// Host: a guest asked to join the fixed team from the survey.
async function notifyJoinFromSurvey(event, member) {
  const text = `🙋 ${member.full_name} (${member.phone || '—'}) muốn gia nhập team cố định — qua khảo sát buổi "${event.title}". Vào app → Thành viên → DS chờ để duyệt.`;
  return safe(sendToHostWebhook(event.host_id, payloadFor('join_request', event, member, text, { from_survey: true })));
}

module.exports = {
  emailReady,
  notifySurvey,
  notifyJoinFromSurvey,
  notifyEventCancelled,
  notifyPromoted,
  notifyPaymentConfirmed,
  notifyPaymentRejected,
  notifyPaymentSubmitted,
  postWebhook,
  promotedText,
  webUrl,
};
