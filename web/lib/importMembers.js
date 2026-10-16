import { sheet, book } from '@/lib/xlsxBook';
// Reading uploaded files goes through read-excel-file (read-only, maintained). Files are
// written with ExcelJS (lib/xlsxBook).
import readExcelFile from 'read-excel-file/browser';
import { BADMINTON_LEVELS } from '@/lib/levels';
import { MEMBER_FIELDS, DURATIONS, memberColumns, memberRow } from '@/lib/memberSheet';

// Members from an Excel file — the same form as "Xuất Excel" (lib/memberSheet.js), so an
// exported file can be edited and imported again as it is. Rows with "Mã thành viên" (or a
// phone / name already in the club) update that member; the others are added.
const FIELDS = MEMBER_FIELDS.filter(([f]) => !['stt', 'account'].includes(f));
export const IMPORT_MAX = 500;

// "Ngày sinh *" / "ngay sinh" / "NGÀY SINH" -> "ngay sinh"
const norm = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[*:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// A cell as a date: Excel date, "28/10/2007", "2007-10-28". Returns 'YYYY-MM-DD' or null.
function toYmd(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()); // read-excel-file dates are UTC midnight
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m && validDate(+m[3], +m[2], +m[1])) return ymd(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m && validDate(+m[1], +m[2], +m[3])) return ymd(+m[1], +m[2], +m[3]);
  return null;
}

// Template: the same form as the export, one example row (skipped on import) and empty
// rows that already carry the drop-downs; plus a guide sheet.
export function downloadMemberTemplate(t, sport) {
  const lv = sport === 'badminton' ? t('level.b4') : '3.25';
  const example = memberRow(
    { full_name: t('imp.exName1'), member_type: 'fixed', tier: 'vip', gender: 'male', birth_date: '1995-03-15', phone: '0901234567', dupr_level: lv, district: t('imp.exDistrict1'), play_duration: '12_18', joined_on: `${new Date().getFullYear()}-09-01`, is_active: true, notes: t('imp.exNote') },
    0,
    t,
    () => lv
  );
  book([[t('xlsx.sheet'), memberSheetSpec(t, sport, [example], t('imp.templateSub'), t('imp.templateTitle'))], [t('imp.guideSheet'), guideSpec(t, sport)]], 'mau-nhap-thanh-vien.xlsx');
}

// The members sheet (export and template).
export function memberSheetSpec(t, sport, rows, subtitle, title) {
  return sheet({ title, subtitle, columns: memberColumns(t, sport), rows, blankRows: 300, notes: [t('imp.formNote')] });
}

// How to fill each column (allowed values spelled out).
export function guideSpec(t, sport) {
  const cols = memberColumns(t, sport).filter((c) => c.field !== 'stt');
  return sheet({
    title: t('imp.guideSheet'),
    subtitle: t('imp.guideSub'),
    columns: [{ header: t('imp.guideCol'), width: 24 }, { header: t('imp.guideValues'), width: 46, wrap: true }, { header: t('imp.guideHow'), width: 70, wrap: true }],
    rows: cols.map((c) => [c.header, c.list ? c.list.join(' / ') : c.decimal ? '1.00 – 8.00' : c.type === 'phone' ? '0901234567' : c.field === 'birth' ? '15/03/1995 · 1995' : c.field === 'joined' ? '09/2026' : '—', c.prompt || '']),
    notes: [t('imp.guideNote1'), t('imp.guideNote2', { n: IMPORT_MAX }), t('imp.guideNote3')],
  });
}

// One row of cells -> { body } for POST / PATCH /api/clubs/:id/members, or { error }.
// `has(f)`: the file has that column. Then an empty cell means "empty" (cleared on update);
// a missing column leaves the field alone.
function rowToBody(get, has, t, sport) {
  const body = {};
  const name = String(get('full_name') ?? '').trim();
  if (!name) return { error: 'imp.err_name' };
  body.full_name = name.slice(0, 120);

  const type = norm(get('member_type'));
  if (!type) body.member_type = has('member_type') ? undefined : undefined;
  else if ([norm(t('xlsx.place_fixed')), 'co dinh', 'fixed', 'thuong xuyen', 'khach thuong xuyen', 'regular'].includes(type)) body.member_type = 'fixed';
  else if ([norm(t('xlsx.place_guest')), 'giao luu', 'guest', 'vang lai', 'khach vang lai', 'drop-in'].includes(type)) body.member_type = 'guest';
  else if ([norm(t('xlsx.place_waiting')), 'danh sach cho', 'waiting', '---'].includes(type)) body.member_type = 'waiting';
  else if ([norm(t('xlsx.place_review')), 'xem xet them', 'review'].includes(type)) body.member_type = 'review'; // kept as it is
  else return { error: 'imp.err_type' };
  if (body.member_type === undefined) delete body.member_type;

  const tier = norm(get('tier'));
  if (tier) {
    if ([norm(t('members.vip')), 'vip'].includes(tier)) body.tier = 'vip';
    else if ([norm(t('members.standard')), 'thuong', 'standard'].includes(tier)) body.tier = 'standard';
    else return { error: 'imp.err_tier' };
  } else if (has('tier')) body.tier = null;

  const g = norm(get('gender'));
  if (g) {
    if ([norm(t('members.male')), 'nam', 'male', 'm'].includes(g)) body.gender = 'male';
    else if ([norm(t('members.female')), 'nu', 'female', 'f'].includes(g)) body.gender = 'female';
    else return { error: 'imp.err_gender' };
  } else if (has('gender')) body.gender = null;

  const b = get('birth');
  if (b !== '' && b != null) {
    const str = String(b).trim();
    if (/^\d{4}$/.test(str) && +str >= 1900 && +str <= new Date().getFullYear()) Object.assign(body, { birth_year: +str, birth_date: null });
    else {
      const d = toYmd(b);
      if (!d) return { error: 'imp.err_birth' };
      body.birth_date = d;
    }
  } else if (has('birth')) Object.assign(body, { birth_date: null, birth_year: null });

  let phone = String(get('phone') ?? '').replace(/[\s.()-]/g, '');
  if (/^\d{9}$/.test(phone)) phone = `0${phone}`; // a number cell dropped the leading 0
  if (/^84\d{9}$/.test(phone)) phone = `0${phone.slice(2)}`;
  if (phone) {
    if (!/^\+?\d{8,15}$/.test(phone)) return { error: 'imp.err_phone' };
    body.phone = phone;
  } else if (has('phone')) body.phone = null;

  const lv = get('level');
  if (lv !== '' && lv != null) {
    if (sport === 'badminton') {
      const n = BADMINTON_LEVELS.find((x) => norm(t(`level.b${x}`)) === norm(lv) || String(x) === String(lv).trim());
      if (!n) return { error: 'imp.err_levelB' };
      body.dupr_level = n;
    } else {
      const n = Number(String(lv).replace(',', '.'));
      if (!(n >= 1 && n <= 8)) return { error: 'imp.err_level' };
      body.dupr_level = Math.round(n * 100) / 100;
    }
  } else if (has('level')) body.dupr_level = null;

  if (has('district')) body.district = String(get('district') ?? '').trim().slice(0, 80) || null;

  const dur = norm(get('play_duration'));
  if (dur) {
    const d = DURATIONS.find((x) => x === dur || norm(t(`memberX.dur_${x}`)) === dur);
    if (!d) return { error: 'imp.err_duration' };
    body.play_duration = d;
  } else if (has('play_duration')) body.play_duration = null;

  const j = get('joined');
  if (j !== '' && j != null) {
    const str = String(j).trim();
    const m = str.match(/^(\d{1,2})[/.-](\d{4})$/);
    const d = m && +m[1] >= 1 && +m[1] <= 12 ? ymd(+m[2], +m[1], 1) : toYmd(j);
    if (!d) return { error: 'imp.err_joined' };
    body.joined_on = `${d.slice(0, 7)}-01`;
  }

  const a = norm(get('active'));
  if (a) {
    if ([norm(t('xlsx.yes')), 'co', 'yes', 'x', '1', 'true'].includes(a)) body.is_active = true;
    else if ([norm(t('xlsx.no')), 'khong', 'no', '0', 'false'].includes(a)) body.is_active = false;
    else return { error: 'imp.err_active' };
  }

  if (has('notes')) body.notes = String(get('notes') ?? '').trim().slice(0, 1000) || null;
  const id = String(get('id') ?? '').trim();
  return { body, id: /^[0-9a-f-]{36}$/i.test(id) ? id.toLowerCase() : null };
}

// Reads the first sheet that has a "Họ tên" column. Returns { rows } where each row is
// { line, name, body, id } or { line, name, error }.
export async function readMemberFile(file, t, sport) {
  const sheets = await readExcelFile(file);
  const nameHead = norm(t('common.name'));
  for (const { sheet: sheetName, data } of sheets) {
    const grid = data.map((r) => r.map((c) => (c == null ? '' : c)));
    const hi = grid.findIndex((r) => r.some((c) => [nameHead, 'ho ten', 'ho va ten', 'full name', 'name'].includes(norm(c))));
    if (hi < 0) continue;
    const heads = grid[hi].map(norm);
    const col = {};
    for (const [f, key] of FIELDS) {
      const want = [norm(t(key)), ...(f === 'full_name' ? ['ho ten', 'ho va ten', 'full name', 'name'] : [])];
      const i = heads.findIndex((h) => want.includes(h));
      if (i >= 0) col[f] = i;
    }
    const has = (f) => col[f] != null;
    const rows = [];
    grid.slice(hi + 1).forEach((r, k) => {
      const get = (f) => (col[f] == null ? '' : r[col[f]]);
      if (![...FIELDS.map(([f]) => f)].some((f) => String(get(f) ?? '').trim() !== '')) return; // blank line (or only STT)
      if (String(get('full_name')).trim().startsWith(t('imp.exPrefix'))) return; // the template's example
      const out = rowToBody(get, has, t, sport);
      rows.push({ line: hi + k + 2, name: String(get('full_name') || '').trim(), ...out });
    });
    return { rows, sheet: sheetName };
  }
  return { rows: [], missing: true };
}
