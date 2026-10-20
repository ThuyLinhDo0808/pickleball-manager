// Dates in messages and emails: always dd/mm/yyyy HH:mm in the app's time zone (Vietnam).
function vnDateTime(value, { time = true } = {}) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const opts = { timeZone: process.env.APP_TZ || 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}) };
  const p = Object.fromEntries(new Intl.DateTimeFormat('vi-VN', opts).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year}${time ? ` ${p.hour}:${p.minute}` : ''}`;
}

module.exports = { vnDateTime };
