// The matches of a session as one JPG to post in the group chat: who plays whom, and the
// score once it is in. Drawn on a canvas, so it needs nothing beyond the browser.
import { formatDay, hhmm } from '@/lib/dates';

const C = { bg: '#0b1220', card: '#16213a', line: '#24324f', text: '#ffffff', dim: '#9aa6bd', lime: '#bef264', amber: '#fcd34d' };
const name = (mp) => mp.club_members?.full_name || mp.event_participants?.full_name || '?';

// Shorten text to fit `max` pixels.
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
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

export function drawMatches(canvas, { event, matches, t, lang }) {
  const list = [...matches].sort((a, b) => String(a.played_at).localeCompare(String(b.played_at)));
  const W = 1080;
  const PAD = 48;
  const ROW = 132;
  const HEAD = 190;
  const H = HEAD + list.length * (ROW + 16) + 70;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const font = (size, weight = 400) => `${weight} ${size}px "Inter", "Segoe UI", Roboto, Arial, sans-serif`;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = C.lime;
  ctx.font = font(26, 700);
  ctx.fillText(`🏓 ${t('matches.title').toUpperCase()}`, PAD, 70);
  ctx.fillStyle = C.text;
  ctx.font = font(44, 700);
  ctx.fillText(fit(ctx, event.title || '', W - PAD * 2), PAD, 124);
  const when = [
    formatDay(event.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }),
    event.start_time ? `${hhmm(event.start_time)}${event.end_time ? `–${hhmm(event.end_time)}` : ''}` : null,
    event.location || null,
  ].filter(Boolean).join(' · ');
  ctx.fillStyle = C.dim;
  ctx.font = font(26);
  ctx.fillText(fit(ctx, when, W - PAD * 2), PAD, 164);

  list.forEach((m, i) => {
    const y = HEAD + i * (ROW + 16);
    roundRect(ctx, PAD, y, W - PAD * 2, ROW, 18);
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    const scored = m.team1_score != null && m.team2_score != null;
    const winner = !scored ? 0 : m.team1_score > m.team2_score ? 1 : m.team2_score > m.team1_score ? 2 : 0;
    // number + type
    ctx.fillStyle = C.dim;
    ctx.font = font(22, 600);
    ctx.fillText(`${t('matches.matchN', { n: i + 1 })} · ${t(`matches.${m.match_type}`)}`, PAD + 28, y + 36);
    if (!scored) {
      ctx.fillStyle = C.amber;
      ctx.textAlign = 'right';
      ctx.fillText(t('matches.notScored'), W - PAD - 28, y + 36);
      ctx.textAlign = 'left';
    }
    // teams and scores
    [1, 2].forEach((n) => {
      const ty = y + 36 + n * 40;
      const players = (m.match_players || []).filter((p) => p.team === n).map(name).join(' & ');
      ctx.fillStyle = winner === n ? C.lime : C.text;
      ctx.font = font(30, winner === n ? 700 : 500);
      ctx.fillText(fit(ctx, `${winner === n ? '🏆 ' : ''}${players}`, W - PAD * 2 - 200), PAD + 28, ty);
      ctx.textAlign = 'right';
      ctx.font = font(36, 800);
      ctx.fillStyle = winner === n ? C.lime : scored ? C.text : C.dim;
      ctx.fillText(scored ? String(m[`team${n}_score`]) : '–', W - PAD - 28, ty + 2);
      ctx.textAlign = 'left';
    });
  });

  ctx.fillStyle = C.dim;
  ctx.font = font(20);
  ctx.textAlign = 'right';
  ctx.fillText(t('matches.imageFooter', { n: list.length }), W - PAD, H - 28);
  ctx.textAlign = 'left';
  return canvas;
}

export function exportMatchesJpg({ event, matches, t, lang }) {
  const canvas = drawMatches(document.createElement('canvas'), { event, matches, t, lang });
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tran-dau-${event.event_date || 'buoi'}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    'image/jpeg',
    0.92
  );
}
