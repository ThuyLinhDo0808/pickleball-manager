import * as XLSX from 'xlsx';

// Builds a workbook with LIVE FORMULAS (not static computed numbers) so the
// Host can tweak a row and see totals recalc when opened in Excel/Sheets.
export function exportEventFinance(event, participants, transactions) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: participants + fee status
  const pRows = [['Full name', 'Phone', 'Status', 'Fee', 'Paid']];
  participants.forEach((p) => {
    pRows.push([p.full_name, p.phone || '', p.status, p.fee_amount ?? event.fee_amount ?? 0, p.fee_paid ? 'Yes' : 'No']);
  });
  const wsParticipants = XLSX.utils.aoa_to_sheet(pRows);
  XLSX.utils.book_append_sheet(wb, wsParticipants, 'Participants');

  // Sheet 2: transactions with a live SUM formula per type + net formula
  const tRows = [['Date', 'Type', 'Category', 'Amount', 'Note']];
  transactions
    .filter((t) => !t.is_voided)
    .forEach((t) => tRows.push([t.occurred_on, t.type, t.category || '', Number(t.amount), t.note || '']));
  const firstDataRow = 2;
  const lastDataRow = tRows.length; // 1-indexed including header
  const incomeCell = `SUMIF(B${firstDataRow}:B${lastDataRow},"income",D${firstDataRow}:D${lastDataRow})`;
  const expenseCell = `SUMIF(B${firstDataRow}:B${lastDataRow},"expense",D${firstDataRow}:D${lastDataRow})`;
  tRows.push([]);
  tRows.push(['', '', 'Total income', { f: incomeCell }]);
  tRows.push(['', '', 'Total expense', { f: expenseCell }]);
  tRows.push(['', '', 'Net', { f: `${incomeCell}-${expenseCell}` }]);

  const wsTxns = XLSX.utils.aoa_to_sheet(tRows.map((r) => (Array.isArray(r) ? r : [])));
  // Re-write formula cells properly (aoa_to_sheet doesn't parse {f:...} objects in arrays reliably)
  const totalIncomeRow = lastDataRow + 2; // 1-indexed
  const totalExpenseRow = lastDataRow + 3;
  const netRow = lastDataRow + 4;
  XLSX.utils.sheet_add_aoa(wsTxns, [['', '', 'Total income', null]], { origin: `A${totalIncomeRow}` });
  wsTxns[`D${totalIncomeRow}`] = { t: 'n', f: incomeCell };
  XLSX.utils.sheet_add_aoa(wsTxns, [['', '', 'Total expense', null]], { origin: `A${totalExpenseRow}` });
  wsTxns[`D${totalExpenseRow}`] = { t: 'n', f: expenseCell };
  XLSX.utils.sheet_add_aoa(wsTxns, [['', '', 'Net', null]], { origin: `A${netRow}` });
  wsTxns[`D${netRow}`] = { t: 'n', f: `${incomeCell}-${expenseCell}` };
  XLSX.utils.book_append_sheet(wb, wsTxns, 'Finance');

  // Sheet 3: event summary
  const wsSummary = XLSX.utils.aoa_to_sheet([
    ['Event', event.title],
    ['Date', event.event_date],
    ['Location', event.location || ''],
    ['Slots', event.slots],
    ['Fee (default)', event.fee_amount],
  ]);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  XLSX.writeFile(wb, `event-${event.title.replace(/\s+/g, '-').toLowerCase()}-finance.xlsx`);
}

// Club-wide backup export: Members, Schedule, Rankings — for Host backup.
export function exportClubBackup(club, members, events, rankings) {
  const wb = XLSX.utils.book_new();

  const mRows = [['#', 'Full name', 'Gender', 'Birth year', 'Level', 'Type', 'Tier', 'Phone', 'Active']];
  members.forEach((m, i) =>
    mRows.push([i + 1, m.full_name, m.gender || '', m.birth_year ?? '', m.dupr_level ?? '', m.member_type, m.tier || '', m.phone || '', m.is_active ? 'Yes' : 'No'])
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mRows), 'Members');

  const eRows = [['Date', 'Title', 'Location', 'Status', 'Main list', 'Waitlist']];
  events.forEach((e) => eRows.push([e.event_date, e.title, e.location || '', e.status, e.main_count, e.waitlist_count]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(eRows), 'Schedule');

  const rRows = [['Full name', 'Wins', 'Matches', 'Points scored', 'Points lost']];
  rankings.forEach((r) => rRows.push([r.full_name, r.wins, r.matches_played, r.points_scored, r.points_lost]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rRows), 'Rankings');

  XLSX.writeFile(wb, `${(club.name || 'club').replace(/\s+/g, '-').toLowerCase()}-backup.xlsx`);
}

// Rankings for one period (day / month / quarter / year / all) + awards sheet.
export function exportRankings(clubName, label, stats, t) {
  const wb = XLSX.utils.book_new();
  const head = ['#', t('common.name'), t('rankings.played'), t('rankings.wins'), t('rankings.losses'), t('rankings.winRate'), t('rankings.pointsFor'), t('rankings.pointsAgainst'), t('rankings.diff')];
  const rows = stats.rankings.map((r, i) => [i + 1, r.full_name, r.matches_played, r.wins, r.losses, r.win_rate / 100, r.points_scored, r.points_lost, r.point_diff]);
  const ws = XLSX.utils.aoa_to_sheet([[`${clubName} — ${label}`], [], head, ...rows]);
  rows.forEach((_, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r: i + 3, c: 5 })];
    if (cell) cell.z = '0.0%';
  });
  XLSX.utils.book_append_sheet(wb, ws, 'Rankings');

  const a = stats.awards;
  const awardRows = [[t('rankings.awards'), '#', t('common.name'), '']];
  a.top_win_rate.forEach((r, i) => awardRows.push([t('rankings.topWinRate'), i + 1, r.full_name, `${r.value}%`]));
  a.top_point_diff.forEach((r, i) => awardRows.push([t('rankings.topDiff'), i + 1, r.full_name, r.value]));
  a.top_attendance.forEach((r, i) => awardRows.push([t('rankings.topAttendance'), i + 1, r.full_name, r.value]));
  if (a.lowest_win_rate) awardRows.push([t('rankings.lowest'), 1, a.lowest_win_rate.full_name, `${a.lowest_win_rate.value}%`]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(awardRows), 'Awards');

  const safe = `${clubName}-${label}`.replace(/[^\p{L}\p{N}-]+/gu, '_');
  XLSX.writeFile(wb, `rankings-${safe}.xlsx`);
}
