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
