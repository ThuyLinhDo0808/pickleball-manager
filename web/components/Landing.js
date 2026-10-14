'use client';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';

// The public landing page ("/") for visitors who are not signed in: what the product does,
// for whom, how to start — then on to sign up / sign in. Every picture here is drawn with
// plain markup (no external images or fonts: the site's CSP allows only its own).

const SIGN_UP = '/sign-in?mode=signUp';
const SIGN_IN = '/sign-in';

function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-black tracking-tight ${className}`}>
      <span className="relative h-8 w-8 rounded-xl bg-lime-400 text-navy-950 grid place-items-center text-sm shadow-[0_0_24px_rgba(182,240,59,0.35)]" aria-hidden="true">
        PM
      </span>
      <span className="text-white whitespace-nowrap">Pickleball<span className="text-lime-400 hidden min-[420px]:inline"> Manager</span></span>
    </span>
  );
}

// Court lines behind the hero: a pickleball court seen from above, very faint.
function CourtLines() {
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

function Header() {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-navy-950/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3 sm:gap-6">
        <Link href="/" aria-label="Pickleball Manager"><Logo className="text-base" /></Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-gray-300" aria-label={t('landing.navLabel')}>
          <a href="#who" className="hover:text-white">{t('landing.nav_who')}</a>
          <a href="#features" className="hover:text-white">{t('landing.nav_features')}</a>
          <a href="#how" className="hover:text-white">{t('landing.nav_how')}</a>
          <a href="#faq" className="hover:text-white">{t('landing.nav_faq')}</a>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
          <button
            type="button"
            onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
            className="hidden sm:inline-flex h-9 items-center rounded-full border border-white/10 px-3 text-xs font-semibold text-gray-300 hover:text-white"
            aria-label={t('landing.switchLang')}
          >
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
          <Link href={SIGN_IN} className="h-9 inline-flex items-center rounded-full px-3 sm:px-4 text-sm font-semibold text-white hover:bg-white/5">{t('landing.signIn')}</Link>
          <Link href={SIGN_UP} className="h-9 inline-flex items-center rounded-full bg-lime-400 px-3 sm:px-4 text-sm font-bold text-navy-950 hover:bg-lime-500">{t('landing.start')}</Link>
        </div>
      </div>
    </header>
  );
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
          [t('landing.mock_members'), '128', 'text-white'],
          [t('landing.mock_income'), '18,4tr', 'text-lime-300'],
          [t('landing.mock_checkin'), '92%', 'text-sky-300'],
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

function LiveScoreMock({ className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`rounded-2xl border border-white/10 bg-navy-950/95 p-3.5 shadow-2xl shadow-black/60 ${className}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" aria-hidden="true" /> {t('landing.mock_live')}
      </p>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <span className="text-white font-semibold">Minh / Lan</span>
        <span className="text-lime-300 font-black tabular-nums text-lg leading-none">11</span>
        <span className="text-gray-400">Huy / Thảo</span>
        <span className="text-gray-300 font-black tabular-nums text-lg leading-none">9</span>
      </div>
      <p className="mt-1.5 text-[10px] text-gray-500">{t('landing.mock_game')}</p>
    </div>
  );
}

function DuprMock({ className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`rounded-2xl border border-white/10 bg-navy-900/95 p-3.5 shadow-2xl shadow-black/60 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('landing.mock_dupr')}</p>
      <p className="mt-0.5 text-2xl font-black tabular-nums text-white">3.412 <span className="text-xs font-semibold text-lime-300">▲ 0.125</span></p>
      <svg viewBox="0 0 120 32" className="mt-1 h-8 w-32" aria-hidden="true">
        <polyline points="2,26 22,24 42,25 62,18 82,15 102,9 118,6" fill="none" stroke="#B6F03B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="118" cy="6" r="3" fill="#B6F03B" />
      </svg>
    </div>
  );
}

function TicketMock({ className = '' }) {
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

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
      <div className="absolute -inset-10 rounded-full bg-lime-400/10 blur-3xl" />
      <div className="relative lg:pl-4 sm:pt-10 sm:pb-24">
        <DashboardMock />
        <LiveScoreMock className="absolute -left-6 -bottom-24 w-48 lp-float hidden sm:block" />
        <DuprMock className="absolute -right-3 -top-16 w-44 lp-float-slow hidden sm:block" />
        <TicketMock className="absolute -right-4 -bottom-28 w-28 lp-float hidden md:block" />
      </div>
    </div>
  );
}

// ---- sections ------------------------------------------------------------------------------
function Hero() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden">
      <CourtLines />
      <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_70%_20%,rgba(182,240,59,0.16),transparent_70%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-32 sm:pt-24 lg:pt-28 grid gap-16 lg:grid-cols-[1.2fr_1fr] items-center">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-lime-300">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-400" aria-hidden="true" /> {t('landing.hero_eyebrow')}
          </p>
          <h1 className="mt-5 text-[2.5rem] leading-[1.05] sm:text-6xl lg:text-[3.4rem] xl:text-[3.6rem] font-black tracking-tight text-white">
            {t('landing.hero_title_1')}
            <br />
            <span className="bg-gradient-to-r from-lime-300 via-lime-400 to-emerald-300 bg-clip-text text-transparent">{t('landing.hero_title_2')}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-300">{t('landing.hero_sub')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={SIGN_UP} className="inline-flex h-12 items-center rounded-full bg-lime-400 px-7 text-base font-bold text-navy-950 shadow-[0_8px_30px_rgba(182,240,59,0.35)] hover:bg-lime-500 transition">
              {t('landing.hero_cta')} →
            </Link>
            <Link href="/discover" className="inline-flex h-12 items-center rounded-full border border-white/15 px-7 text-base font-semibold text-white hover:bg-white/5 transition">
              {t('landing.hero_cta2')}
            </Link>
          </div>
          <p className="mt-6 text-sm text-gray-400">✓ {t('landing.hero_note')}</p>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

function Strip() {
  const { t } = useI18n();
  const items = [1, 2, 3, 4, 5, 6].map((n) => t(`landing.strip${n}`));
  return (
    <div className="border-y border-white/5 bg-navy-900/60">
      <ul className="mx-auto max-w-6xl px-4 py-5 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm font-semibold text-gray-300">
        {items.map((x) => (
          <li key={x} className="flex items-center gap-2"><span className="text-lime-400" aria-hidden="true">◆</span>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function SectionHead({ eyebrow, title, sub, center = true }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-xl'}>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-400">{eyebrow}</p>
      <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-[1.08]">{title}</h2>
      {sub && <p className="mt-4 text-gray-400 text-lg leading-relaxed">{sub}</p>}
    </div>
  );
}

function Who() {
  const { t } = useI18n();
  const cards = [
    { k: 'p', icon: '🏓', href: SIGN_UP, accent: 'from-sky-400/20', n: 4 },
    { k: 'c', icon: '🏟', href: SIGN_UP, accent: 'from-lime-400/25', n: 5, featured: true },
    { k: 's', icon: '🎟', href: SIGN_UP, accent: 'from-amber-300/20', n: 5 },
  ];
  return (
    <section id="who" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-24">
      <SectionHead eyebrow={t('landing.who_eyebrow')} title={t('landing.who_title')} sub={t('landing.who_sub')} />
      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {cards.map((c) => (
          <article
            key={c.k}
            className={`relative flex flex-col rounded-3xl border p-7 bg-gradient-to-b ${c.accent} to-transparent ${c.featured ? 'border-lime-400/40 lg:-translate-y-3 shadow-[0_20px_60px_-20px_rgba(182,240,59,0.35)]' : 'border-white/10'}`}
          >
            <span className="text-3xl" aria-hidden="true">{c.icon}</span>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-gray-400">{t(`landing.${c.k}_tag`)}</p>
            <h3 className="mt-1 text-2xl font-black text-white">{t(`landing.${c.k}_title`)}</h3>
            <p className="mt-3 text-gray-300 leading-relaxed">{t(`landing.${c.k}_desc`)}</p>
            <ul className="mt-5 flex flex-col gap-2.5 text-sm text-gray-200">
              {Array.from({ length: c.n }, (_, i) => (
                <li key={i} className="flex gap-2.5"><span className="mt-0.5 text-lime-400" aria-hidden="true">✓</span>{t(`landing.${c.k}${i + 1}`)}</li>
              ))}
            </ul>
            <Link href={c.href} className={`mt-7 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-bold transition ${c.featured ? 'bg-lime-400 text-navy-950 hover:bg-lime-500' : 'border border-white/15 text-white hover:bg-white/5'}`}>
              {t(`landing.${c.k}_cta`)} →
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

// One feature, text on one side and a picture on the other (sides alternate).
function Feature({ n, visual, flip }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-12 lg:grid-cols-2 items-center">
      <div className={flip ? 'lg:order-2' : ''}>
        <SectionHead center={false} eyebrow={t(`landing.f${n}_eyebrow`)} title={t(`landing.f${n}_title`)} sub={t(`landing.f${n}_desc`)} />
        <ul className="mt-6 flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <li key={i} className="flex gap-3 text-gray-200">
              <span className="mt-1 h-5 w-5 shrink-0 rounded-full bg-lime-400/15 text-lime-300 grid place-items-center text-xs" aria-hidden="true">✓</span>
              {t(`landing.f${n}_b${i}`)}
            </li>
          ))}
        </ul>
      </div>
      <div className={`relative ${flip ? 'lg:order-1' : ''}`} aria-hidden="true">
        <div className="absolute -inset-6 rounded-[2rem] bg-lime-400/5 blur-2xl" />
        <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-navy-800 to-navy-900 p-6 sm:p-8 min-h-[280px] flex items-center justify-center">{visual}</div>
      </div>
    </div>
  );
}

function SignupVisual() {
  const { t } = useI18n();
  return (
    <div className="w-full max-w-sm flex flex-col gap-3">
      <div className="rounded-2xl bg-navy-950/80 border border-white/10 p-4">
        <p className="text-xs text-gray-400">pickleball-manager.vn/e/7k2q</p>
        <p className="mt-1 font-bold text-white">{t('landing.mock_ev2')}</p>
        <div className="mt-3 h-2 rounded-full bg-navy-700 overflow-hidden"><div className="h-full w-[87%] bg-lime-400" /></div>
        <p className="mt-1.5 text-xs text-gray-400">{t('landing.mock_slots')}</p>
        <div className="mt-3 flex gap-2">
          <span className="flex-1 rounded-lg bg-lime-400 py-2 text-center text-xs font-bold text-navy-950">{t('landing.mock_join')}</span>
          <span className="rounded-lg border border-white/15 px-3 py-2 text-xs text-gray-300">VietQR</span>
        </div>
      </div>
      <div className="flex justify-end"><TicketMock className="w-28 rotate-3" /></div>
    </div>
  );
}

function TournamentVisual() {
  const rounds = [
    ['Minh / Lan', 'Huy / Thảo', 'Tùng / Vy', 'An / Bình'],
    ['Minh / Lan', 'Tùng / Vy'],
    ['Minh / Lan'],
  ];
  return (
    <div className="w-full flex items-center gap-3 sm:gap-5">
      {rounds.map((r, ri) => (
        <div key={ri} className="flex-1 flex flex-col justify-around gap-3" style={{ minHeight: 220 }}>
          {r.map((p, i) => (
            <div key={i} className={`rounded-lg border px-2.5 py-2 text-xs truncate ${ri === 2 ? 'border-lime-400/60 bg-lime-400/10 text-lime-200 font-bold' : 'border-white/10 bg-navy-950/70 text-gray-200'}`}>
              {ri === 2 && '🏆 '}{p}
            </div>
          ))}
        </div>
      ))}
      <LiveScoreMock className="hidden sm:block w-40 self-start" />
    </div>
  );
}

function FinanceVisual() {
  const { t } = useI18n();
  const bars = [42, 58, 51, 73, 66, 88];
  return (
    <div className="w-full max-w-sm">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-400">{t('landing.mock_income')}</p>
          <p className="text-3xl font-black text-white tabular-nums">18.400.000đ</p>
        </div>
        <span className="text-xs font-semibold text-lime-300">▲ 12%</span>
      </div>
      <div className="mt-5 flex items-end gap-2 h-32">
        {bars.map((h, i) => <span key={i} className={`flex-1 rounded-t-md ${i === bars.length - 1 ? 'bg-lime-400' : 'bg-navy-600'}`} style={{ height: `${h}%` }} />)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <span className="rounded-lg bg-navy-950/70 px-3 py-2 text-gray-300">{t('landing.mock_fund')} <b className="text-white">6,2tr</b></span>
        <span className="rounded-lg bg-navy-950/70 px-3 py-2 text-gray-300">{t('landing.mock_debt')} <b className="text-amber-300">3</b></span>
      </div>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-white/5 bg-[linear-gradient(180deg,rgba(16,26,46,0.6),transparent)]">
      <div className="mx-auto max-w-6xl px-4 py-24 flex flex-col gap-28">
        <Feature n={1} visual={<SignupVisual />} />
        <Feature n={2} visual={<TournamentVisual />} flip />
        <Feature n={3} visual={<div className="flex flex-wrap items-center justify-center gap-4"><DuprMock className="w-48" /><div className="rounded-2xl border border-white/10 bg-navy-950/80 p-4 text-xs text-gray-300 w-48"><p className="font-bold text-white">DUPR ID</p><p className="mt-1 font-mono text-lime-300 text-base">YN9N0G</p><p className="mt-2 text-gray-400">✓ Import Matches via CSV</p></div></div>} />
        <Feature n={4} visual={<FinanceVisual />} flip />
      </div>
    </section>
  );
}

function How() {
  const { t } = useI18n();
  return (
    <section id="how" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-24">
      <SectionHead eyebrow={t('landing.how_eyebrow')} title={t('landing.how_title')} />
      <ol className="mt-14 grid gap-5 md:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <li key={n} className="relative rounded-3xl border border-white/10 bg-navy-900/60 p-7">
            <span className="text-6xl font-black text-lime-400/20 leading-none" aria-hidden="true">0{n}</span>
            <h3 className="mt-3 text-xl font-bold text-white">{t(`landing.step${n}_t`)}</h3>
            <p className="mt-2 text-gray-400 leading-relaxed">{t(`landing.step${n}_d`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Grid() {
  const { t } = useI18n();
  const icons = ['🔁', '🛡', '📜', '⭐', '🏆', '↩️', '🔎', '📊'];
  return (
    <section className="border-y border-white/5 bg-navy-900/40">
      <div className="mx-auto max-w-6xl px-4 py-24">
        <SectionHead eyebrow={t('landing.grid_eyebrow')} title={t('landing.grid_title')} />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {icons.map((ic, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-navy-950/50 p-5 hover:border-lime-400/40 transition">
              <span className="text-2xl" aria-hidden="true">{ic}</span>
              <h3 className="mt-3 font-bold text-white">{t(`landing.g${i + 1}_t`)}</h3>
              <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">{t(`landing.g${i + 1}_d`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const { t } = useI18n();
  return (
    <section id="faq" className="scroll-mt-20 mx-auto max-w-3xl px-4 py-24">
      <SectionHead eyebrow={t('landing.faq_eyebrow')} title={t('landing.faq_title')} />
      <div className="mt-12 flex flex-col gap-3">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <details key={n} className="group rounded-2xl border border-white/10 bg-navy-900/60 px-5 py-4 open:border-lime-400/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-white">
              {t(`landing.q${n}`)}
              <span className="text-lime-400 text-xl transition group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <p className="mt-3 text-gray-400 leading-relaxed">{t(`landing.a${n}`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  const { t } = useI18n();
  return (
    <section className="px-4 pb-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-lime-400/30 bg-gradient-to-br from-lime-400/20 via-navy-900 to-navy-900 px-6 py-16 sm:px-14 text-center">
        <CourtLines />
        <h2 className="relative text-3xl sm:text-5xl font-black tracking-tight text-white">{t('landing.cta_title')}</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-gray-300">{t('landing.cta_sub')}</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link href={SIGN_UP} className="inline-flex h-12 items-center rounded-full bg-lime-400 px-7 font-bold text-navy-950 hover:bg-lime-500">{t('landing.cta_btn')} →</Link>
          <Link href={SIGN_IN} className="inline-flex h-12 items-center rounded-full border border-white/20 px-7 font-semibold text-white hover:bg-white/5">{t('landing.cta_btn2')}</Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto max-w-6xl px-4 py-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo className="text-sm" />
          <p className="mt-2 text-sm text-gray-500">{t('landing.footer_tag')}</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400" aria-label={t('landing.footerNav')}>
          <Link href="/discover" className="hover:text-white">{t('landing.footer_discover')}</Link>
          <Link href="/terms" className="hover:text-white">{t('landing.footer_terms')}</Link>
          <Link href="/privacy" className="hover:text-white">{t('landing.footer_privacy')}</Link>
          <Link href={SIGN_IN} className="hover:text-white">{t('landing.signIn')}</Link>
        </nav>
      </div>
      <p className="pb-8 text-center text-xs text-gray-600">© {new Date().getFullYear()} Pickleball Manager</p>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-navy-950 text-gray-200 overflow-x-hidden">
      <Header />
      <main>
        <Hero />
        <Strip />
        <Who />
        <Features />
        <How />
        <Grid />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
