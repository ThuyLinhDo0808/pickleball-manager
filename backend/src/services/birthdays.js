// Upcoming birthdays (club-local calendar dates, no timezone maths).
const { todayYmd } = require('./memberships');

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const utc = (y, m, d) => Date.UTC(y, m - 1, d);

// Next birthday on or after `today` (Feb 29 falls on Feb 28 in other years).
function nextBirthday(birthDate, today = todayYmd()) {
  const [, bm, bd] = birthDate.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const on = (y) => (bm === 2 && bd === 29 && !isLeap(y) ? [y, 2, 28] : [y, bm, bd]);
  let [y, m, d] = on(ty);
  if (utc(y, m, d) < utc(ty, tm, td)) [y, m, d] = on(ty + 1);
  const days = Math.round((utc(y, m, d) - utc(ty, tm, td)) / 86400000);
  const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { days, date, age: y - Number(birthDate.slice(0, 4)) };
}

// Members whose birthday is within `within` days (0 = today), soonest first.
function upcoming(members, within = 3, today = todayYmd()) {
  return members
    .filter((m) => m.birth_date)
    .map((m) => ({ ...m, ...nextBirthday(m.birth_date, today) }))
    .filter((m) => m.days <= within)
    .sort((a, b) => a.days - b.days || a.full_name.localeCompare(b.full_name, 'vi'));
}

module.exports = { nextBirthday, upcoming };
