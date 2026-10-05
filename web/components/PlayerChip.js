'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/context/I18nContext';
import { levelTag } from '@/lib/levels';
import { dmy, my } from '@/lib/memberDates';
import { playDurationText } from '@/components/MemberExtras';

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][0] || '?').toUpperCase();
}

export function Avatar({ src, name, size = 36 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (src) return <img src={src} alt="" style={style} className="rounded-full object-cover shrink-0 bg-navy-700" />;
  return (
    <span style={style} aria-hidden="true" className="rounded-full shrink-0 bg-navy-700 text-lime-300 font-bold flex items-center justify-center">
      {initials(name)}
    </span>
  );
}

// The player's profile in a small card: who they are, level, rank, area, how long they play.
function ProfileCard({ name, card, sport, t }) {
  const c = card || {};
  const kind = c.member_type === 'fixed' ? t('members.fixed') : c.member_type ? t('members.guest') : t('playerCard.walkIn');
  const rows = [
    [t('common.level'), levelTag(c.level, sport, t)],
    sport === 'badminton' ? null : [t('playerCard.duprProfile'), c.dupr != null ? String(Number(c.dupr)) : null],
    [t('memberX.district'), c.district],
    [t('memberX.playDuration'), playDurationText(c.play_duration, t)],
    [t('members.gender'), c.gender ? t(`members.${c.gender}`) : null],
    [t('members.birthDate'), c.birth_date ? dmy(c.birth_date) : c.birth_year || null],
    [t('members.joined'), c.joined_on ? my(c.joined_on) : null],
    [t('common.phone'), c.phone],
  ].filter((r) => r && r[1]);
  return (
    <div className="w-72 rounded-xl border border-navy-600 bg-navy-900 shadow-2xl p-4 text-left">
      <div className="flex items-center gap-3">
        <Avatar src={c.avatar} name={name} size={56} />
        <div className="min-w-0">
          <div className="text-white font-semibold truncate">{name}</div>
          <div className="text-gray-400 text-xs flex items-center gap-1.5 mt-0.5">
            <span>{kind}</span>
          </div>
        </div>
      </div>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs mt-3">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-gray-400">{k}</dt>
              <dd className="text-gray-100 truncate">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-gray-500 text-xs mt-3">{t('playerCard.noInfo')}</p>
      )}
    </div>
  );
}

// Avatar + name, with level and rank underneath. Hovering a moment (or tapping) shows the
// player's profile card.
export default function PlayerChip({ name, card, badges = null }) {
  const { t, sport } = useI18n();
  const ref = useRef(null);
  const timer = useRef(null);
  const [pos, setPos] = useState(null);
  const level = levelTag(card?.level, sport, t);

  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = 288;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = r.bottom + 8;
    const top = below + 260 > window.innerHeight ? Math.max(8, r.top - 268) : below;
    setPos({ left, top });
  };
  const show = (delay) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(place, delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPos(null), 150);
  };
  useEffect(() => {
    if (!pos) return undefined;
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="flex items-center gap-2.5 text-left min-w-0 group"
        onMouseEnter={() => show(500)}
        onMouseLeave={hide}
        onFocus={() => show(0)}
        onBlur={hide}
        onClick={() => (pos ? setPos(null) : show(0))}
        aria-label={t('playerCard.open', { name })}
      >
        <Avatar src={card?.avatar} name={name} />
        <span className="min-w-0">
          <span className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
            <span className="text-white group-hover:text-lime-300 underline decoration-navy-600 underline-offset-4">{name}</span>
            {badges}
          </span>
          {level && (
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-0.5">
              <span>{level}</span>
            </span>
          )}
        </span>
      </button>
      {pos &&
        createPortal(
          <div
            role="dialog"
            aria-label={name}
            style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 80 }}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={hide}
          >
            <ProfileCard name={name} card={card} sport={sport} t={t} />
          </div>,
          document.body
        )}
    </>
  );
}
