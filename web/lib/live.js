// Small helpers shared by the live scoring pages.

// "Bảng 1 · Lượt 2", "Bán kết", "Đôi nam · Lượt 3"…
export function matchLabel(m, matches, t) {
  if (m.sub_match_id) return `${t(`league.sub_${m.format}`)} · ${t('live.roundN', { n: m.round })}`;
  if (m.stage === 'group') return `${t('live.groupN', { n: m.group_no })} · ${t('live.roundN', { n: m.round })}`;
  const rounds = Math.max(...matches.filter((x) => x.stage === 'knockout').map((x) => x.round), m.round);
  const left = rounds - m.round;
  if (left === 0) return t('tournaments.final');
  if (left === 1) return t('tournaments.semi');
  if (left === 2) return t('tournaments.quarter');
  return t('tournaments.roundOf', { n: 2 ** (left + 1) });
}

// Games so far as "11-7, 4-11" plus the running game.
export function gamesLine(state) {
  if (!state) return '';
  return state.games.map(([a, b]) => `${a}-${b}`).join(' · ');
}

export const sportIcon = (sport) => (sport === 'badminton' ? '🏸' : '🏓');

// "12:05" / "1:02:09" from seconds.
export function clock(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// "32 phút" / "1 giờ 05 phút" for finished matches.
export function minutesText(sec, t) {
  if (sec == null) return null;
  const m = Math.round(sec / 60);
  return m >= 60 ? t('timer.hoursMin', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') }) : t('timer.min', { m });
}

// Match time so far (or in total once finished) and the running game's time, in seconds.
export function elapsed(timing, now = Date.now()) {
  if (!timing?.started_at) return { match: null, game: null };
  const end = timing.ended_at || now;
  return {
    match: Math.max(0, (end - timing.started_at) / 1000),
    game: timing.game_started_at ? Math.max(0, (now - timing.game_started_at) / 1000) : null,
  };
}
