// Every Excel export of the manager pages, with one professional look (lib/xlsxBook.js).
import { sheet, book, fileName } from '@/lib/xlsxBook';
import { memberRow, memberColumns } from '@/lib/memberSheet';

const dmy = (ymd) => (ymd ? String(ymd).slice(0, 10).split('-').reverse().join('/') : '');

// One event: summary, participants (fee / paid), money in and out with LIVE totals.
export function exportEventFinance(event, participants, transactions, t) {
  const fee = (p) => Number(p.fee_amount ?? event.fee_amount ?? 0);
  const paidText = (p) => (p.paid_by_plan ? t('xlsx.paidPlan') : p.fee_paid ? t('xlsx.yes') : t('xlsx.no'));
  const people = sheet({
    title: `${event.title} — ${t('xlsx.participants')}`,
    subtitle: [dmy(event.event_date), event.start_time?.slice(0, 5), event.location].filter(Boolean).join(' · '),
    columns: [
      { header: '#', type: 'int', width: 5 },
      { header: t('common.name') },
      { header: t('common.phone') },
      { header: t('xlsx.status') },
      { header: t('xlsx.fee'), type: 'money' },
      { header: t('xlsx.paid') },
    ],
    rows: participants.map((p, i) => [i + 1, p.full_name, p.phone || '', t(`xlsx.st_${p.status}`), fee(p), paidText(p)]),
    totals: { label: t('xlsx.total'), cols: { 4: 'sum' } },
  });
  const live = transactions.filter((x) => !x.is_voided);
  const tx = live.map((x) => [x.occurred_on, x.type === 'income' ? t('xlsx.income') : t('xlsx.expense'), x.category || '', Number(x.amount), x.note || '']);
  const money = sheet({
    title: `${event.title} — ${t('xlsx.finance')}`,
    subtitle: dmy(event.event_date),
    columns: [
      { header: t('xlsx.date'), type: 'date' },
      { header: t('xlsx.kind') },
      { header: t('xlsx.category') },
      { header: t('xlsx.amount'), type: 'money' },
      { header: t('xlsx.notes'), width: 36, wrap: true },
    ],
    rows: tx,
    totals: tx.length ? { label: t('xlsx.net'), cols: { 3: { f: `SUMIF(B5:B${4 + tx.length},"${t('xlsx.income')}",D5:D${4 + tx.length})-SUMIF(B5:B${4 + tx.length},"${t('xlsx.expense')}",D5:D${4 + tx.length})` } } } : null,
    notes: [t('xlsx.liveNote')],
  });
  const inc = live.filter((x) => x.type === 'income').reduce((s, x) => s + Number(x.amount), 0);
  const exp = live.filter((x) => x.type === 'expense').reduce((s, x) => s + Number(x.amount), 0);
  const summary = sheet({
    title: event.title,
    subtitle: t('xlsx.summary'),
    columns: [{ header: t('xlsx.item'), width: 26 }, { header: t('xlsx.value'), width: 30 }],
    rows: [
      [t('xlsx.date'), dmy(event.event_date)],
      [t('xlsx.time'), [event.start_time?.slice(0, 5), event.end_time?.slice(0, 5)].filter(Boolean).join(' – ')],
      [t('xlsx.location'), event.location || ''],
      [t('xlsx.slots'), String(event.slots ?? '')],
      [t('xlsx.people'), String(participants.length)],
      [t('xlsx.feeDefault'), `${Number(event.fee_amount || 0).toLocaleString('vi-VN')} đ`],
      [t('xlsx.income'), `${inc.toLocaleString('vi-VN')} đ`],
      [t('xlsx.expense'), `${exp.toLocaleString('vi-VN')} đ`],
      [t('xlsx.net'), `${(inc - exp).toLocaleString('vi-VN')} đ`],
    ],
  });
  book([[t('xlsx.summary'), summary], [t('xlsx.participants'), people], [t('xlsx.finance'), money]], fileName(event.title, dmy(event.event_date), t('xlsx.finance')));
}

// Whole club backup: members, schedule, rankings.
export function exportClubBackup(club, members, events, rankings, t) {
  const m = sheet({
    title: `${club.name} — ${t('xlsx.sheet')}`,
    subtitle: t('xlsx.backup'),
    columns: [
      { header: '#', type: 'int', width: 5 },
      { header: t('common.name') },
      { header: t('members.gender') },
      { header: t('xlsx.birthYear'), type: 'int' },
      { header: t('common.level'), type: 'decimal' },
      { header: t('xlsx.place') },
      { header: t('members.tier') },
      { header: t('common.phone') },
      { header: t('xlsx.active') },
    ],
    rows: members.map((x, i) => [i + 1, x.full_name, x.gender ? t(`members.${x.gender}`) : '', x.birth_year ?? '', x.dupr_level ?? '', x.member_type === 'guest' ? t('xlsx.place_guest') : t('xlsx.place_fixed'), x.tier ? t(`members.${x.tier}`) : '', x.phone || '', x.is_active ? t('xlsx.yes') : t('xlsx.no')]),
  });
  const e = sheet({
    title: `${club.name} — ${t('xlsx.schedule')}`,
    subtitle: t('xlsx.backup'),
    columns: [{ header: t('xlsx.date'), type: 'date' }, { header: t('xlsx.title') }, { header: t('xlsx.location') }, { header: t('xlsx.status') }, { header: t('xlsx.mainList'), type: 'int' }, { header: t('xlsx.waitlist'), type: 'int' }],
    rows: events.map((x) => [x.event_date, x.title, x.location || '', t(`xlsx.ev_${x.status}`), x.main_count ?? 0, x.waitlist_count ?? 0]),
    totals: { label: t('xlsx.total'), cols: { 4: 'sum', 5: 'sum' } },
  });
  const r = sheet({
    title: `${club.name} — ${t('xlsx.rankings')}`,
    subtitle: t('xlsx.backup'),
    columns: [{ header: '#', type: 'int', width: 5 }, { header: t('common.name') }, { header: t('rankings.played'), type: 'int' }, { header: t('rankings.wins'), type: 'int' }, { header: t('rankings.winRate'), type: 'percent' }, { header: t('rankings.pointsFor'), type: 'int' }, { header: t('rankings.pointsAgainst'), type: 'int' }],
    rows: rankings.map((x, i) => [x.rank ?? i + 1, x.full_name, x.matches_played, x.wins, x.matches_played ? x.wins / x.matches_played : 0, x.points_scored, x.points_lost]),
  });
  book([[t('xlsx.sheet'), m], [t('xlsx.schedule'), e], [t('xlsx.rankings'), r]], fileName(club.name, t('xlsx.backup')));
}

// Rankings for one period + awards + weeks at No. 1.
export function exportRankings(clubName, label, stats, t) {
  const ranking = sheet({
    title: `${clubName} — ${t('xlsx.rankings')}`,
    subtitle: `${label}${stats.min_matches ? ` · ${t('xlsx.minRule', { n: stats.min_matches })}` : ''}`,
    columns: [
      { header: '#', width: 5 },
      { header: t('common.name') },
      { header: t('rankings.played'), type: 'int' },
      { header: t('rankings.wins'), type: 'int' },
      { header: t('rankings.losses'), type: 'int' },
      { header: t('rankings.winRate'), type: 'percent' },
      { header: t('rankings.pointsFor'), type: 'int' },
      { header: t('rankings.pointsAgainst'), type: 'int' },
      { header: t('rankings.diff'), type: 'int' },
    ],
    rows: stats.rankings.map((r, i) => [r.eligible === false ? '—' : String(r.rank ?? i + 1), r.full_name, r.matches_played, r.wins, r.losses, r.win_rate / 100, r.points_scored, r.points_lost, r.point_diff]),
    notes: stats.min_matches ? [t('xlsx.notRanked', { n: stats.min_matches })] : [],
  });
  const a = stats.awards || {};
  const awardRows = [
    ...(a.top_win_rate || []).map((r, i) => [t('rankings.topWinRate'), i + 1, r.full_name, `${r.value}%`]),
    ...(a.top_point_diff || []).map((r, i) => [t('rankings.topDiff'), i + 1, r.full_name, String(r.value)]),
    ...(a.top_attendance || []).map((r, i) => [t('rankings.topAttendance'), i + 1, r.full_name, String(r.value)]),
    ...(a.lowest_win_rate ? [[t('rankings.lowest'), 1, a.lowest_win_rate.full_name, `${a.lowest_win_rate.value}%`]] : []),
  ];
  const awards = sheet({ title: `${clubName} — ${t('rankings.awards')}`, subtitle: label, columns: [{ header: t('rankings.awards') }, { header: '#', type: 'int', width: 5 }, { header: t('common.name') }, { header: t('xlsx.value') }], rows: awardRows });
  const sheets = [[t('xlsx.rankings'), ranking], [t('rankings.awards'), awards]];
  if (stats.weeks_at_top?.length) {
    sheets.push([t('rankings.weeksCol'), sheet({ title: `${clubName} — ${t('rankings.weeksCol')}`, subtitle: label, columns: [{ header: '#', type: 'int', width: 5 }, { header: t('common.name') }, { header: t('rankings.weeksCol'), type: 'int' }, { header: t('rankings.weeksStreak', { n: '' }).trim(), type: 'int' }], rows: stats.weeks_at_top.map((w, i) => [i + 1, w.full_name, w.weeks, w.streak]) })]);
  }
  book(sheets, fileName(clubName, t('xlsx.rankings'), label));
}

// Every member with their details (Members page → Export Excel).
export function exportMembers(club, members, t, levelText) {
  const pickleball = (club.sport || 'pickleball') === 'pickleball';
  const rows = members.map((m, i) => memberRow(m, i, t, levelText, pickleball));
  book([[t('xlsx.sheet'), sheet({ title: `${club.name} — ${t('xlsx.sheet')}`, subtitle: t('xlsx.membersCount', { n: members.length }), columns: memberColumns(t, pickleball), rows })]], fileName(club.name, t('xlsx.sheet')));
}
