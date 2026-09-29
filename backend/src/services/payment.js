const crypto = require('crypto');

// Short, unambiguous code players put in the bank-transfer note (no 0/O/1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newPaymentRef() {
  const bytes = crypto.randomBytes(6);
  return `PB${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}

// VietQR quick-link image (napas 247). Any Vietnamese banking app can scan it and
// pre-fills account, amount and note. Returns null until the club has bank details.
function vietqrUrl(club, amount, note) {
  if (!club?.bank_code || !club?.bank_account) return null;
  const params = new URLSearchParams({ amount: String(Math.round(Number(amount) || 0)), addInfo: note || '' });
  if (club.bank_holder) params.set('accountName', club.bank_holder);
  return `https://img.vietqr.io/image/${encodeURIComponent(club.bank_code)}-${encodeURIComponent(club.bank_account)}-compact2.png?${params}`;
}

function paymentInfo(club, rows) {
  const ref = rows[0]?.payment_ref || null;
  const total = rows.reduce((s, m) => s + Number(m.amount || 0), 0);
  return {
    ref,
    total,
    periods: rows.map((m) => m.period_label),
    status: rows.every((m) => m.status === 'paid') ? 'paid' : 'pending',
    bank: club?.bank_account ? { code: club.bank_code, account: club.bank_account, holder: club.bank_holder } : null,
    qr_url: vietqrUrl(club, total, ref),
  };
}

module.exports = { newPaymentRef, vietqrUrl, paymentInfo };
