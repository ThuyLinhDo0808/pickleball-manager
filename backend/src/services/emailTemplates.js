// Emails to players (sent from the app's domain under the club's name; replies go to
// the Host). Plain inline-styled HTML that reads well in Gmail / Outlook / phones, plus a
// text version. Pure — no I/O — so previews and tests can render them.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function dateLine(event) {
  const [y, m, d] = event.event_date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const time = [event.start_time, event.end_time].filter(Boolean).map((x) => x.slice(0, 5)).join(' – ');
  return `${wd}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}${time ? ` · ${time}` : ''}`;
}

// What each kind of notice says. `ctx`: { name, event, clubName, payUrl, ticketUrl, note, refund, surveyUrl }
const KINDS = {
  promoted: (c) => ({
    subject: `🎉 Bạn đã vào danh sách chính – ${c.event.title}`,
    tone: '#65a30d',
    title: 'Bạn đã có chỗ chính thức!',
    lines: [`Có người vừa nhường chỗ nên bạn đã được đẩy từ danh sách chờ lên <b>danh sách chính</b> của buổi dưới đây.`, 'Hẹn gặp bạn ở sân! Nếu không đi được, hãy báo sớm để nhường chỗ cho người khác.'],
  }),
  promoted_pay: (c) => ({
    subject: `⏳ Bạn có chỗ – chuyển khoản trong 2 giờ để giữ chỗ – ${c.event.title}`,
    tone: '#d97706',
    title: 'Bạn có chỗ — hãy chuyển khoản để giữ chỗ',
    lines: ['Bạn đã được đẩy từ danh sách chờ lên. Hãy <b>chuyển khoản và gửi ảnh xác nhận trong 2 giờ</b>, quá hạn chỗ sẽ được nhường cho người tiếp theo.'],
    cta: c.payUrl ? ['Chuyển khoản & gửi ảnh', c.payUrl] : null,
  }),
  payment_confirmed: (c) => ({
    subject: `✅ Đăng ký thành công – ${c.event.title}`,
    tone: '#65a30d',
    title: 'Đăng ký thành công!',
    lines: ['Host đã xác nhận khoản chuyển khoản của bạn. Mở vé bên dưới và <b>chụp màn hình mã QR</b> để check-in tại sân.'],
    cta: c.ticketUrl ? ['Xem vé QR check-in', c.ticketUrl] : null,
  }),
  payment_rejected: (c) => ({
    subject: `⚠️ Chưa xác nhận được thanh toán – ${c.event.title}`,
    tone: '#dc2626',
    title: 'Host chưa xác nhận được thanh toán',
    lines: [c.note ? `Lý do: <i>${esc(c.note)}</i>` : 'Ảnh chuyển khoản chưa khớp.', 'Vui lòng kiểm tra và gửi lại ảnh chuyển khoản.'],
    cta: c.payUrl ? ['Gửi lại ảnh chuyển khoản', c.payUrl] : null,
  }),
  event_cancelled: (c) => ({
    subject: `❌ Đã hủy – ${c.event.title}`,
    tone: '#dc2626',
    title: 'Buổi chơi đã bị hủy',
    lines: ['Rất tiếc, Host đã hủy buổi chơi dưới đây.', c.refund ? 'Bạn đã đóng tiền — Host sẽ liên hệ hoàn tiền cho bạn.' : 'Hẹn gặp bạn ở buổi sau!'],
  }),
  survey: (c) => ({
    subject: `🙏 Cảm ơn bạn đã giao lưu cùng ${c.clubName || 'CLB'}`,
    tone: '#0284c7',
    title: 'Cảm ơn bạn đã đến giao lưu!',
    lines: ['Bạn dành 1 phút đánh giá buổi chơi giúp CLB nhé — góp ý của bạn giúp các buổi sau vui hơn.'],
    cta: c.surveyUrl ? ['Đánh giá buổi chơi', c.surveyUrl] : null,
  }),
};

// -> { subject, html, text }
function playerEmail(kind, ctx) {
  const k = KINDS[kind](ctx);
  const club = ctx.clubName || 'Ban tổ chức';
  const e = ctx.event;
  const hello = `Chào ${esc(ctx.name || 'bạn')},`;
  const info = [
    ['🏓', esc(e.title)],
    ['🗓', esc(dateLine(e))],
    ...(e.location ? [['📍', esc(e.location)]] : []),
  ];
  const button = k.cta
    ? `<tr><td style="padding:8px 28px 4px"><a href="${esc(k.cta[1])}" style="display:inline-block;background:${k.tone};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px;font-size:15px">${esc(k.cta[0])} →</a></td></tr>`
    : '';
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(k.subject)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0f1f3a;padding:18px 28px;color:#ffffff;font-size:15px;font-weight:bold">${esc(club)}<span style="color:#a3e635;font-weight:normal;font-size:12px"> · Pickleball Manager</span></td></tr>
<tr><td style="height:4px;background:${k.tone}"></td></tr>
<tr><td style="padding:24px 28px 4px;font-size:20px;font-weight:bold;color:#0f172a">${esc(k.title)}</td></tr>
<tr><td style="padding:8px 28px 0;font-size:15px;line-height:1.55;color:#334155">${hello}<br>${k.lines.map((l) => `<p style="margin:8px 0">${l}</p>`).join('')}</td></tr>
<tr><td style="padding:8px 28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
${info.map(([i, v]) => `<tr><td style="padding:8px 12px;width:28px;font-size:16px;vertical-align:top">${i}</td><td style="padding:8px 12px 8px 0;font-size:15px;color:#0f172a">${v}</td></tr>`).join('')}
</table></td></tr>
${button}
<tr><td style="padding:20px 28px 24px;font-size:12px;line-height:1.5;color:#64748b;border-top:1px solid #f1f5f9">
Thư gửi từ <b>${esc(club)}</b> qua Pickleball Manager. Có câu hỏi? <b>Trả lời thư này</b> để liên hệ trực tiếp với Host.<br>
Không muốn nhận email thông báo? Tắt trong app → <i>Hoạt động</i> → <i>Thông báo qua email</i>.
</td></tr>
</table></td></tr></table></body></html>`;
  const strip = (s) => s.replace(/<[^>]+>/g, '');
  const text = [
    hello,
    '',
    strip(k.title),
    ...k.lines.map(strip),
    '',
    `${e.title} — ${dateLine(e)}${e.location ? ` — ${e.location}` : ''}`,
    ...(k.cta ? ['', `${k.cta[0]}: ${k.cta[1]}`] : []),
    '',
    `— ${club} (trả lời thư này để liên hệ Host)`,
  ].join('\n');
  return { subject: k.subject, html, text };
}

module.exports = { playerEmail, KINDS };
