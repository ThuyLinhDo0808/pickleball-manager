// The matches of a session as JPGs to post in the group chat: who plays whom, and the score
// once it is in. Two columns of match cards, 16 matches per image (more matches = more
// images, "Trang 1/3"…), so every name stays readable on a phone even with 50+ matches.
// Drawn on a canvas, so it needs nothing beyond the browser.
import { formatDay, hhmm } from '@/lib/dates';

const C = { bg: '#0b1220', card: '#16213a', cardWin: '#1b2a1f', line: '#24324f', text: '#ffffff', dim: '#9aa6bd', lime: '#bef264', amber: '#fcd34d' };
const name = (mp) => mp.club_members?.full_name || mp.event_participants?.full_name || '?';
export const PER_IMAGE = 16;

const W = 1080;
const PAD = 40;
const GAP = 20;
const COLS = 2;
const CARD_H = 204;
const HEAD = 176;
const FOOT = 64;
const FONT = (size, weight = 400) => `${weight} ${size}px "Inter", "Segoe UI", Roboto, Arial, sans-serif`;

// Write `text` in at most `max` pixels: smaller type first (down to `min`), "…" only last.
function fitText(ctx, text, max, size, weight, min = 17) {
  for (let s = size; s >= min; s -= 1) {
    ctx.font = FONT(s, weight);
    if (ctx.measureText(text).width <= max) return text;
  }
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const sorted = (matches) => [...matches].sort((a, b) => String(a.played_at || a.created_at).localeCompare(String(b.played_at || b.created_at)));

// One image: matches [from, from + PER_IMAGE) of the session, numbered as in the session.
export function drawMatches(canvas, { event, matches, t, lang, page = 0 }) {
  const all = sorted(matches);
  const pages = Math.max(1, Math.ceil(all.length / PER_IMAGE));
  const list = all.slice(page * PER_IMAGE, (page + 1) * PER_IMAGE);
  const rows = Math.max(1, Math.ceil(list.length / COLS));
  const H = HEAD + rows * (CARD_H + GAP) - GAP + FOOT;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header: kicker, title, date · time · place.
  ctx.fillStyle = C.lime;
  ctx.font = FONT(24, 700);
  ctx.fillText(t('matches.title').toUpperCase(), PAD, 62);
  if (pages > 1) {
    ctx.textAlign = 'right';
    ctx.fillStyle = C.dim;
    ctx.font = FONT(24, 600);
    ctx.fillText(t('matches.imagePage', { n: page + 1, total: pages }), W - PAD, 62);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = C.text;
  ctx.fillText(fitText(ctx, event.title || '', W - PAD * 2, 42, 700, 28), PAD, 112);
  const when = [
    formatDay(event.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }),
    event.start_time ? `${hhmm(event.start_time)}${event.end_time ? `–${hhmm(event.end_time)}` : ''}` : null,
    event.location || null,
  ].filter(Boolean).join(' · ');
  ctx.fillStyle = C.dim;
  ctx.fillText(fitText(ctx, when, W - PAD * 2, 24, 400, 18), PAD, 148);

  const colW = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
  list.forEach((m, i) => {
    const x = PAD + (i % COLS) * (colW + GAP);
    const y = HEAD + Math.floor(i / COLS) * (CARD_H + GAP);
    const scored = m.team1_score != null && m.team2_score != null;
    const winner = !scored ? 0 : m.team1_score > m.team2_score ? 1 : m.team2_score > m.team1_score ? 2 : 0;

    roundRect(ctx, x, y, colW, CARD_H, 16);
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Match number · type, and "not scored" on the right.
    ctx.fillStyle = C.dim;
    ctx.font = FONT(20, 600);
    ctx.fillText(`${t('matches.matchN', { n: page * PER_IMAGE + i + 1 })} · ${t(`matches.${m.match_type}`)}`, x + 22, y + 34);
    if (!scored) {
      ctx.textAlign = 'right';
      ctx.fillStyle = C.amber;
      ctx.fillText(t('matches.notScored'), x + colW - 22, y + 34);
      ctx.textAlign = 'left';
    }

    // Two team blocks: one player per line, the score big on the right.
    const nameW = colW - 22 * 2 - 76;
    [1, 2].forEach((n) => {
      const top = y + 48 + (n - 1) * 78;
      if (n === 2) {
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 22, top - 4);
        ctx.lineTo(x + colW - 22, top - 4);
        ctx.stroke();
      }
      const win = winner === n;
      if (win) {
        ctx.fillStyle = C.lime;
        roundRect(ctx, x + 10, top + 6, 5, 60, 2.5);
        ctx.fill();
      }
      const players = (m.match_players || []).filter((p) => p.team === n).map(name);
      const lines = players.length ? players.slice(0, 2) : [t(`matches.team${n}`)];
      const lineY = lines.length === 1 ? [top + 46] : [top + 32, top + 64];
      lines.forEach((p, j) => {
        ctx.fillStyle = win ? C.lime : C.text;
        const s = fitText(ctx, p, nameW, 24, win ? 700 : 500);
        ctx.fillText(s, x + 24, lineY[j]);
      });
      ctx.textAlign = 'right';
      ctx.font = FONT(46, 800);
      ctx.fillStyle = win ? C.lime : scored ? C.text : C.dim;
      ctx.fillText(scored ? String(m[`team${n}_score`]) : '–', x + colW - 22, top + 56);
      ctx.textAlign = 'left';
    });
  });

  ctx.fillStyle = C.dim;
  ctx.font = FONT(20);
  ctx.textAlign = 'right';
  ctx.fillText(t('matches.imageFooter', { n: all.length }), W - PAD, H - 24);
  ctx.textAlign = 'left';
  return canvas;
}

const save = (canvas, file) =>
  new Promise((resolve) =>
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
        resolve();
      },
      'image/jpeg',
      0.92
    )
  );

// One JPG per 16 matches (tran-dau-<date>.jpg, or -1.jpg, -2.jpg… when there are more).
export async function exportMatchesJpg({ event, matches, t, lang }) {
  const pages = Math.max(1, Math.ceil(matches.length / PER_IMAGE));
  const base = `tran-dau-${event.event_date || 'buoi'}`;
  for (let page = 0; page < pages; page += 1) {
    const canvas = drawMatches(document.createElement('canvas'), { event, matches, t, lang, page });
    await save(canvas, pages > 1 ? `${base}-${page + 1}.jpg` : `${base}.jpg`);
    if (page < pages - 1) await new Promise((r) => setTimeout(r, 400));
  }
}
