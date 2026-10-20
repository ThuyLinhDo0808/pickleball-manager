// Owner Console → Thông báo → "Gửi kèm email": the notice by email, once, to its audience.
// Only confirmed addresses; players who turned email notices off are skipped. Sent in
// batches (Bcc) so nobody sees the other addresses.
const { supabase } = require('../supabase');
const { emailReady } = require('./notify');

const BATCH = 50;
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (iso) => (iso ? require('./dates').vnDateTime(iso) : null);

async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

// The user ids an announcement is for.
async function audienceIds(a) {
  let ids;
  if (a.club_id) {
    const [{ data: club }, members, staff] = await Promise.all([
      supabase.from('clubs').select('host_id').eq('id', a.club_id).maybeSingle(),
      pageAll(() => supabase.from('club_members').select('user_id').eq('club_id', a.club_id).not('user_id', 'is', null).order('id')),
      pageAll(() => supabase.from('staff_grants').select('email').eq('club_id', a.club_id).order('id')),
    ]);
    const managers = new Set([club?.host_id].filter(Boolean));
    if (staff.length) {
      const { data: su } = await supabase.from('users').select('id').in('email', staff.map((s) => String(s.email).toLowerCase()));
      for (const u of su || []) managers.add(u.id);
    }
    const players = new Set(members.map((m) => m.user_id));
    ids = a.audience === 'hosts' ? managers : a.audience === 'players' ? players : new Set([...managers, ...players]);
  } else if (a.audience === 'hosts') {
    ids = new Set((await pageAll(() => supabase.from('clubs').select('host_id').order('id'))).map((c) => c.host_id));
  } else if (a.audience === 'players') {
    const [p, m] = await Promise.all([
      pageAll(() => supabase.from('player_profiles').select('user_id').order('user_id')),
      pageAll(() => supabase.from('club_members').select('user_id').not('user_id', 'is', null).order('id')),
    ]);
    ids = new Set([...p.map((x) => x.user_id), ...m.map((x) => x.user_id)]);
  } else {
    ids = null; // everyone
  }
  return ids;
}

async function recipients(a) {
  const ids = await audienceIds(a);
  const users = await pageAll(() => {
    let q = supabase.from('users').select('id, email, email_unverified_since').not('email', 'is', null).order('id');
    return q;
  }).catch(async () => pageAll(() => supabase.from('users').select('id, email').not('email', 'is', null).order('id')));
  const off = new Set((await pageAll(() => supabase.from('player_profiles').select('user_id, email_notices').eq('email_notices', false).order('user_id')).catch(() => [])).map((p) => p.user_id));
  return [...new Set(users.filter((u) => (!ids || ids.has(u.id)) && !u.email_unverified_since && !off.has(u.id)).map((u) => String(u.email).toLowerCase()))];
}

function mailOf(a) {
  const maint = a.kind === 'maintenance';
  const subject = a.title || (maint ? `Bảo trì Pickleball Manager — ${fmt(a.starts_at)}` : 'Thông báo từ Ban quản trị Pickleball Manager');
  const when = maint ? `Thời gian bảo trì: từ ${fmt(a.starts_at)}${a.ends_at ? ` đến ${fmt(a.ends_at)}` : ''}. Trong thời gian này không đăng nhập và sử dụng được.` : '';
  const text = [a.title, a.message, when, '— Ban quản trị Pickleball Manager'].filter(Boolean).join('\n\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">
${a.title ? `<h2 style="margin:0 0 12px">${esc(a.title)}</h2>` : ''}<p style="white-space:pre-line">${esc(a.message)}</p>
${when ? `<p style="padding:10px 12px;background:#fff7e0;border-left:4px solid #f5a623">🛠 ${esc(when)}</p>` : ''}
<p style="color:#666">— Ban quản trị Pickleball Manager</p></div>`;
  return { subject, text, html };
}

// Send it (once). Returns { sent, failed } or { skipped: reason }.
async function send(a) {
  if (!emailReady()) return { skipped: 'email_off' };
  if (a.emailed_at) return { skipped: 'already_sent' };
  const to = await recipients(a);
  const mail = mailOf(a);
  const from = process.env.NOTIFY_FROM_EMAIL;
  const addr = (from.match(/<([^>]+)>/) || [null, from])[1].trim();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < to.length; i += BATCH) {
    const bcc = to.slice(i, i + BATCH);
    try {
      const r = await fetch(`${process.env.RESEND_API_URL || 'https://api.resend.com'}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [addr], bcc, subject: mail.subject, html: mail.html, text: mail.text }),
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) sent += bcc.length;
      else failed += bcc.length;
    } catch {
      failed += bcc.length;
    }
  }
  await supabase.from('announcements').update({ emailed_at: new Date().toISOString(), emailed_count: sent }).eq('id', a.id);
  return { sent, failed, total: to.length };
}

module.exports = { send, recipients, audienceIds, mailOf };
