// "Tải lên DS": read the member Excel (the file "Xuất Excel" gives, see lib/memberSheet.js)
// into rows for POST /api/clubs/:id/members/import. Columns are found by their header (row
// with "Họ tên" / "Name"), in Vietnamese or English, so a re-saved or re-ordered file works.
import { MEMBER_FIELDS } from '@/lib/memberSheet';
import { vi } from '@/lib/i18n/vi';
import { en } from '@/lib/i18n/en';

const plain = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const dig = (dict, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
const both = (key) => [dig(vi, key), dig(en, key)].filter((x) => typeof x === 'string').map(plain);

// field -> the header texts it can have
function headerMap() {
  const out = new Map();
  for (const [f, key] of MEMBER_FIELDS) {
    const names = f === 'stt' ? ['stt', '#'] : both(key);
    if (f === 'full_name') names.push('ho ten', 'ho va ten', 'ten', 'name', 'full name');
    if (f === 'phone') names.push('sdt', 'so dien thoai', 'dien thoai', 'phone');
    if (f === 'dupr_id') names.push('dupr id', 'ma dupr');
    if (f === 'birth') names.push('ngay sinh', 'nam sinh', 'birth date', 'date of birth');
    if (f === 'gender') names.push('gioi tinh', 'gender');
    if (f === 'joined') names.push('thang gia nhap', 'thoi gian gia nhap', 'ngay gia nhap', 'joined');
    if (f === 'id') names.push('ma thanh vien', 'member id', 'id');
    for (const n of names) out.set(n, f);
  }
  return out;
}
const cellText = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') return v.text ?? v.result ?? (Array.isArray(v.richText) ? v.richText.map((x) => x.text).join('') : '');
  return v;
};
const pad = (n) => String(n).padStart(2, '0');
function toDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const s = String(v || '').trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function toMonth(v) {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-01`;
  const m = String(v || '').trim().match(/^(\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[2]}-${pad(m[1])}-01` : toDate(v);
}
// A label in either language -> its value ("Nam" / "Male" -> male).
function pick(v, pairs) {
  const p = plain(v);
  if (!p) return undefined;
  for (const [value, keys] of pairs) if (keys.some((k) => both(k).includes(p))) return value;
  return undefined;
}

// -> { rows: [{ line, ...fields }], missingName: bool }
export async function readMemberFile(file) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], missingName: true };
  const map = headerMap();
  let headRow = null;
  const cols = new Map(); // column number -> field
  for (let r = 1; r <= Math.min(ws.rowCount, 15) && !headRow; r++) {
    const found = new Map();
    ws.getRow(r).eachCell((cell, c) => {
      const f = map.get(plain(cellText(cell.value)));
      if (f && !found.has(c)) found.set(c, f);
    });
    if ([...found.values()].includes('full_name')) {
      headRow = r;
      found.forEach((f, c) => cols.set(c, f));
    }
  }
  if (!headRow) return { rows: [], missingName: true };
  const rows = [];
  for (let r = headRow + 1; r <= ws.rowCount; r++) {
    const raw = {};
    ws.getRow(r).eachCell((cell, c) => {
      if (cols.has(c)) raw[cols.get(c)] = cellText(cell.value);
    });
    const name = String(raw.full_name || '').trim();
    if (!name && !raw.phone && !raw.id) continue;
    const birth = raw.birth instanceof Date || /\//.test(String(raw.birth || '')) || /^\d{4}-/.test(String(raw.birth || '')) ? toDate(raw.birth) : null;
    const year = !birth && /^\d{4}$/.test(String(raw.birth || '').trim()) ? Number(String(raw.birth).trim()) : null;
    const row = {
      line: r,
      id: /^[0-9a-f-]{36}$/i.test(String(raw.id || '').trim()) ? String(raw.id).trim() : undefined,
      full_name: name,
      phone: String(raw.phone || '').replace(/^'/, '').trim(),
      dupr_id: String(raw.dupr_id || '').trim(),
      gender: pick(raw.gender, [['male', ['members.male']], ['female', ['members.female']], ['other', ['members.other']]]),
      birth_date: birth || undefined,
      birth_year: year || undefined,
      member_type: pick(raw.member_type, [['fixed', ['xlsx.place_fixed']], ['guest', ['xlsx.place_guest', 'xlsx.place_new']]]),
      tier: pick(raw.tier, [['vip', ['members.vip']], ['standard', ['members.standard']]]),
      district: String(raw.district || '').trim(),
      notes: String(raw.notes || '').trim(),
      joined_on: raw.joined ? toMonth(raw.joined) || undefined : undefined,
      is_active: pick(raw.active, [[true, ['xlsx.yes']], [false, ['xlsx.no']]]),
    };
    rows.push(row);
  }
  return { rows, missingName: false };
}
