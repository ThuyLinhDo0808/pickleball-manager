// Which ledger entries count. An entry is left out of every total when it was voided or
// when the Host ticked "không tính vào sổ thu chi" (transactions.excluded): the line
// stays in the book, the player stays "đã thu", only the money is not counted.
const { schemaStatus } = require('./schemaCheck');

const MIGRATION = '20261224090000_txn_excluded.sql';
async function excludedReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}
const counted = (t) => !t.is_voided && !t.excluded;
// PostgREST filter for the entries that count (the column only once the migration ran).
async function countedFilter() {
  const ok = await excludedReady();
  return (q) => (ok ? q.eq('is_voided', false).eq('excluded', false) : q.eq('is_voided', false));
}
// Extra select column, '' until the migration ran.
async function excludedCol() {
  return (await excludedReady()) ? ', excluded' : '';
}

module.exports = { MIGRATION, excludedReady, counted, countedFilter, excludedCol };
