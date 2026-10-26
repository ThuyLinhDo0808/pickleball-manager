// "Bảng xếp hạng buổi" as one JPG to post in the group chat: the kèo, the top 3 on a podium
// (cup, name, win rate, record) and everyone else in a table (played, won, lost, point
// difference, win rate). Drawn on a canvas like the match images (lib/matchImage).
import { formatDay, hhmm } from '@/lib/dates';
import { fitText, roundRect, saveJpg, FONT } from '@/lib/matchImage';

const C = { bg: '#0b1220', panel: '#111c33', line: '#24324f', row: '#16213a', text: '#ffffff', dim: '#9aa6bd', lime: '#bef264', red: '#fca5a5', redRow: '#2a1d2a' };
// Podium blocks: 1 gold, 2 silver, 3 bronze.
const PLACE = {
  1: { fill: '#3a3a1c', stroke: '#e8c547', cup: '#facc15', h: 210 },
  2: { fill: '#26324a', stroke: '#94a3b8', cup: '#cbd5e1', h: 160 },
  3: { fill: '#33261f', stroke: '#c08457', cup: '#f0a868', h: 125 },
};

const W = 1080;
const PAD = 40;
const HEAD = 176;
const POD_H = 470;
const ROW_H = 56;
const TABLE_HEAD = 50;
const FOOT = 70;

const sign = (d) => (d > 0 ? `+${d}` : String(d));
const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();

function cup(ctx, cx, top, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 16, top);
  ctx.lineTo(cx + 16, top);
  ctx.quadraticCurveTo(cx + 16, top + 24, cx, top + 26);
  ctx.quadraticCurveTo(cx - 16, top + 24, cx - 16, top);
  ctx.fill();
  ctx.fillRect(cx - 3, top + 25, 6, 8);
  ctx.fillRect(cx - 11, top + 33, 22, 5);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx - 16, top + 9, 7, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.arc(cx + 16, top + 9, 7, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
}

export function drawStandings(canvas, { event, rows, scoredMatches, t, lang }) {
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const tableH = rest.length ? TABLE_HEAD + rest.length * ROW_H + 24 : 0;
  const H = HEAD + POD_H + tableH + FOOT;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header: kicker, kèo name, date · time · place.
  ctx.fillStyle = C.lime;
  ctx.font = FONT(24, 700);
  ctx.fillText(t('estand.title').toUpperCase(), PAD, 62);
  ctx.fillStyle = C.text;
  ctx.fillText(fitText(ctx, event.title || '', W - PAD * 2, 42, 700, 28), PAD, 112);
  const when = [
    event.event_date ? formatDay(event.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : null,
    event.start_time ? `${hhmm(event.start_time)}${event.end_time ? `–${hhmm(event.end_time)}` : ''}` : null,
    event.location || null,
  ].filter(Boolean).join(' · ');
  ctx.fillStyle = C.dim;
  ctx.fillText(fitText(ctx, when, W - PAD * 2, 24, 400, 18), PAD, 148);

  // Podium: 2 · 1 · 3, blocks standing on one floor line.
  roundRect(ctx, PAD, HEAD, W - PAD * 2, POD_H - 24, 20);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  const colW = 270;
  const gap = 24;
  const floor = HEAD + POD_H - 24 - 22; // blocks stand inside the panel
  const order = [2, 1, 3];
  const left = (W - (colW * 3 + gap * 2)) / 2;
  order.forEach((place, i) => {
    const r = top3[place - 1];
    if (!r) return;
    const p = PLACE[place];
    const x = left + i * (colW + gap);
    const cx = x + colW / 2;
    const blockTop = floor - p.h;
    // Block with cup and rank.
    roundRect(ctx, x, blockTop, colW, p.h, 14);
    ctx.fillStyle = p.fill;
    ctx.fill();
    ctx.strokeStyle = p.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    cup(ctx, cx, blockTop + 22, p.cup);
    ctx.textAlign = 'center';
    ctx.fillStyle = p.cup;
    ctx.font = FONT(44, 800);
    ctx.fillText(String(place), cx, blockTop + 108);
    // Above the block: avatar initial, name, win rate, record.
    const avY = blockTop - 150;
    ctx.beginPath();
    ctx.arc(cx, avY, place === 1 ? 38 : 32, 0, Math.PI * 2);
    ctx.fillStyle = '#0f1a2e';
    ctx.fill();
    ctx.strokeStyle = p.stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = C.lime;
    ctx.font = FONT(place === 1 ? 32 : 28, 800);
    ctx.fillText(initial(r.name), cx, avY + (place === 1 ? 11 : 10));
    ctx.fillStyle = C.text;
    ctx.fillText(fitText(ctx, r.name, colW - 10, 26, 700, 17), cx, blockTop - 78);
    ctx.fillStyle = C.lime;
    ctx.font = FONT(26, 800);
    ctx.fillText(`${r.rate}%`, cx, blockTop - 46);
    ctx.fillStyle = C.dim;
    ctx.fillText(fitText(ctx, `${t('cpeople.record', { n: r.played, w: r.won, l: r.lost })} · ${sign(r.diff)}`, colW - 10, 19, 400, 15), cx, blockTop - 18);
    ctx.textAlign = 'left';
  });

  // Table: everyone from rank 4.
  if (rest.length) {
    const top = HEAD + POD_H;
    const X = { rank: PAD + 34, name: PAD + 76, played: 560, won: 660, lost: 750, diff: 860, rate: W - PAD - 18 };
    roundRect(ctx, PAD, top, W - PAD * 2, tableH - 14, 16);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.dim;
    ctx.font = FONT(17, 700);
    ctx.textAlign = 'center';
    ctx.fillText('#', X.rank, top + 32);
    ctx.textAlign = 'left';
    ctx.fillText(t('common.name').toUpperCase(), X.name, top + 32);
    ctx.textAlign = 'right';
    [['played', 'estand.played'], ['won', 'estand.won'], ['lost', 'estand.lost'], ['diff', 'estand.diff'], ['rate', 'estand.rate']].forEach(([k, key]) => ctx.fillText(t(key).toUpperCase(), X[k], top + 32));
    rest.forEach((r, i) => {
      const y = top + TABLE_HEAD + i * ROW_H;
      const last = r.rank === rows.length;
      if (last || i % 2 === 0) {
        ctx.fillStyle = last ? C.redRow : C.row;
        ctx.fillRect(PAD + 2, y, W - PAD * 2 - 4, ROW_H);
      }
      const mid = y + ROW_H / 2 + 8;
      ctx.beginPath();
      ctx.arc(X.rank, y + ROW_H / 2, 17, 0, Math.PI * 2);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = C.text;
      ctx.font = FONT(18, 700);
      ctx.fillText(String(r.rank), X.rank, mid - 1);
      ctx.textAlign = 'left';
      ctx.fillText(fitText(ctx, r.name, X.played - 70 - X.name, 22, 600, 15), X.name, mid);
      ctx.textAlign = 'right';
      ctx.font = FONT(22, 500);
      ctx.fillStyle = C.text;
      ctx.fillText(String(r.played), X.played, mid);
      ctx.fillStyle = C.lime;
      ctx.fillText(String(r.won), X.won, mid);
      ctx.fillStyle = C.red;
      ctx.fillText(String(r.lost), X.lost, mid);
      ctx.fillStyle = r.diff < 0 ? C.red : C.text;
      ctx.fillText(sign(r.diff), X.diff, mid);
      ctx.fillStyle = C.text;
      ctx.font = FONT(22, 700);
      ctx.fillText(`${r.rate}%`, X.rate, mid);
      ctx.textAlign = 'left';
    });
  }

  ctx.fillStyle = C.dim;
  ctx.font = FONT(20);
  ctx.textAlign = 'right';
  ctx.fillText(t('estand.imageFooter', { n: rows.length, m: scoredMatches }), W - PAD, H - 26);
  ctx.textAlign = 'left';
  return canvas;
}

// bxh-<date>.jpg
export async function exportStandingsJpg({ event, rows, scoredMatches, t, lang }) {
  const canvas = drawStandings(document.createElement('canvas'), { event, rows, scoredMatches, t, lang });
  await saveJpg(canvas, `bxh-${event.event_date || 'buoi'}.jpg`);
}
