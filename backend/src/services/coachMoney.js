// Coach Manager (đợt C5): money.
//
//   Students buy a package themselves: a "pending" purchase with a transfer code and the
//   coach's VietQR → they upload the transfer screenshot → the coach confirms (the package
//   becomes active, counted from that day, and the price goes into the coach's ledger) or
//   refuses (the student sends another screenshot).
//   The coach records a package by hand (C4) — paid at once or later; marking it paid
//   writes the income, unpaid again voids it.
//   Per-session fees: "đã thu" writes the income, back to unpaid / free voids it.
//   Partial refund of a package: status refunded + an expense "Hoàn tiền".
//   The ledger: auto entries + the coach's own (court hire, equipment, other), with the
//   "không tính" tick and void, like the club books.
// Emails (Resend, when configured) go to the coach on a new sign-up / screenshot and to the
// student on a decision; the student's bell (/api/player/updates) shows the same.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { fail } = require('./coachAccess');
const { todayYmd } = require('./memberships');
const { newPaymentRef, vietqrUrl } = require('./payment');

const MIGRATION = '20270103090000_coach_money.sql';
async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

const MAX_PROOF = 400000;
const INCOME_CATS = ['package', 'session_fee', 'other'];
const EXPENSE_CATS = ['refund', 'court', 'equipment', 'other'];

function addMonths(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}

// Where students transfer to: the coach's own bank details (users.bank_*, the same
// account the person uses as a Host) and / or their uploaded bank QR.
async function bankOf(coach) {
  const { data } = await supabase.from('users').select('bank_code, bank_account, bank_holder, payment_qr_image').eq('id', coach.user_id).maybeSingle();
  return data || {};
}
async function setBank(coach, body) {
  const fields = {};
  for (const k of ['bank_code', 'bank_account', 'bank_holder']) {
    if (k in (body || {})) fields[k] = body[k] == null ? null : String(body[k]).trim().slice(0, 80) || null;
  }
  if (fields.bank_code) fields.bank_code = fields.bank_code.toUpperCase();
  if (fields.bank_account && !/^[0-9A-Za-z]{4,30}$/.test(fields.bank_account)) throw fail('The account number should be 4-30 letters/digits, no spaces.', 400, 'bad_account');
  if ('payment_qr_image' in (body || {})) {
    const img = body.payment_qr_image;
    if (img != null && !(typeof img === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(img) && img.length <= MAX_PROOF)) throw fail('Upload a JPEG/PNG/WebP image.', 400, 'bad_image');
    fields.payment_qr_image = img || null;
  }
  const { error } = await supabase.from('users').update(fields).eq('id', coach.user_id);
  if (error) throw error;
  return bankOf(coach);
}

async function paymentFor(coach, p) {
  const bank = await bankOf(coach);
  return {
    amount: p.price,
    ref: p.payment_ref,
    bank: bank.bank_account ? { code: bank.bank_code, account: bank.bank_account, holder: bank.bank_holder } : null,
    qr_url: vietqrUrl(bank, p.price, p.payment_ref),
    qr_image: bank.payment_qr_image || null,
    status: p.status === 'active' ? 'paid' : 'pending',
  };
}

// What a student may see of their purchase (never the coach's note on it).
function purchaseView(p) {
  const { payment_proof, note, ledger_id, refund_ledger_id, ...rest } = p;
  return { ...rest, has_proof: !!payment_proof };
}

// ---- Student buys ------------------------------------------------------------------------
async function buy(coach, student, packageId) {
  if (coach.status !== 'active') throw fail('This coach is not taking students now.', 409, 'coach_paused');
  if (student.status === 'blocked') throw fail('This student is blocked.', 403, 'student_blocked');
  const { data: pkg } = await supabase.from('coach_packages').select('*').eq('id', packageId).eq('coach_id', coach.id).maybeSingle();
  if (!pkg || !pkg.active) throw fail('This package is not on sale.', 404, 'not_found');
  // One open order per package: buying again shows the same transfer.
  const { data: open } = await supabase.from('coach_package_purchases').select('*').eq('student_id', student.id).eq('package_id', pkg.id).eq('status', 'pending').maybeSingle();
  if (open) return { ...open, already: true };
  const row = {
    coach_id: coach.id,
    student_id: student.id,
    package_id: pkg.id,
    name: pkg.name,
    sessions_total: pkg.sessions,
    price: pkg.price,
    starts_on: todayYmd(),
    expires_on: null, // set when the coach confirms (counted from that day)
    status: pkg.price > 0 ? 'pending' : 'active',
    paid_at: pkg.price > 0 ? null : new Date().toISOString(),
    source: 'student',
    payment_ref: newPaymentRef().replace(/^PB/, 'NZC'),
  };
  if (row.status === 'active') row.expires_on = pkg.valid_months ? addMonths(row.starts_on, pkg.valid_months) : null;
  const { data, error } = await supabase.from('coach_package_purchases').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function submitProof(coach, student, p, image) {
  if (p.student_id !== student.id) throw fail('Purchase not found.', 404, 'not_found');
  if (p.status !== 'pending') throw fail('There is no payment waiting for this package.', 409, 'not_pending');
  if (!(typeof image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(image) && image.length <= MAX_PROOF)) {
    throw fail('Upload a JPEG/PNG/WebP screenshot (it is resized automatically).', 400, 'bad_image');
  }
  const { data, error } = await supabase.from('coach_package_purchases').update({ payment_proof: image, proof_submitted_at: new Date().toISOString(), reject_note: null }).eq('id', p.id).select('*').single();
  if (error) throw error;
  mailCoach(coach, `Ảnh chuyển khoản mới — ${student.full_name}`, `${student.full_name} đã gửi ảnh chuyển khoản cho gói "${p.name}" (${vnd(p.price)}, nội dung ${p.payment_ref}). Mở Coach → Tiền để xác nhận.`, '/coach/money');
  return data;
}

// ---- Ledger --------------------------------------------------------------------------------
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

async function writeEntry(coach, e) {
  const { data, error } = await supabase.from('coach_ledger').insert({ coach_id: coach.id, auto: true, occurred_on: todayYmd(), ...e }).select('*').single();
  if (error) throw error;
  return data;
}
async function voidEntry(coachId, id) {
  if (!id) return;
  await supabase.from('coach_ledger').update({ is_voided: true, voided_at: new Date().toISOString() }).eq('id', id).eq('coach_id', coachId);
}

// The coach confirms the money of a purchase (a student's order, or one they recorded).
async function confirm(coach, p) {
  if (!['pending', 'active'].includes(p.status)) throw fail('This package cannot be confirmed.', 409, 'bad_state');
  if (p.paid_at && p.ledger_id) return p;
  const patch = { paid_at: new Date().toISOString(), decided_at: new Date().toISOString(), reject_note: null };
  if (p.status === 'pending') {
    const { data: pkg } = p.package_id ? await supabase.from('coach_packages').select('valid_months').eq('id', p.package_id).maybeSingle() : { data: null };
    patch.status = 'active';
    patch.starts_on = todayYmd();
    patch.expires_on = pkg?.valid_months ? addMonths(patch.starts_on, pkg.valid_months) : p.expires_on;
  }
  if (p.price > 0) {
    const e = await writeEntry(coach, { type: 'income', category: 'package', amount: p.price, note: p.name, student_id: p.student_id, purchase_id: p.id });
    patch.ledger_id = e.id;
  }
  const { data, error } = await supabase.from('coach_package_purchases').update(patch).eq('id', p.id).select('*').single();
  if (error) throw error;
  if (p.status === 'pending') mailStudent(p.student_id, `Đã xác nhận gói "${p.name}"`, `Huấn luyện viên ${coach.display_name} đã nhận tiền gói "${p.name}" (${p.sessions_total} buổi). Gói bắt đầu từ hôm nay${data.expires_on ? `, hạn đến ${dmy(data.expires_on)}` : ''}.`);
  return data;
}

// Not paid after all (a recorded package marked unpaid again): the income is voided.
async function unpay(coach, p) {
  if (p.ledger_id) await voidEntry(coach.id, p.ledger_id);
  const { data, error } = await supabase.from('coach_package_purchases').update({ paid_at: null, ledger_id: null }).eq('id', p.id).select('*').single();
  if (error) throw error;
  return data;
}

// The screenshot does not match the money: the order stays open for a new screenshot.
async function reject(coach, p, note) {
  if (p.status !== 'pending') throw fail('Only a waiting payment can be refused.', 409, 'not_pending');
  const reason = String(note || '').trim().slice(0, 300) || null;
  const { data, error } = await supabase.from('coach_package_purchases').update({ payment_proof: null, proof_submitted_at: null, reject_note: reason || 'Chưa nhận được tiền.', decided_at: new Date().toISOString() }).eq('id', p.id).select('*').single();
  if (error) throw error;
  mailStudent(p.student_id, `Chưa xác nhận được tiền gói "${p.name}"`, `Huấn luyện viên ${coach.display_name} chưa nhận được tiền cho gói "${p.name}"${reason ? `: ${reason}` : ''}. Mở trang lớp học để gửi lại ảnh chuyển khoản.`);
  return data;
}

// Suggested refund: the price of the sessions left, rounded to 1.000 đ.
function suggestRefund(p) {
  const left = Math.max(0, p.sessions_total - p.sessions_used);
  if (!p.sessions_total || !p.price) return 0;
  return Math.round((p.price * left) / p.sessions_total / 1000) * 1000;
}

async function refund(coach, p, { amount, reason } = {}) {
  if (!['active', 'expired'].includes(p.status)) throw fail('Only a package in use can be refunded.', 409, 'bad_state');
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 0 || n > p.price) throw fail('The refund must be between 0 and the price.', 400, 'bad_amount');
  const why = String(reason || '').trim().slice(0, 300) || null;
  let refundLedger = null;
  if (n > 0) refundLedger = (await writeEntry(coach, { type: 'expense', category: 'refund', amount: n, note: [p.name, why].filter(Boolean).join(' — '), student_id: p.student_id, purchase_id: p.id })).id;
  const { data, error } = await supabase.from('coach_package_purchases').update({ status: 'refunded', refund_amount: n, refund_reason: why, refunded_at: new Date().toISOString(), refund_ledger_id: refundLedger }).eq('id', p.id).select('*').single();
  if (error) throw error;
  mailStudent(p.student_id, `Hoàn tiền gói "${p.name}"`, `Huấn luyện viên ${coach.display_name} đã hoàn ${vnd(n)} cho gói "${p.name}"${why ? ` (${why})` : ''}. Gói đã kết thúc.`);
  return data;
}

// A per-session fee: paid → income; unpaid / free → the income is voided.
async function setFee(coach, fee, status) {
  if (!['unpaid', 'paid', 'free'].includes(status)) throw fail('Unknown status.', 400, 'bad_status');
  const patch = { status, paid_at: status === 'paid' ? new Date().toISOString() : null };
  if (status === 'paid' && !fee.ledger_id && fee.amount > 0) {
    const { data: s } = await supabase.from('coach_sessions').select('session_date, coach_classes(title)').eq('id', fee.session_id).maybeSingle();
    patch.ledger_id = (await writeEntry(coach, { type: 'income', category: 'session_fee', amount: fee.amount, note: [s?.coach_classes?.title, s ? dmy(s.session_date) : null].filter(Boolean).join(' · '), student_id: fee.student_id, fee_id: fee.id })).id;
  }
  if (status !== 'paid' && fee.ledger_id) {
    await voidEntry(coach.id, fee.ledger_id);
    patch.ledger_id = null;
  }
  const { data, error } = await supabase.from('coach_session_fees').update(patch).eq('id', fee.id).eq('coach_id', coach.id).select('*').single();
  if (error) throw error;
  return data;
}

// The book: entries of a period with totals (voided and excluded do not count).
async function ledger(coach, { from, to } = {}) {
  let q = supabase.from('coach_ledger').select('*, coach_students(full_name)').eq('coach_id', coach.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false });
  if (from) q = q.gte('occurred_on', from);
  if (to) q = q.lte('occurred_on', to);
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  const rows = (data || []).map(({ coach_students: s, ...e }) => ({ ...e, student_name: s?.full_name || null }));
  const t = { income: 0, expense: 0 };
  for (const e of rows) if (!e.is_voided && !e.excluded) t[e.type] += e.amount;
  return { rows, income: t.income, expense: t.expense, net: t.income - t.expense };
}

function cleanEntry(b) {
  const type = b?.type;
  if (!['income', 'expense'].includes(type)) throw fail('type must be income or expense.', 400, 'bad_type');
  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const category = cats.includes(b.category) ? b.category : 'other';
  const amount = Number(b.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1e10) throw fail('amount must be a positive number.', 400, 'bad_amount');
  const note = b.note == null ? null : String(b.note).trim().slice(0, 300) || null;
  if (category === 'other' && !note) throw fail('Say what this entry is for.', 400, 'note_required');
  const occurred_on = /^\d{4}-\d{2}-\d{2}$/.test(String(b.occurred_on || '')) ? b.occurred_on : todayYmd();
  return { type, category, amount, note, occurred_on, auto: false };
}

// ---- Notices -------------------------------------------------------------------------------
const dmy = (ymd) => (ymd ? String(ymd).slice(0, 10).split('-').reverse().join('/') : '');
function webUrl(path) {
  const base = String(process.env.PUBLIC_WEB_URL || '').replace(/\/$/, '');
  return base ? `${base}${path}` : null;
}
function safe(p) {
  return Promise.resolve(p).catch((err) => console.error('coach mail', err.message));
}
async function mailTo(userId, subject, text, path) {
  if (!process.env.RESEND_API_KEY || !userId) return 'off';
  const { data } = await supabase.from('users').select('email').eq('id', userId).maybeSingle();
  if (!data?.email) return 'no_email';
  const url = path ? webUrl(path) : null;
  const body = url ? `${text}\n\n${url}` : text;
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<p>${esc(text)}</p>${url ? `<p><a href="${esc(url)}">${esc(url)}</a></p>` : ''}<p style="color:#6b7280;font-size:12px">NexusZone · Coach</p>`;
  return require('./accountSecurity').sendMail(data.email, subject, body, html);
}
function mailCoach(coach, subject, text, path) {
  safe(mailTo(coach.user_id, subject, text, path));
}
function mailStudent(studentId, subject, text) {
  safe(
    (async () => {
      const { data: st } = await supabase.from('coach_students').select('user_id').eq('id', studentId).maybeSingle();
      return st?.user_id ? mailTo(st.user_id, subject, text, '/p') : 'no_account';
    })(),
  );
}

// Retention: transfer screenshots older than the proof retention (default 90 days).
async function purgeOldProofs(days, today = new Date()) {
  if (!(await ready())) return 0;
  const cutoff = new Date(today.getTime() - days * 86400000).toISOString();
  const { data, error } = await supabase.from('coach_package_purchases').update({ payment_proof: null, proof_purged_at: new Date().toISOString() }).not('payment_proof', 'is', null).lt('proof_submitted_at', cutoff).select('id');
  if (error) throw error;
  return data?.length || 0;
}

module.exports = { MIGRATION, ready, INCOME_CATS, EXPENSE_CATS, bankOf, setBank, paymentFor, purchaseView, buy, submitProof, confirm, unpay, reject, suggestRefund, refund, setFee, ledger, cleanEntry, voidEntry, mailCoach, mailStudent, purgeOldProofs, addMonths };
