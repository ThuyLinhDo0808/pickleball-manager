// One look for every Excel file the app hands out (built with ExcelJS, loaded only when a
// file is made): a title, a subtitle (what / when), a coloured header row that stays in
// view, zebra rows with thin borders, money / % / dates formatted, an optional totals row
// with LIVE formulas, filters on the header — and, for files people fill in, drop-down
// lists and checks on the columns with fixed values, phone numbers kept as text.
//
// sheet(spec) only describes a sheet; book([[name, spec], …], filename) builds the file.

const NAVY = 'FF0B1F3A';
const LIME = 'FFB6E33C';
const ZEBRA = 'FFF3F6FA';
const LINE = 'FFD0D7E2';
const MUTED = 'FF6B7280';
const FONT = 'Arial';
const thin = { style: 'thin', color: { argb: LINE } };
const border = { top: thin, bottom: thin, left: thin, right: thin };
const FMT = { int: '#,##0', money: '#,##0 "đ"', percent: '0.0%', decimal: '0.00', date: 'dd/mm/yyyy', text: '@', phone: '@' };
const RIGHT = new Set(['int', 'money', 'percent', 'decimal']);
const alignOf = (col) => col.align || (col.header === '#' || col.header === 'STT' ? 'center' : RIGHT.has(col.type) ? 'right' : 'left');

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const toDate = (v) => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};
const colLetter = (n) => {
  let s = '';
  for (let c = n; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
};

/**
 * columns: [{ header, type, width, wrap, list: [values], decimal: { min, max }, prompt, muted }]
 *   type: text | phone (kept as text) | int | money | percent (fraction) | decimal | date (YYYY-MM-DD)
 * totals: { label, cols: { [i]: 'sum' | 'avg' | { f: 'FORMULA with {range}' } } }
 * blankRows: extra empty rows that still get the drop-downs / checks (files to fill in)
 */
export const sheet = (spec) => ({ notes: [], ...spec });
export const infoSheet = ({ title, subtitle, pairs }) => sheet({ title, subtitle, columns: [{ header: pairs.head?.[0] || '', width: 28 }, { header: pairs.head?.[1] || '', width: 40 }], rows: pairs.rows });

const sheetName = (s) => String(s || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);

function value(v, col) {
  if (v == null || v === '') return null;
  if (typeof v === 'object' && v.f) return { formula: v.f };
  if (col.type === 'date') return toDate(v) || String(v);
  if (RIGHT.has(col.type) && !Number.isNaN(Number(v)) && String(v).trim() !== '') return Number(v);
  return String(v);
}

function build(wb, name, spec, lists) {
  const { title, subtitle, columns, rows = [], totals, notes = [], footer, blankRows = 0 } = spec;
  const n = columns.length;
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  ws.columns = columns.map((col, c) => {
    if (col.width) return { width: col.width };
    const longest = rows.reduce((m, row) => Math.max(m, String(row[c] ?? '').length), String(col.header).length);
    return { width: Math.min(Math.max(longest + 3, col.type === 'money' ? 14 : col.list ? 16 : 7), 48) };
  });
  // Title + subtitle
  ws.getCell(1, 1).value = title || '';
  ws.getCell(1, 1).font = { name: FONT, size: 16, bold: true, color: { argb: NAVY } };
  ws.getCell(2, 1).value = [subtitle, footer || `NexusZone · ${stamp()}`].filter(Boolean).join('  ·  ');
  ws.getCell(2, 1).font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } };
  if (n > 1) {
    ws.mergeCells(1, 1, 1, n);
    ws.mergeCells(2, 1, 2, n);
  }
  ws.getRow(1).height = 28;
  ws.getRow(3).height = 6;
  // Header
  const head = ws.getRow(4);
  head.height = 26;
  columns.forEach((col, c) => {
    const cell = head.getCell(c + 1);
    cell.value = col.header;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.muted ? 'FF475569' : NAVY } };
    cell.alignment = { horizontal: alignOf(col), vertical: 'middle', wrapText: true, indent: alignOf(col) === 'left' ? 1 : 0 };
    cell.border = border;
    if (col.prompt) cell.note = { texts: [{ text: col.prompt }], margins: { insetmode: 'auto' } };
  });
  // Rows (and blank rows that keep the format for new entries)
  const first = 5;
  const total = rows.length + blankRows;
  for (let i = 0; i < total; i++) {
    const row = ws.getRow(first + i);
    row.height = 20;
    const data = rows[i];
    columns.forEach((col, c) => {
      const cell = row.getCell(c + 1);
      if (data) cell.value = value(data[c], col);
      cell.font = { name: FONT, size: 10, color: { argb: col.muted ? MUTED : 'FF111827' }, bold: c === 1 && columns[0]?.header === '#' };
      cell.border = border;
      cell.alignment = { horizontal: alignOf(col), vertical: 'middle', wrapText: col.wrap === true, indent: alignOf(col) === 'left' ? 1 : 0 };
      if (FMT[col.type]) cell.numFmt = FMT[col.type];
      if (i % 2 && data) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
    });
  }
  const last = first + Math.max(total, 1) - 1;
  // Drop-downs and checks, header to the last fill-in row
  columns.forEach((col, c) => {
    const L = colLetter(c + 1);
    const ref = `${L}${first}:${L}${Math.max(last, first)}`;
    if (col.list?.length) {
      const key = col.list.join('\u0001');
      if (!lists.map.has(key)) {
        const at = lists.map.size + 1;
        lists.values.push(col.list);
        lists.map.set(key, `Lists!$${colLetter(at)}$1:$${colLetter(at)}$${col.list.length}`);
      }
      ws.dataValidations.add(ref, { type: 'list', allowBlank: true, formulae: [lists.map.get(key)], showErrorMessage: true, errorStyle: 'stop', errorTitle: col.header, error: col.listError || col.list.join(' / '), showInputMessage: !!col.prompt, promptTitle: col.header, prompt: (col.prompt || '').slice(0, 250) });
    } else if (col.decimal) {
      ws.dataValidations.add(ref, { type: 'decimal', operator: 'between', allowBlank: true, formulae: [col.decimal.min, col.decimal.max], showErrorMessage: true, errorStyle: 'stop', errorTitle: col.header, error: col.decimal.error || `${col.decimal.min} – ${col.decimal.max}`, showInputMessage: !!col.prompt, promptTitle: col.header, prompt: (col.prompt || '').slice(0, 250) });
    } else if (col.prompt) {
      ws.dataValidations.add(ref, { type: 'custom', allowBlank: true, formulae: ['TRUE'], showInputMessage: true, promptTitle: col.header, prompt: col.prompt.slice(0, 250) });
    }
  });
  let r = first + total;
  if (totals && rows.length) {
    const tr = ws.getRow(r);
    tr.height = 22;
    columns.forEach((col, c) => {
      const cell = tr.getCell(c + 1);
      const how = totals.cols?.[c];
      const L = colLetter(c + 1);
      const range = `${L}${first}:${L}${first + rows.length - 1}`;
      if (how === 'sum' || how === 'avg') cell.value = { formula: `${how === 'sum' ? 'SUM' : 'AVERAGE'}(${range})` };
      else if (how && how.f) cell.value = { formula: how.f.replace(/\{range\}/g, range) };
      else cell.value = c === 0 ? totals.label || 'Tổng' : '';
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7C9' } };
      cell.border = { ...border, top: { style: 'medium', color: { argb: LIME } } };
      cell.alignment = { horizontal: alignOf(col), vertical: 'middle', indent: 1 };
      cell.numFmt = FMT[col.type] || FMT.int;
    });
    r += 1;
  }
  if (notes.length) {
    r += 1;
    for (const note of notes) {
      ws.getCell(r, 1).value = note;
      ws.getCell(r, 1).font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } };
      r += 1;
    }
  }
  if (rows.length || blankRows) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: n } };
}

export async function book(sheets, filename) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NexusZone';
  wb.created = new Date();
  const used = new Set();
  const named = sheets.map(([name, spec]) => {
    let nm = sheetName(name);
    for (let i = 2; used.has(nm); i++) nm = sheetName(`${name} ${i}`);
    used.add(nm);
    return [nm, spec];
  });
  const lists = { map: new Map(), values: [] };
  for (const [nm, spec] of named) build(wb, nm, spec, lists);
  if (lists.values.length) {
    // the drop-down values live on a hidden sheet (no length limit, no comma issues)
    const lw = wb.addWorksheet('Lists', { state: 'veryHidden' });
    lists.values.forEach((list, c) => list.forEach((v, r) => (lw.getCell(r + 1, c + 1).value = v)));
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// A file name that works everywhere (accents kept, spaces and odd signs → -).
export const fileName = (...parts) => `${parts.filter(Boolean).join('-').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()}.xlsx`;
