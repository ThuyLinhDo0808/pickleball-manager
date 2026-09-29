import * as XLSX from 'xlsx';
import { t } from '../i18n/core.js';
import { formatDate, formatTimeRange } from './format';

const NUM_FMT = '#,##0';
const num = (v: any, f?: string) => ({ t: 'n', v: Number(v) || 0, z: NUM_FMT, ...(f ? { f } : {}) });
const str = (v: any) => ({ t: 's', v: String(v ?? '') });
const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;

export function buildEventWorkbook({ event, payers, expenses }: any) {
  const nSummary = t('xl.summary');
  const nPlayers = t('xl.players');
  const nExpenses = t('xl.expenses');
  const P = quote(nPlayers);
  const X = quote(nExpenses);

  const feeOf = (p: any) => Number(p.fee_amount ?? event.fee_amount) || 0;

  const n = payers.length;
  const pRows = payers.map((p: any, i: number) => {
    const r = i + 2;
    const owed = feeOf(p);
    const paid = p.fee_paid ? 1 : 0;
    return [
      num(i + 1), str(p.display_name), str(p.phone || ''), str(t(`status.${p.status}`)),
      num(owed), num(paid), num(owed * paid, `E${r}*F${r}`), num(owed - owed * paid, `E${r}-G${r}`),
      num(p.status === 'checked_in' ? 1 : 0),
    ];
  });

  const sum = (col: string, pick: any) => payers.reduce((a: number, p: any, i: number) => a + pick(p, i), 0);
  const owedTotal = sum('E', (p: any) => feeOf(p));
  const collectedTotal = sum('G', (p: any) => (p.fee_paid ? feeOf(p) : 0));
  const paidCount = payers.filter((p: any) => p.fee_paid).length;
  const checkedCount = payers.filter((p: any) => p.status === 'checked_in').length;
  const pTotalRow = n + 2;

  const wsPlayers = XLSX.utils.aoa_to_sheet([
    [t('xl.no'), t('xl.name'), t('xl.phone'), t('xl.status'), t('xl.feeOwed'), t('xl.paid'), t('xl.collected'), t('xl.outstanding'), t('xl.checkedIn')].map(str),
    ...pRows,
  ]);

  const m = expenses.length;
  const eRows = expenses.map((x: any, i: number) => {
    const r = i + 2;
    const voided = x.is_voided ? 1 : 0;
    const amount = Number(x.amount) || 0;
    return [num(i + 1), str(x.description || ''), str(formatDateTime(x.created_at)), num(amount), num(voided), num(amount * (1 - voided), `D${r}*(1-E${r})`)];
  });

  const expensesCounted = expenses.reduce((a: number, x: any) => a + (x.is_voided ? 0 : Number(x.amount) || 0), 0);
  const wsExpenses = XLSX.utils.aoa_to_sheet([
    [t('xl.no'), t('xl.description'), t('xl.date'), t('xl.amount'), t('xl.voided'), t('xl.counted')].map(str),
    ...eRows,
  ]);

  const court = Number(event.court_cost) || 0;
  const balls = Number(event.ball_cost) || 0;
  const totalCosts = court + balls + expensesCounted;
  const profit = collectedTotal - totalCosts;

  const rows = [
    [str(event.title)],
    [str(`${formatDate(event.event_date)} · ${formatTimeRange(event.start_time, event.end_time)}${event.location ? ` · ${event.location}` : ''}`)],
    [],
    [str(t('xl.item')), str(t('xl.amount'))],
    [str(t('xl.feesExpected')), num(owedTotal)],
    [str(t('xl.feesCollected')), num(collectedTotal)],
    [str(t('xl.courtCost')), num(court)],
    [str(t('xl.ballCost')), num(balls)],
    [str(t('xl.otherExpenses')), num(expensesCounted)],
    [str(t('xl.totalCosts')), num(totalCosts)],
    [str(t('xl.profitLoss')), num(profit)],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(rows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, nSummary);
  XLSX.utils.book_append_sheet(wb, wsPlayers, nPlayers);
  XLSX.utils.book_append_sheet(wb, wsExpenses, nExpenses);
  return wb;
}

export function safeFilename(text: string) {
  const base = String(text || 'event')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base || 'event';
}

export async function exportEventFinance({ event, payers, expenses }: any) {
  const wb = buildEventWorkbook({ event, payers, expenses });
  const filename = `${safeFilename(event.title)}_${event.event_date}.xlsx`;
  XLSX.writeFile(wb, filename);
}