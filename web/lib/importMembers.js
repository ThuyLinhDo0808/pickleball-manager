import * as XLSX from 'xlsx';
// Reading uploaded files goes through read-excel-file (read-only, maintained): the xlsx
// package from npm (0.18.x) has open advisories for crafted files. xlsx only writes here.
import readExcelFile from 'read-excel-file/browser';
import { BADMINTON_LEVELS } from '@/lib/levels';

// Members from an Excel file. The template has the same columns as "Xuất Excel", so an
// exported file can be filled in / fixed and imported again (extra columns are ignored).

const FIELDS = [
  // [field, header i18n key, required]
  ['full_name', 'common.name', true],
  ['member_type', 'xlsx.place'],
  ['tier', 'members.tier'],
  ['gender', 'members.gender'],
  ['birth', 'members.birthDate'],
  ['phone', 'common.phone'],
  ['level', 'common.level'],
  ['district', 'memberX.district'],
  ['play_duration', 'memberX.playDuration'],
  ['joined', 'members.joined'],
  ['notes', 'xlsx.notes'],
];
const DURATIONS = ['lt6', '6_12', '12_18', 'gt18'];
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

// Template workbook: the members sheet (headers + two example rows) and a guide sheet.
export function downloadMemberTemplate(t, sport) {
  const head = FIELDS.map(([, key, req]) => `${t(key)}${req ? ' *' : ''}`);
  const lv = (n, b) => (sport === 'badminton' ? t(`level.b${b}`) : n);
  const examples = [
    [t('imp.exName1'), t('xlsx.place_fixed'), 'VIP', t('members.male'), '15/03/1995', '0901234567', lv('3.25', 4), t('imp.exDistrict1'), t('memberX.dur_12_18'), '09/2026', ''],
    [t('imp.exName2'), t('xlsx.place_guest'), '', t('members.female'), '1998', '0912345678', lv('2.80', 3), t('imp.exDistrict2'), t('memberX.dur_lt6'), '10/2026', t('imp.exNote')],
  ];
  const ws = XLSX.utils.aoa_to_sheet([head, ...examples]);
  ws['!cols'] = [26, 14, 10, 8, 12, 14, 14, 16, 14, 12, 30].map((wch) => ({ wch }));
  const guide = [
    [t('imp.guideCol'), t('imp.guideHow')],
    ...FIELDS.map(([f, key, req]) => [`${t(key)}${req ? ' *' : ''}`, t(`imp.how_${f}`, { durations: DURATIONS.map((d) => t(`memberX.dur_${d}`)).join(' / '), levels: sport === 'badminton' ? BADMINTON_LEVELS.map((n) => t(`level.b${n}`)).join(' / ') : '1.00 – 8.00' })]),
    [],
    [t('imp.guideNote1')],
    [t('imp.guideNote2', { n: IMPORT_MAX })],
    [t('imp.guideNote3')],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 22 }, { wch: 90 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t('xlsx.sheet'));
  XLSX.utils.book_append_sheet(wb, wsGuide, t('imp.guideSheet'));
  XLSX.writeFile(wb, 'mau-nhap-thanh-vien.xlsx');
}

// One row of cells -> the body for POST /api/clubs/:id/members, or an error (i18n key).
function rowToBody(get, t, sport) {
  const body = {};
  const name = String(get('full_name') ?? '').trim();
  if (!name) return { error: 'imp.err_name' };
  body.full_name = name.slice(0, 120);

  const type = norm(get('member_type'));
  if (!type || [norm(t('xlsx.place_fixed')), 'co dinh', 'fixed', 'thuong xuyen', 'khach thuong xuyen', 'regular'].includes(type)) body.member_type = 'fixed';
  else if ([norm(t('xlsx.place_guest')), 'giao luu', 'guest', 'vang lai', 'khach vang lai', 'drop-in'].includes(type)) body.member_type = 'guest';
  else if ([norm(t('xlsx.place_waiting')), 'danh sach cho', 'waiting', '---'].includes(type)) body.member_type = 'waiting';
  else return { error: 'imp.err_type' };

  const tier = norm(get('tier'));
  if (tier) {
    if (tier === 'vip') body.tier = 'vip';
    else if ([norm(t('members.standard')), 'thuong', 'standard'].includes(tier)) body.tier = 'standard';
    else return { error: 'imp.err_tier' };
    if (body.member_type !== 'fixed') delete body.tier;
  }

  const g = norm(get('gender'));
  if (g) {
    if ([norm(t('members.male')), 'nam', 'male', 'm'].includes(g)) body.gender = 'male';
    else if ([norm(t('members.female')), 'nu', 'female', 'f'].includes(g)) body.gender = 'female';
    else return { error: 'imp.err_gender' };
  }

  const b = get('birth');
  if (b !== '' && b != null) {
    const s = String(b).trim();
    if (/^\d{4}$/.test(s) && +s >= 1900 && +s <= new Date().getFullYear()) body.birth_year = +s;
    else {
      const d = toYmd(b);
      if (!d) return { error: 'imp.err_birth' };
      body.birth_date = d;
    }
  }

  let phone = String(get('phone') ?? '').replace(/[\s.-]/g, '');
  if (/^\d{9}$/.test(phone)) phone = `0${phone}`; // Excel dropped the leading 0
  if (phone) {
    if (!/^\+?\d{8,15}$/.test(phone)) return { error: 'imp.err_phone' };
    body.phone = phone;
  }

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
  }

  const district = String(get('district') ?? '').trim();
  if (district) body.district = district.slice(0, 80);

  const dur = norm(get('play_duration'));
  if (dur) {
    const d = DURATIONS.find((x) => x === dur || norm(t(`memberX.dur_${x}`)) === dur);
    if (!d) return { error: 'imp.err_duration' };
    body.play_duration = d;
  }

  const j = get('joined');
  if (j !== '' && j != null) {
    const s = String(j).trim();
    const m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
    const d = m && +m[1] >= 1 && +m[1] <= 12 ? ymd(+m[2], +m[1], 1) : toYmd(j);
    if (!d) return { error: 'imp.err_joined' };
    body.joined_on = `${d.slice(0, 7)}-01`;
  }

  const notes = String(get('notes') ?? '').trim();
  if (notes) body.notes = notes.slice(0, 1000);
  return { body };
}

// Reads the first sheet that has a "Họ tên" column. Returns { rows, missing } where each
// row is { line, body } or { line, name, error }.
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
    const rows = [];
    grid.slice(hi + 1).forEach((r, k) => {
      if (!r.some((c) => String(c).trim() !== '')) return; // blank line
      const get = (f) => (col[f] == null ? '' : r[col[f]]);
      if ([t('imp.exName1'), t('imp.exName2')].includes(String(get('full_name')).trim())) return; // the template's examples
      const out = rowToBody(get, t, sport);
      rows.push({ line: hi + k + 2, name: String(get('full_name') || '').trim(), ...out });
    });
    return { rows, sheet: sheetName };
  }
  return { rows: [], missing: true };
}
