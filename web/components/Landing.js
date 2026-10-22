'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
// Plus Jakarta Sans, self-hosted from the package (the CSP allows only our own fonts); it has
// the Vietnamese subset, so accents in big headings stay clean.
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';

// The public landing page ("/") for visitors who are not signed in. Instead of one long page it
// is a short deck of full-screen "scenes": a wheel turn, a swipe, the arrow keys or the dots move
// to the next one, and a 3D court behind them moves its camera from scene to scene. On small
// or short screens the same scenes simply stack and play their entrance when scrolled to.
// Every picture is drawn with plain markup (no external images or fonts: the site's CSP allows
// only its own).

const SIGN_UP = '/sign-in?mode=signUp';
const SIGN_IN = '/sign-in';
// Big enough for one scene per screen; below this the scenes stack and scroll normally.
const DECK_MQ = '(min-width: 768px) and (min-height: 600px)';
const PRELOAD_KEY = 'pb_lp_seen';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useMedia(query) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

// Whether the scene a component sits in is the one on screen (pictures start their own
// animations — counters, live score — only then).
const ActiveCtx = createContext(true);

// Camera for the court behind the scenes (rotateX, rotateZ, scale, shift x/y), where the ball
// sits on it (% of the court), and the colour of the glow — one set per scene.
const SCENES = [
  { key: 'intro', cam: [60, -28, 1.15, '16vw', '4vh'], ball: [52, 70], glow: ['#B6F03B', '#38BDF8'] },
  // Xé vé communities and clubs first: what NexusZone is about; then the players they serve.
  { key: 'social', cam: [66, 90, 1.3, '16vw', '10vh'], ball: [50, 52], glow: ['#FBBF24', '#B6F03B'] },
  { key: 'club', cam: [0, 0, 0.85, '-20vw', '2vh'], ball: [72, 38], glow: ['#B6F03B', '#34D399'] },
  { key: 'players', cam: [56, 34, 1.45, '18vw', '6vh'], ball: [32, 30], glow: ['#38BDF8', '#B6F03B'] },
  { key: 'play', cam: [48, -52, 1.8, '18vw', '-2vh'], ball: [40, 74], glow: ['#A78BFA', '#38BDF8'] },
  { key: 'start', cam: [74, 0, 1, '4vw', '30vh'], ball: [50, 30], glow: ['#B6F03B', '#34D399'] },
];
const pad = (n) => String(n).padStart(2, '0');

// ---- small shared pieces (also used by the sign-in page) ------------------------------------

// Slow-moving glows behind a section.
export function Aurora({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <span className="lp-blob lp-blob-a" />
      <span className="lp-blob lp-blob-b" />
      <span className="lp-blob lp-blob-c" />
    </div>
  );
}

export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-black tracking-tight ${className}`}>
      <span className="relative h-8 w-8 rounded-xl bg-lime-400 text-navy-950 grid place-items-center text-sm shadow-[0_0_24px_rgba(182,240,59,0.35)]" aria-hidden="true">
        NZ
      </span>
      <span className="text-white whitespace-nowrap">Nexus<span className="text-lime-400">Zone</span></span>
    </span>
  );
}

// Court lines: a pickleball court seen from above, very faint.
export function CourtLines() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[0.07]" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="#B6F03B" strokeWidth="2">
        <rect x="160" y="60" width="480" height="480" rx="4" />
        <line x1="160" y1="300" x2="640" y2="300" strokeWidth="4" />
        <line x1="160" y1="230" x2="640" y2="230" />
        <line x1="160" y1="370" x2="640" y2="370" />
        <line x1="400" y1="60" x2="400" y2="230" />
        <line x1="400" y1="370" x2="400" y2="540" />
      </g>
    </svg>
  );
}

// Counts from 0 to `to` when its scene comes on screen.
function CountUp({ to, fmt = (v) => Math.round(v).toLocaleString('vi-VN'), ms = 1400 }) {
  const active = useContext(ActiveCtx);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    if (reducedMotion()) {
      setV(to);
      return undefined;
    }
    let raf;
    const t0 = performance.now() + 500;
    const step = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, to, ms]);
  return <span>{fmt(v)}</span>;
}

// ---- product pictures (illustrative, drawn with markup) ---------------------------------

function DashboardMock() {
  const { t } = useI18n();
  const rows = [
    { time: '18:00', title: t('landing.mock_ev1'), n: '16/16', tone: 'bg-lime-400' },
    { time: '19:30', title: t('landing.mock_ev2'), n: '14/16', tone: 'bg-sky-400' },
    { time: '20:00', title: t('landing.mock_ev3'), n: '9/12', tone: 'bg-amber-300' },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-navy-900/90 p-4 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('landing.mock_today')}</span>
        <span className="flex gap-1" aria-hidden="true"><i className="h-2 w-2 rounded-full bg-red-400/70" /><i className="h-2 w-2 rounded-full bg-amber-300/70" /><i className="h-2 w-2 rounded-full bg-lime-400/70" /></span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          [t('landing.mock_members'), <CountUp key="m" to={128} />, 'text-white'],
          [t('landing.mock_income'), <CountUp key="i" to={18.4} fmt={(v) => `${v.toFixed(1).replace('.', ',')}tr`} />, 'text-lime-300'],
          [t('landing.mock_checkin'), <CountUp key="c" to={92} fmt={(v) => `${Math.round(v)}%`} />, 'text-sky-300'],
        ].map(([k, v, c]) => (
          <div key={k} className="rounded-xl border border-white/5 bg-navy-800 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 truncate">{k}</p>
            <p className={`text-lg font-black tabular-nums ${c}`}>{v}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.time} className="flex items-center gap-3 rounded-xl bg-navy-800/70 px-3 py-2">
            <span className={`h-8 w-1 rounded-full ${r.tone}`} aria-hidden="true" />
            <span className="text-xs tabular-nums text-gray-400 w-10">{r.time}</span>
            <span className="flex-1 truncate text-sm text-white">{r.title}</span>
            <span className="text-xs tabular-nums text-gray-300">{r.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LiveScoreMock({ className = '' }) {
  const { t } = useI18n();
  // A rally every couple of seconds: 7-9 … 11-9, then a new game.
  const SEQ = [[7, 9], [8, 9], [9, 9], [10, 9], [11, 9]];
  const [i, setI] = useState(SEQ.length - 1);
  useEffect(() => {
    if (reducedMotion()) return undefined;
    const id = setInterval(() => setI((x) => (x + 1) % SEQ.length), 1800);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [a, b] = SEQ[i];
  return (
    <div className={`rounded-2xl border border-white/10 bg-navy-950/95 p-3.5 shadow-2xl shadow-black/60 ${className}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" aria-hidden="true" /> {t('landing.mock_live')}
      </p>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <span className="text-white font-semibold">Minh / Lan</span>
        <span key={`a${a}`} className="lp-pop text-lime-300 font-black tabular-nums text-lg leading-none">{a}</span>
        <span className="text-gray-400">Huy / Thảo</span>
        <span className="text-gray-300 font-black tabular-nums text-lg leading-none">{b}</span>
      </div>
      <p className="mt-1.5 text-[10px] text-gray-500">{t('landing.mock_game')}</p>
    </div>
  );
}

export function DuprMock({ className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`rounded-2xl border border-white/10 bg-navy-900/95 p-3.5 shadow-2xl shadow-black/60 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('landing.mock_dupr')}</p>
      <p className="mt-0.5 text-2xl font-black tabular-nums text-white">3.412 <span className="text-xs font-semibold text-lime-300">▲ 0.125</span></p>
      <svg viewBox="0 0 120 32" className="mt-1 h-8 w-32" aria-hidden="true">
        <polyline className="lp-draw" points="2,26 22,24 42,25 62,18 82,15 102,9 118,6" fill="none" stroke="#B6F03B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
        <circle cx="118" cy="6" r="3" fill="#B6F03B" />
      </svg>
    </div>
  );
}

export function TicketMock({ className = '' }) {
  const { t } = useI18n();
  // A tiny QR-like pattern (decorative only).
  const cells = '1110111010010111011010101100111010110010011101101'.split('');
  return (
    <div className={`rounded-2xl bg-white p-3 text-navy-950 shadow-2xl shadow-black/60 ${className}`}>
      <p className="text-[10px] font-black uppercase tracking-wider">{t('landing.mock_ticket')}</p>
      <div className="mt-2 grid grid-cols-7 gap-[2px] w-20" aria-hidden="true">
        {cells.map((c, i) => <span key={i} className={`aspect-square rounded-[1px] ${c === '1' ? 'bg-navy-950' : 'bg-transparent'}`} />)}
      </div>
      <p className="mt-2 text-[10px] font-semibold text-gray-600">#A7K2 · 19:30</p>
    </div>
  );
}

// The sign-up page of one kèo, inside a phone.
function PhoneSignup() {
  const { t } = useI18n();
  return (
    <div className="relative mx-auto w-[min(17rem,70vw)] rounded-[2.4rem] border border-white/15 bg-navy-950 p-2.5 shadow-[0_40px_90px_-30px_rgba(56,189,248,0.45)]">
      <div className="rounded-[1.9rem] bg-navy-900 px-4 pb-5 pt-7">
        <span className="absolute left-1/2 top-4 h-1.5 w-16 -translate-x-1/2 rounded-full bg-white/10" />
        <p className="text-[10px] text-gray-500">pickleball-manager.vn/e/7k2q</p>
        <p className="mt-1 font-bold text-white leading-snug">{t('landing.mock_ev2')}</p>
        <p className="mt-0.5 text-xs text-gray-400">19:30 · Sân 2</p>
        <div className="mt-4 h-2 rounded-full bg-navy-700 overflow-hidden"><div className="lp-fill h-full bg-sky-400" style={{ '--w': '87%' }} /></div>
        <p className="mt-1.5 text-xs text-gray-400">{t('landing.mock_slots')}</p>
        <div className="mt-4 flex flex-col gap-2">
          <span className="rounded-xl bg-lime-400 py-2.5 text-center text-xs font-bold text-navy-950">{t('landing.mock_join')}</span>
          <span className="rounded-xl border border-white/15 py-2.5 text-center text-xs text-gray-300">VietQR · 120.000đ</span>
        </div>
      </div>
    </div>
  );
}

function FinanceCard() {
  const { t } = useI18n();
  const bars = [42, 58, 51, 73, 66, 88];
  return (
    <div className="rounded-3xl border border-white/10 bg-navy-900/90 p-5 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400">{t('landing.mock_income')}</p>
          <p className="text-3xl font-black text-white tabular-nums"><CountUp to={18400000} />đ</p>
        </div>
        <span className="text-xs font-semibold text-lime-300">▲ 12%</span>
      </div>
      <div className="mt-5 flex items-end gap-2 h-28">
        {bars.map((h, i) => <span key={i} className={`lp-bar flex-1 rounded-t-md ${i === bars.length - 1 ? 'bg-lime-400' : 'bg-navy-600'}`} style={{ height: `${h}%`, '--d': `${600 + i * 80}ms` }} />)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <span className="rounded-lg bg-navy-950/70 px-3 py-2 text-gray-300">{t('landing.mock_fund')} <b className="text-white">6,2tr</b></span>
        <span className="rounded-lg bg-navy-950/70 px-3 py-2 text-gray-300">{t('landing.mock_debt')} <b className="text-amber-300">3</b></span>
      </div>
    </div>
  );
}

function RolesCard() {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-white/10 bg-navy-950/95 p-3.5 shadow-2xl shadow-black/60">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('landing.role_title')}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {['role_co', 'role_fin', 'role_ops', 'role_ref'].map((k, i) => (
          <span key={k} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${i === 0 ? 'bg-lime-400 text-navy-950' : 'bg-white/5 text-gray-200 border border-white/10'}`}>{t(`landing.${k}`)}</span>
        ))}
      </div>
    </div>
  );
}

function SeriesCard() {
  const { t } = useI18n();
  const rows = [
    { d: 'T2', title: t('landing.mock_ev2'), n: 16, of: 16 },
    { d: 'T4', title: t('landing.mock_ev3'), n: 11, of: 12 },
    { d: 'T6', title: t('landing.mock_ev2'), n: 9, of: 16 },
  ];
  return (
    <div className="rounded-3xl border border-white/10 bg-navy-900/90 p-5 shadow-2xl shadow-black/50 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('landing.mock_series')}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={r.d} className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-300/15 text-xs font-bold text-amber-200">{r.d}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-white">{r.title}</span>
              <span className="mt-1 block h-1.5 rounded-full bg-navy-700 overflow-hidden"><span className="lp-fill block h-full bg-amber-300" style={{ '--w': `${(r.n / r.of) * 100}%`, '--d': `${700 + i * 120}ms` }} /></span>
            </span>
            <span className="text-xs tabular-nums text-gray-300">{r.n}/{r.of}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProfitCard() {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-white/10 bg-navy-950/95 p-3.5 shadow-2xl shadow-black/60">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('landing.mock_profit')}</p>
      <p className="mt-0.5 text-2xl font-black tabular-nums text-lime-300">+<CountUp to={2.4} fmt={(v) => `${v.toFixed(1).replace('.', ',')}tr`} /></p>
      <p className="mt-1 text-[11px] text-amber-200">🏆 {t('landing.mock_top')}</p>
    </div>
  );
}

function Bracket() {
  const rounds = [
    ['Minh / Lan', 'Huy / Thảo', 'Tùng / Vy', 'An / Bình'],
    ['Minh / Lan', 'Tùng / Vy'],
    ['Minh / Lan'],
  ];
  return (
    <div className="rounded-3xl border border-white/10 bg-navy-900/90 p-5 shadow-2xl shadow-black/50 backdrop-blur flex items-stretch gap-3">
      {rounds.map((r, ri) => (
        <div key={ri} className="flex-1 flex flex-col justify-around gap-3 min-h-[200px]">
          {r.map((p, i) => (
            <div key={i} className={`rounded-lg border px-2.5 py-2 text-xs truncate ${ri === 2 ? 'border-lime-400/60 bg-lime-400/10 text-lime-200 font-bold' : 'border-white/10 bg-navy-950/70 text-gray-200'}`}>
              {ri === 2 && '🏆 '}{p}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---- the 3D court behind every scene ----------------------------------------------------------

export function Stage({ scene: s, idx = 0, ghost }) {
  const [rx, rz, cs, cx, cy] = s.cam;
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <span className="lp-glow" style={{ left: `${idx % 2 ? 8 : 58}%`, top: `${idx % 3 === 1 ? 50 : 4}%`, backgroundColor: s.glow[0] }} />
      <span className="lp-glow lp-glow-2" style={{ left: `${idx % 2 ? 62 : 2}%`, top: `${idx % 2 ? 0 : 56}%`, backgroundColor: s.glow[1] }} />
      {ghost && <span key={ghost} className="lp-ghost absolute right-[4vw] bottom-[2vh] select-none">{ghost}</span>}
      <div className="lp-par absolute inset-0 [perspective:1400px]">
        <div className="absolute left-1/2 top-1/2 h-0 w-0 [transform-style:preserve-3d]">
          <div className="lp-cam" style={{ '--rx': `${rx}deg`, '--rz': `${rz}deg`, '--cs': cs, '--cx': cx, '--cy': cy }}>
            <div className="lp-court">
              <svg viewBox="0 0 300 600" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <rect x="20" y="20" width="260" height="560" rx="6" fill="rgba(182,240,59,0.025)" stroke="rgba(182,240,59,0.28)" strokeWidth="2" />
                <line x1="20" y1="300" x2="280" y2="300" stroke="rgba(255,255,255,0.4)" strokeWidth="3" />
                <line x1="20" y1="212" x2="280" y2="212" stroke="rgba(182,240,59,0.28)" strokeWidth="2" />
                <line x1="20" y1="388" x2="280" y2="388" stroke="rgba(182,240,59,0.28)" strokeWidth="2" />
                <line x1="150" y1="20" x2="150" y2="212" stroke="rgba(182,240,59,0.28)" strokeWidth="2" />
                <line x1="150" y1="388" x2="150" y2="580" stroke="rgba(182,240,59,0.28)" strokeWidth="2" />
                <rect x="20" y="212" width="260" height="176" fill="rgba(182,240,59,0.04)" />
              </svg>
              <div className="lp-ballpos" style={{ left: `${s.ball[0]}%`, top: `${s.ball[1]}%` }}>
                <span className="lp-ball-shadow" />
                <span className="lp-billboard">
                  <span className="lp-bounce block">
                    <svg viewBox="0 0 40 40" className="h-7 w-7 lp-ball-spin" aria-hidden="true">
                      <circle cx="20" cy="20" r="18" fill="#D9F95E" />
                      {[[12, 12], [24, 10], [30, 20], [20, 22], [10, 24], [22, 31]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill="#9DBF2E" />)}
                    </svg>
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(7,12,24,0.85)_100%)]" />
    </div>
  );
}

// ---- scene building blocks -------------------------------------------------------------------

// A heading whose words rise one by one out of a mask.
export function Words({ text, base = 0, step = 45, className = '' }) {
  return text.split(' ').map((w, i) => (
    <span key={i}>
      <span className="lp-w">
        <span className={className} style={{ '--d': `${base + i * step}ms` }}>{w}</span>
      </span>{' '}
    </span>
  ));
}

// Fades and slides in after the heading; `d` staggers (ms).
export function F({ d = 0, as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`lp-f ${className}`} style={{ '--d': `${d}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

function Eyebrow({ n, children }) {
  return (
    <F d={0} as="p" className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-lime-300">
      <span className="tabular-nums text-gray-500">{pad(n)}</span>
      <span className="h-px w-10 bg-lime-400/60" aria-hidden="true" />
      {children}
    </F>
  );
}

// Three short tags in place of a list of features.
function Chips({ keys, d = 250 }) {
  const { t } = useI18n();
  return (
    <ul className="mt-7 flex flex-wrap gap-2">
      {keys.map((k, i) => (
        <F as="li" key={k} d={d + i * 70} className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-gray-200">
          {t(k)}
        </F>
      ))}
    </ul>
  );
}

function Cta({ href, children, primary, d = 600 }) {
  return (
    <F d={d} className="mt-8">
      <Link
        href={href}
        className={`group relative inline-flex h-12 items-center gap-3 overflow-hidden rounded-full px-7 text-base font-bold transition ${primary ? 'lp-btn-glow bg-lime-400 text-navy-950' : 'border border-white/20 text-white hover:border-lime-400/60'}`}
      >
        <span className="relative z-10">{children}</span>
        <span className="relative z-10 inline-block transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">→</span>
      </Link>
    </F>
  );
}

const H2 = '[text-wrap:balance] text-[clamp(2.2rem,3.2vw+2.2vh,4.6rem)] font-extrabold leading-[1.05] tracking-tight text-white';

function Split({ text, visual, flip }) {
  return (
    <div className="mx-auto grid h-full w-full max-w-[1440px] content-center items-center gap-10 px-5 pb-24 pt-24 sm:px-10 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:px-16 lg:pb-20">
      <div className={`max-w-2xl ${flip ? 'lg:order-2' : ''}`}>{text}</div>
      <div className={`lp-v relative ${flip ? 'lg:order-1' : ''}`} aria-hidden="true"><div className="lp-tilt">{visual}</div></div>
    </div>
  );
}

// ---- the scenes ------------------------------------------------------------------------------

function IntroScene() {
  const { t } = useI18n();
  return (
    <div className="mx-auto grid h-full w-full max-w-[1440px] content-center items-center gap-12 px-5 pb-24 pt-28 sm:px-10 lg:grid-cols-[1.45fr_1fr] lg:px-16 lg:pb-20">
      <div>
        <F d={0} as="p" className="inline-flex items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-lime-300">
          <span className="relative flex h-2 w-2" aria-hidden="true"><span className="absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75 animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-lime-400" /></span>
          {t('landing.hero_eyebrow')}
        </F>
        <h1 className="mt-7 text-[clamp(2.6rem,2.7vw+2.2vh,5.4rem)] font-extrabold leading-[1.04] [text-wrap:balance] tracking-tight text-white">
          <span className="block"><Words text={t('landing.hero_title_1')} /></span>
          <span className="block"><Words text={t('landing.hero_title_2')} base={180} className="lp-sheen-text" /></span>
        </h1>
        <F d={250} as="p" className="mt-7 max-w-lg text-xl leading-relaxed text-gray-300">{t('landing.hero_short')}</F>
        {/* Nexus (where everything meets) + Zone (your own ground) */}
        <F d={320} as="p" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
          <span><b className="text-white">Nexus</b> · {t('landing.brand_nexus')}</span>
          <span><b className="text-lime-300">Zone</b> · {t('landing.brand_zone')}</span>
        </F>
        <F d={380} className="mt-9 flex flex-wrap gap-3">
          <Link href={SIGN_UP} className="lp-btn-glow group relative inline-flex h-12 items-center overflow-hidden rounded-full bg-lime-400 px-7 text-base font-bold text-navy-950">
            <span className="relative z-10">{t('landing.hero_cta')} <span className="inline-block transition-transform group-hover:translate-x-1">→</span></span>
          </Link>
          <Link href="/discover" className="inline-flex h-12 items-center rounded-full border border-white/15 px-7 text-base font-semibold text-white backdrop-blur transition hover:border-white/40">
            {t('landing.hero_cta2')}
          </Link>
        </F>
      </div>
      <div className="lp-v relative hidden lg:block" aria-hidden="true">
        <div className="lp-tilt relative pb-24 pt-12">
          <DashboardMock />
          <div className="absolute -left-10 bottom-0 w-52 [transform:translateZ(60px)]"><LiveScoreMock className="lp-float" /></div>
          <div className="absolute -right-4 -top-6 w-48 [transform:translateZ(80px)]"><DuprMock className="lp-float-slow" /></div>
          <div className="absolute -bottom-6 right-2 w-28 [transform:translateZ(40px)]"><TicketMock className="lp-float" /></div>
        </div>
      </div>
    </div>
  );
}

function RoleScene({ n, k, visual, flip, primary }) {
  const { t } = useI18n();
  return (
    <Split
      flip={flip}
      text={
        <>
          <Eyebrow n={n}>{t(`landing.${k}_tag`)}</Eyebrow>
          <h2 className={`mt-6 ${H2}`}><Words text={t(`landing.${k}_title`)} /></h2>
          <F d={150} as="p" className="mt-5 max-w-md text-xl leading-relaxed text-gray-300">{t(`landing.${k}_short`)}</F>
          <Chips keys={[1, 2, 3].map((i) => `landing.${k}_k${i}`)} />
          <Cta href={SIGN_UP} primary={primary}>{t(`landing.${k}_cta`)}</Cta>
        </>
      }
      visual={visual}
    />
  );
}

function PlayScene() {
  const { t } = useI18n();
  return (
    <Split
      text={
        <>
          <Eyebrow n={5}>{t('landing.play_eyebrow')}</Eyebrow>
          <h2 className={`mt-6 ${H2}`}><Words text={t('landing.play_title')} /></h2>
          <F d={150} as="p" className="mt-5 max-w-md text-xl leading-relaxed text-gray-300">{t('landing.play_short')}</F>
          <Chips keys={[1, 2, 3].map((i) => `landing.play_k${i}`)} />
          <Cta href={SIGN_UP}>{t('landing.c_cta')}</Cta>
        </>
      }
      visual={
        <div className="relative pb-10 pt-6">
          <Bracket />
          <div className="absolute -left-8 -bottom-4 w-48 [transform:translateZ(60px)]"><LiveScoreMock className="lp-float" /></div>
          <div className="absolute -right-4 -top-10 w-48 [transform:translateZ(80px)]"><DuprMock className="lp-float-slow" /></div>
        </div>
      }
    />
  );
}

function StartScene() {
  const { t } = useI18n();
  return (
    <div className="mx-auto grid h-full w-full max-w-[1440px] content-center items-center gap-10 px-5 pb-24 pt-24 sm:px-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-16 lg:pb-20">
      <div>
        <Eyebrow n={6}>{t('landing.how_eyebrow')}</Eyebrow>
        <h2 className={`mt-6 ${H2}`}><Words text={t('landing.cta_title')} /></h2>
        <F d={150} as="p" className="mt-5 max-w-md text-xl text-gray-300">{t('landing.cta_short')}</F>
        <ol className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-300">
          {[1, 2, 3].map((n) => (
            <F as="li" key={n} d={200 + n * 90} className="flex items-center gap-3">
              <span className="font-bold tabular-nums text-lime-400">{pad(n)}</span>
              {t(`landing.step${n}_t`)}
              {n < 3 && <span className="text-gray-600" aria-hidden="true">→</span>}
            </F>
          ))}
        </ol>
        <F d={600} className="mt-9 flex flex-wrap gap-3">
          <Link href={SIGN_UP} className="lp-btn-glow group relative inline-flex h-12 items-center overflow-hidden rounded-full bg-lime-400 px-7 font-bold text-navy-950">
            <span className="relative z-10">{t('landing.cta_btn')} →</span>
          </Link>
          <Link href={SIGN_IN} className="inline-flex h-12 items-center rounded-full border border-white/20 px-7 font-semibold text-white transition hover:border-white/40">{t('landing.cta_btn2')}</Link>
        </F>
      </div>
      <F d={300} className="min-w-0">
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-gray-400">{t('landing.faq_title')}</h3>
        <div data-lp-scroll className="lp-faq mt-4 flex max-h-[min(52vh,30rem)] flex-col overflow-y-auto overscroll-contain border-t border-white/10 pr-2">
          {[0, 1, 2, 3, 4].map((n) => (
            <details key={n} className="group border-b border-white/10 py-3.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-white">
                {t(`landing.q${n}`)}
                <span className="text-xl text-lime-400 transition group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{t(`landing.a${n}`)}</p>
            </details>
          ))}
        </div>
        <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500" aria-label={t('landing.footerNav')}>
          <Link href="/discover" className="hover:text-white">{t('landing.footer_discover')}</Link>
          <Link href="/terms" className="hover:text-white">{t('landing.footer_terms')}</Link>
          <Link href="/privacy" className="hover:text-white">{t('landing.footer_privacy')}</Link>
          <span>© {new Date().getFullYear()} NexusZone</span>
        </nav>
      </F>
    </div>
  );
}

function SceneBody({ k }) {
  switch (k) {
    case 'intro':
      return <IntroScene />;
    case 'players':
      return <RoleScene n={4} k="p" visual={<div className="relative py-6"><PhoneSignup /><div className="absolute right-[6%] bottom-0 w-28 rotate-6 [transform:translateZ(70px)]"><TicketMock className="lp-float" /></div></div>} />;
    case 'club':
      return (
        <RoleScene
          n={3}
          k="c"
          flip
          visual={<div className="relative pb-14 pt-4"><FinanceCard /><div className="absolute -bottom-2 -right-4 w-60 [transform:translateZ(70px)]"><RolesCard /></div></div>}
        />
      );
    case 'social':
      return <RoleScene n={2} k="s" primary visual={<div className="relative pb-14 pt-4"><SeriesCard /><div className="absolute -bottom-10 -left-6 w-48 [transform:translateZ(70px)]"><ProfitCard /></div></div>} />;
    case 'play':
      return <PlayScene />;
    default:
      return <StartScene />;
  }
}

// ---- chrome: header, menu, counter, dots, cursor, preloader ---------------------------------

function Header({ onMenu, menuOpen }) {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center gap-3 px-5 sm:px-10 lg:px-16">
        <Link href="/" aria-label="NexusZone"><Logo className="text-base" /></Link>
        <div className="ml-auto flex items-center gap-1.5 whitespace-nowrap sm:gap-2">
          <button type="button" onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="hidden h-9 items-center rounded-full px-3 text-xs font-semibold text-gray-300 hover:text-white sm:inline-flex" aria-label={t('landing.switchLang')}>
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
          <Link href={SIGN_IN} className="hidden h-9 items-center rounded-full px-3 text-sm font-semibold text-white hover:text-lime-300 sm:inline-flex sm:px-4">{t('landing.signIn')}</Link>
          <Link href={SIGN_UP} className="inline-flex h-9 items-center rounded-full bg-lime-400 px-4 text-sm font-bold text-navy-950 transition hover:bg-lime-300">{t('landing.start')}</Link>
          <button
            type="button"
            onClick={onMenu}
            aria-expanded={menuOpen}
            aria-controls="lp-menu"
            className="group ml-1 inline-flex h-9 items-center gap-2 rounded-full border border-white/15 px-3.5 text-sm font-semibold text-white backdrop-blur transition hover:border-lime-400/60"
          >
            <span className="flex w-4 flex-col gap-[3px]" aria-hidden="true">
              <span className={`h-px w-full bg-current transition ${menuOpen ? 'translate-y-[2px] rotate-45' : ''}`} />
              <span className={`h-px w-full bg-current transition ${menuOpen ? '-translate-y-[2px] -rotate-45' : 'w-2/3 group-hover:w-full'}`} />
            </span>
            {menuOpen ? t('common.close') : t('landing.menu')}
          </button>
        </div>
      </div>
    </header>
  );
}

// Full-screen index of the scenes (plus sign-in and legal links).
function Menu({ open, idx, onPick, onClose }) {
  const { t, lang, setLang } = useI18n();
  const first = useRef(null);
  const [hover, setHover] = useState(idx);
  useEffect(() => {
    if (!open) return undefined;
    setHover(idx);
    first.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, idx, onClose]);
  return (
    <div id="lp-menu" className={`lp-menu fixed inset-0 z-30 bg-navy-950/95 backdrop-blur-xl ${open ? 'is-open' : ''}`} inert={!open} role="dialog" aria-modal="true" aria-label={t('landing.menu')}>
      <div className="mx-auto grid h-full w-full max-w-[1440px] items-center gap-10 overflow-y-auto px-5 pb-12 pt-28 sm:px-10 lg:grid-cols-[1.4fr_1fr] lg:px-16">
        <ol className="flex flex-col">
          {SCENES.map((s, i) => (
            <li key={s.key} className="lp-menu-item border-b border-white/10" style={{ '--d': `${80 + i * 50}ms` }}>
              <button
                ref={i === 0 ? first : undefined}
                type="button"
                onClick={() => onPick(i)}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                aria-current={i === idx ? 'step' : undefined}
                className="group flex w-full items-baseline gap-5 py-3 text-left sm:py-4"
              >
                <span className={`w-8 text-sm tabular-nums ${i === idx ? 'text-lime-400' : 'text-gray-500'}`}>{pad(i + 1)}</span>
                <span className={`text-[clamp(1.8rem,2.4vw+2vh,4rem)] font-black leading-none tracking-tight transition duration-500 group-hover:translate-x-3 ${hover === i ? 'text-white' : 'text-white/35'}`}>
                  {t(`landing.sc_${s.key}`)}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="lp-menu-item flex flex-col gap-6 text-sm text-gray-400" style={{ '--d': '420ms' }}>
          <p key={hover} className="lp-fadein max-w-sm text-lg leading-relaxed text-gray-300">{t(`landing.scd_${SCENES[hover].key}`)}</p>
          <div className="flex flex-wrap gap-3">
            <Link href={SIGN_UP} className="inline-flex h-11 items-center rounded-full bg-lime-400 px-6 font-bold text-navy-950">{t('landing.hero_cta')}</Link>
            <Link href={SIGN_IN} className="inline-flex h-11 items-center rounded-full border border-white/20 px-6 font-semibold text-white">{t('landing.signIn')}</Link>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/discover" className="hover:text-white">{t('landing.footer_discover')}</Link>
            <Link href="/terms" className="hover:text-white">{t('landing.footer_terms')}</Link>
            <Link href="/privacy" className="hover:text-white">{t('landing.footer_privacy')}</Link>
            <button type="button" className="hover:text-white" onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} aria-label={t('landing.switchLang')}>{lang === 'vi' ? 'English' : 'Tiếng Việt'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Bottom bar in deck mode: big scene counter with progress, prev/next, and the dots.
function DeckControls({ idx, go }) {
  const { t } = useI18n();
  const n = SCENES.length;
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
        <div className="mx-auto flex w-full max-w-[1440px] items-end justify-between gap-6 px-5 pb-7 sm:px-10 lg:px-16">
          <div className="flex items-end gap-4" aria-live="polite">
            <span className="relative block h-[3.2rem] overflow-hidden text-5xl font-black leading-none tabular-nums text-white">
              <span key={idx} className="lp-roll block">{pad(idx + 1)}</span>
            </span>
            <span className="pb-1">
              <span className="block text-xs tabular-nums text-gray-500">/ {pad(n)}</span>
              <span key={`l${idx}`} className="lp-fadein block text-sm font-semibold text-gray-200">{t(`landing.sc_${SCENES[idx].key}`)}</span>
            </span>
            <span className="mb-2 ml-2 hidden h-px w-32 bg-white/15 lg:block" aria-hidden="true">
              <span className="block h-px bg-lime-400 transition-[width] duration-1000 ease-out" style={{ width: `${((idx + 1) / n) * 100}%` }} />
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-4">
            <span className="hidden text-xs text-gray-500 xl:inline">{t('landing.hint')}</span>
            <button type="button" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label={t('landing.prev')} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-white transition hover:border-lime-400 hover:text-lime-300 disabled:opacity-30">↑</button>
            <button type="button" onClick={() => go(idx + 1)} disabled={idx === n - 1} aria-label={t('landing.next')} className="grid h-11 w-11 place-items-center rounded-full bg-white text-navy-950 transition hover:bg-lime-400 disabled:opacity-30">↓</button>
          </div>
        </div>
      </div>
      <nav className="fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-1 lg:flex xl:right-8" aria-label={t('landing.navLabel')}>
        {SCENES.map((s, i) => (
          <button key={s.key} type="button" onClick={() => go(i)} aria-label={t(`landing.sc_${s.key}`)} aria-current={i === idx ? 'step' : undefined} className="group flex h-6 items-center justify-end gap-3">
            <span className="text-xs text-gray-300 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">{t(`landing.sc_${s.key}`)}</span>
            <span className={`block h-px transition-all duration-500 ${i === idx ? 'w-8 bg-lime-400' : 'w-3 bg-white/40 group-hover:w-5'}`} />
          </button>
        ))}
      </nav>
    </>
  );
}

// A soft ring that trails the pointer and grows over links and buttons (mouse only).
function Cursor() {
  const ring = useRef(null);
  const dot = useRef(null);
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches || reducedMotion()) return undefined;
    let x = -100;
    let y = -100;
    let rx = x;
    let ry = y;
    let raf;
    const move = (e) => {
      x = e.clientX;
      y = e.clientY;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px,${y}px,0)`;
    };
    const over = (e) => ring.current?.classList.toggle('big', !!e.target.closest?.('a,button,summary'));
    const loop = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerover', over);
    ring.current?.classList.add('on');
    dot.current?.classList.add('on');
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerover', over);
    };
  }, []);
  return (
    <>
      <span ref={ring} className="lp-cursor lp-cursor-ring" aria-hidden="true" />
      <span ref={dot} className="lp-cursor lp-cursor-dot" aria-hidden="true" />
    </>
  );
}

// First visit in this tab: a counter to 100, then the curtain lifts.
function Preloader({ onDone }) {
  const { t } = useI18n();
  const [n, setN] = useState(0);
  const [out, setOut] = useState(false);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1100);
      setN(Math.round(100 * (1 - Math.pow(1 - k, 2))));
      if (k < 1) raf = requestAnimationFrame(step);
      else setTimeout(() => setOut(true), 150);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (!out) return undefined;
    const id = setTimeout(onDone, 900);
    return () => clearTimeout(id);
  }, [out, onDone]);
  return (
    <div className={`lp-pre fixed inset-0 z-[60] flex flex-col justify-between bg-navy-950 px-5 py-8 sm:px-10 lg:px-16 ${out ? 'out' : ''}`} aria-hidden="true">
      <Logo className="text-base" />
      <div className="flex items-end justify-between gap-6">
        <p className="text-sm uppercase tracking-[0.25em] text-gray-500">{t('landing.hero_eyebrow')}</p>
        <p className="text-[clamp(5rem,16vw,14rem)] font-black leading-[0.8] tabular-nums text-white">{n}</p>
      </div>
      <span className="absolute bottom-0 left-0 h-1 bg-lime-400" style={{ width: `${n}%` }} />
    </div>
  );
}

// Moving between the landing page and sign-in: a curtain lifts when the page opens, and rises
// from the bottom before leaving (`leave(href)`).
export function useCurtain() {
  const router = useRouter();
  const [c, setC] = useState('cover'); // cover → open; ready → close when leaving
  useEffect(() => {
    if (reducedMotion()) {
      setC('open');
      return undefined;
    }
    const id = setTimeout(() => setC('open'), 80);
    return () => clearTimeout(id);
  }, []);
  const leave = useCallback(
    (href) => {
      if (reducedMotion()) return router.push(href);
      setC('ready');
      requestAnimationFrame(() => requestAnimationFrame(() => setC('close')));
      setTimeout(() => router.push(href), 720);
      return undefined;
    },
    [router],
  );
  const curtain = (
    <div className="lp-curtain bg-navy-950" data-c={c} aria-hidden="true">
      <span className="flex flex-col items-center gap-4">
        <Logo className="text-lg" />
        <span className="lp-curtain-bar h-px w-24 bg-lime-400" />
      </span>
    </div>
  );
  return { curtain, leave };
}

// Plain left clicks on these links play the curtain first.
export function curtainClick(leave, prefixes) {
  return (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return;
    const href = a.getAttribute('href');
    if (!prefixes.some((p) => href === p || href.startsWith(`${p}?`) || href.startsWith(`${p}/`))) return;
    e.preventDefault();
    leave(href);
  };
}

// ---- the page --------------------------------------------------------------------------------

export default function Landing() {
  const deck = useMedia(DECK_MQ);
  const rootRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [sweep, setSweep] = useState(0);
  const [seen, setSeen] = useState(() => new Set());
  const [ready, setReady] = useState(false);
  const [preload, setPreload] = useState(false);
  const [menu, setMenu] = useState(false);
  const idxRef = useRef(0);
  const menuRef = useRef(false);
  const { t } = useI18n();
  const { curtain, leave } = useCurtain();

  // First visit in this tab plays the counter; later visits (and reduced motion) skip it.
  useEffect(() => {
    let shown = false;
    try {
      shown = !!sessionStorage.getItem(PRELOAD_KEY);
      sessionStorage.setItem(PRELOAD_KEY, '1');
    } catch {
      shown = true;
    }
    if (shown || reducedMotion()) setReady(true);
    else setPreload(true);
  }, []);
  const preloadDone = useCallback(() => {
    setPreload(false);
    setReady(true);
  }, []);

  const go = useCallback((to) => {
    const next = Math.max(0, Math.min(SCENES.length - 1, to));
    if (next === idxRef.current) return;
    setDir(next > idxRef.current ? 1 : -1);
    idxRef.current = next;
    setIdx(next);
    setSweep((s) => s + 1);
    setMenu(false);
  }, []);

  // Deck mode: one scene per wheel gesture / swipe / key press; the page itself doesn't scroll.
  useEffect(() => {
    if (!deck) return undefined;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    let lockUntil = 0;
    let lastWheel = 0;
    let gesture = false;
    let acc = 0;
    // A scrollable box (the FAQ) keeps the wheel while it can still scroll that way.
    const keeps = (target, dy) => {
      const box = target?.closest?.('[data-lp-scroll]');
      if (!box) return false;
      return dy > 0 ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : box.scrollTop > 0;
    };
    const onWheel = (e) => {
      if (menuRef.current) return;
      const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (keeps(e.target, dy)) return;
      e.preventDefault();
      const now = Date.now();
      // Trackpads keep sending events after a flick: one gesture moves one scene.
      if (now - lastWheel > 220) {
        gesture = false;
        acc = 0;
      }
      lastWheel = now;
      if (gesture || now < lockUntil) return;
      acc += dy;
      if (Math.abs(acc) > 30) {
        go(idxRef.current + (acc > 0 ? 1 : -1));
        gesture = true;
        lockUntil = now + 900;
        acc = 0;
      }
    };
    let ty = null;
    const onTouchStart = (e) => {
      ty = keeps(e.target, 1) || keeps(e.target, -1) ? null : e.touches[0].clientY;
    };
    const onTouchEnd = (e) => {
      if (ty == null || menuRef.current) return;
      const dy = ty - e.changedTouches[0].clientY;
      if (Math.abs(dy) > 50) go(idxRef.current + (dy > 0 ? 1 : -1));
      ty = null;
    };
    const onKey = (e) => {
      if (menuRef.current || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      const onControl = ['BUTTON', 'A', 'SUMMARY'].includes(tag);
      const map = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 };
      if (e.key in map) {
        e.preventDefault();
        go(idxRef.current + map[e.key]);
      } else if (e.key === ' ' && !onControl) {
        e.preventDefault();
        go(idxRef.current + (e.shiftKey ? -1 : 1));
      } else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(SCENES.length - 1);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKey);
    };
  }, [deck, go]);

  useEffect(() => {
    menuRef.current = menu;
  }, [menu]);

  // Stacked mode (phones): each scene plays its entrance once scrolled to; the court follows
  // the scene in the middle of the screen.
  useEffect(() => {
    if (deck || !ready) return undefined;
    const els = rootRef.current?.querySelectorAll('[data-scene]') || [];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const i = Number(e.target.dataset.scene);
          setSeen((s) => (s.has(i) ? s : new Set(s).add(i)));
          if (e.intersectionRatio > 0.45) {
            idxRef.current = i;
            setIdx(i);
          }
        });
      },
      { threshold: [0.2, 0.45] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [deck, ready]);

  // Pointer position → CSS variables for the gentle parallax/tilt.
  const onMove = (e) => {
    if (reducedMotion() || e.pointerType !== 'mouse') return;
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty('--px', (e.clientX / window.innerWidth - 0.5).toFixed(3));
    el.style.setProperty('--py', (e.clientY / window.innerHeight - 0.5).toFixed(3));
  };

  const stateOf = (i) => {
    if (!ready) return 'future';
    if (!deck) return seen.has(i) ? 'active' : 'future';
    if (i === idx) return 'active';
    return i < idx ? 'past' : 'future';
  };

  return (
    <div ref={rootRef} onPointerMove={onMove} onClickCapture={curtainClick(leave, ['/sign-in'])} className={`lp-root relative bg-navy-950 text-gray-200 ${deck ? 'lp-deck h-[100svh] overflow-hidden' : 'overflow-x-hidden'}`}>
      {preload && <Preloader onDone={preloadDone} />}
      <Stage scene={SCENES[idx]} idx={idx} ghost={pad(idx + 1)} />
      {deck && sweep > 0 && <span key={sweep} className={`lp-sweep ${dir > 0 ? 'down' : 'up'}`} aria-hidden="true" />}
      <Header onMenu={() => setMenu((v) => !v)} menuOpen={menu} />
      <Menu open={menu} idx={idx} onPick={(i) => (deck ? go(i) : (setMenu(false), rootRef.current?.querySelector(`[data-scene="${i}"]`)?.scrollIntoView({ behavior: 'smooth' })))} onClose={() => setMenu(false)} />
      <main className={`z-10 ${deck ? 'absolute inset-0' : 'relative'}`}>
        {SCENES.map((s, i) => {
          const state = stateOf(i);
          return (
            <section
              key={s.key}
              data-scene={i}
              data-state={state}
              className="lp-scene"
              inert={deck && state !== 'active'}
              aria-label={t(`landing.sc_${s.key}`)}
            >
              <ActiveCtx.Provider value={state === 'active'}>
                <SceneBody k={s.key} />
              </ActiveCtx.Provider>
            </section>
          );
        })}
      </main>
      {deck && <DeckControls idx={idx} go={go} />}
      <Cursor />
      {curtain}
    </div>
  );
}
