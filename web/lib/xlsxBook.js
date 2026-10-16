// One look for every Excel file the app hands out: a title, a subtitle (what / when),
// a coloured header row, zebra rows with thin borders, numbers formatted as money / % /
// dates, an optional totals row with LIVE formulas, filters on the header.
import XLSX from 'xlsx-js-style';

const NAVY = '0B1F3A';
const LIME = 'B6E33C';
const ZEBRA = 'F3F6FA';
const LINE = 'D0D7E2';
const FONT = 'Arial';

const border = { top: { style: 'thin', color: { rgb: LINE } }, bottom: { style: 'thin', color: { rgb: LINE } }, left: { style: 'thin', color: { rgb: LINE } }, right: { style: 'thin', color: { rgb: LINE } } };
const FMT = { int: '#,##0', money: '#,##0 "đ"', percent: '0.0%', decimal: '0.00', date: 'dd/mm/yyyy', text: '@' };
const RIGHT = new Set(['int', 'money', 'percent', 'decimal']);
const alignOf = (col) => col.align || (col.header === '#' ? 'center' : RIGHT.has(col.type) ? 'right' : 'left');

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ymd / ISO string -> Excel date cell value (keeps the day, no time zone shift).
const toDate = (v) => {
  if (v == null || v === '') return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};

function cellOf(value, type, s) {
  if (value == null || value === '') return { v: '', t: 's', s };
  if (typeof value === 'object' && value.f) return { f: value.f, t: 'n', s };
  if (type === 'date') {
    const d = toDate(value);
    return d ? { v: d, t: 'd', s, z: FMT.date } : { v: String(value), t: 's', s };
  }
  if (RIGHT.has(type) && value !== '' && !Number.isNaN(Number(value))) return { v: Number(value), t: 'n', s, z: FMT[type] };
  return { v: String(value), t: 's', s };
}

const colName = (c) => XLSX.utils.encode_col(c);

/**
 * sheet({ title, subtitle, columns: [{ header, type, width }], rows: [[...]], totals: { label, cols: { [i]: 'sum' | 'avg' } }, notes: [text] })
 * type: text | int | money | percent (fraction, 0.25 = 25%) | decimal | date (YYYY-MM-DD)
 */
export function sheet({ title, subtitle, columns, rows, totals, notes = [], footer }) {
  const ws = {};
  const n = columns.length;
  const put = (r, c, cell) => (ws[XLSX.utils.encode_cell({ r, c })] = cell);
  let r = 0;
  put(r, 0, { v: title || '', t: 's', s: { font: { name: FONT, sz: 16, bold: true, color: { rgb: NAVY } } } });
  r += 1;
  put(r, 0, { v: [subtitle, footer || `Pickleball Manager · ${stamp()}`].filter(Boolean).join('  ·  '), t: 's', s: { font: { name: FONT, sz: 10, italic: true, color: { rgb: '6B7280' } } } });
  r += 2;
  const headRow = r;
  columns.forEach((col, c) => put(r, c, { v: col.header, t: 's', s: { font: { name: FONT, sz: 11, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: NAVY } }, alignment: { horizontal: alignOf(col), vertical: 'center', wrapText: true, indent: alignOf(col) === 'left' ? 1 : 0 }, border } }));
  r += 1;
  const first = r;
  rows.forEach((row, i) => {
    columns.forEach((col, c) => {
      const s = { font: { name: FONT, sz: 10, ...(c === 1 && columns[0]?.header === '#' ? { bold: true } : {}) }, border, alignment: { horizontal: alignOf(col), vertical: 'center', wrapText: col.wrap === true, indent: alignOf(col) === 'left' ? 1 : 0 }, ...(i % 2 ? { fill: { patternType: 'solid', fgColor: { rgb: ZEBRA } } } : {}) };
      put(r, c, cellOf(row[c], col.type, s));
    });
    r += 1;
  });
  const last = r - 1;
  if (totals && rows.length) {
    const s = (c) => ({ font: { name: FONT, sz: 10, bold: true, color: { rgb: NAVY } }, fill: { patternType: 'solid', fgColor: { rgb: 'EAF7C9' } }, border: { ...border, top: { style: 'medium', color: { rgb: LIME } } }, alignment: { horizontal: columns[c] ? alignOf(columns[c]) : 'left', vertical: 'center', indent: 1 } });
    for (let c = 0; c < n; c++) {
      const how = totals.cols?.[c];
      const range = `${colName(c)}${first + 1}:${colName(c)}${last + 1}`;
      if (how === 'sum' || how === 'avg') put(r, c, { f: `${how === 'sum' ? 'SUM' : 'AVERAGE'}(${range})`, t: 'n', s: s(c), z: FMT[columns[c].type] || FMT.int });
      else if (how && how.f) put(r, c, { f: how.f.replace(/\{range\}/g, range), t: 'n', s: s(c), z: FMT[columns[c].type] || FMT.int });
      else put(r, c, { v: c === 0 ? totals.label || 'Tổng' : '', t: 's', s: s(c) });
    }
    r += 1;
  }
  if (notes.length) {
    r += 1;
    for (const note of notes) {
      put(r, 0, { v: note, t: 's', s: { font: { name: FONT, sz: 9, italic: true, color: { rgb: '6B7280' } } } });
      r += 1;
    }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r - 1, headRow), c: Math.max(n - 1, 0) } });
  ws['!merges'] = n > 1 ? [{ s: { r: 0, c: 0 }, e: { r: 0, c: n - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: n - 1 } }] : [];
  // Width: the wider of the header and the longest value (capped), unless given.
  ws['!cols'] = columns.map((col, c) => {
    if (col.width) return { wch: col.width };
    const longest = rows.reduce((m, row) => Math.max(m, String(row[c] ?? '').length), String(col.header).length);
    return { wch: Math.min(Math.max(longest + 2, col.type === 'money' ? 14 : 6), 48) };
  });
  ws['!rows'] = [{ hpt: 28 }, { hpt: 16 }, { hpt: 8 }, { hpt: 26 }, ...Array.from({ length: Math.max(r - 4, 0) }, () => ({ hpt: 20 }))];
  if (rows.length) ws['!autofilter'] = { ref: `A${headRow + 1}:${colName(n - 1)}${last + 1}` };
  return ws;
}

// Label / value pairs (a summary sheet).
export function infoSheet({ title, subtitle, pairs }) {
  return sheet({ title, subtitle, columns: [{ header: pairs.head?.[0] || '', width: 28 }, { header: pairs.head?.[1] || '', width: 40, type: 'text' }], rows: pairs.rows });
}

// Excel sheet names: ≤ 31 chars, no []:*?/\
const sheetName = (s) => String(s || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);

export function book(sheets, filename) {
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const [name, ws] of sheets) {
    let nm = sheetName(name);
    for (let i = 2; used.has(nm); i++) nm = sheetName(`${name} ${i}`);
    used.add(nm);
    XLSX.utils.book_append_sheet(wb, ws, nm);
  }
  XLSX.writeFile(wb, filename, { cellStyles: true });
}

// A file name that works everywhere (accents kept, spaces and odd signs → -).
export const fileName = (...parts) => `${parts.filter(Boolean).join('-').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()}.xlsx`;
