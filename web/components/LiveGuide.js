'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import Segmented from '@/components/ui/Segmented';
import { useI18n } from '@/context/I18nContext';

// How to score live: for whoever holds the phone at the court (Host, co-admin, referee).
// Tabs: using the pad, then the rules of the club's sport (the other sport stays one tap away).
const SEEN_KEY = 'pb_live_guide_seen';

const STEPS = {
  start: ['start1', 'start2', 'start3', 'start4'],
  tap: ['tap1', 'tap2', 'tap3', 'tap4', 'tap5'],
  fix: ['fix1', 'fix2', 'fix3'],
  end: ['end1', 'end2', 'end3'],
  sideout: ['pb1', 'pb2', 'pb3', 'pb4', 'pb5', 'pb6', 'pb7'],
  sideout_single: ['ps1', 'ps2', 'ps3', 'ps4'],
  rally: ['pr1', 'pr2', 'pr3', 'pr4', 'pr5'],
  pbFormats: ['pf1', 'pf2', 'pf3'],
  badminton: ['bm1', 'bm2', 'bm3', 'bm4', 'bm5', 'bm6'],
  bmFormats: ['bf1', 'bf2', 'bf3', 'bf4'],
};

function Steps({ title, icon, keys, t }) {
  return (
    <section className="mb-4">
      <h3 className="text-white font-semibold mb-1.5">
        <span aria-hidden="true" className="mr-1.5">{icon}</span>
        {t(`liveGuide.${title}`)}
      </h3>
      <ol className="flex flex-col gap-1.5 text-sm text-gray-300">
        {keys.map((k, i) => (
          <li key={k} className="flex gap-2">
            <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-navy-700 text-lime-300 text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
            <span>{t(`liveGuide.${k}`)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// "4-2-1": what each number of the pickleball call means.
function CallExample({ t, three = true }) {
  const parts = [
    ['4', 'callServing', 'text-lime-300'],
    ['2', 'callReceiving', 'text-sky-300'],
    ...(three ? [['1', 'callServer', 'text-amber-300']] : []),
  ];
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-950 p-3 mb-4">
      <p className="text-gray-400 text-xs mb-2">{t(three ? 'liveGuide.callTitle' : 'liveGuide.callTitle2')}</p>
      <div className="flex items-start justify-center gap-1.5">
        {parts.map(([n, k, tone], i) => (
          <div key={k} className="flex items-start gap-1.5">
            {i > 0 && <span className="text-gray-500 text-3xl font-black leading-none">-</span>}
            <div className="text-center w-20">
              <div className={`text-3xl font-black leading-none ${tone}`}>{n}</div>
              <div className="text-[11px] text-gray-400 mt-1 leading-tight">{t(`liveGuide.${k}`)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Where the server stands: right court on an even score, left on an odd one (badminton,
// and pickleball singles). A tiny court seen from the server's side.
function CourtExample({ t }) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-950 p-3 mb-4">
      <p className="text-gray-400 text-xs mb-2">{t('liveGuide.courtTitle')}</p>
      <div className="grid grid-cols-2 gap-1 max-w-xs mx-auto text-center text-xs">
        <div className="col-span-2 text-gray-500">{t('liveGuide.net')}</div>
        <div className="rounded border border-navy-600 py-3 text-gray-300">
          {t('live.left')}
          <div className="text-amber-300 font-semibold">{t('liveGuide.odd')}</div>
        </div>
        <div className="rounded border border-lime-400/60 bg-lime-400/5 py-3 text-gray-300">
          {t('live.right')}
          <div className="text-lime-300 font-semibold">{t('liveGuide.even')}</div>
        </div>
        <div className="col-span-2 text-gray-500">{t('liveGuide.serverView')}</div>
      </div>
    </div>
  );
}

function Example({ titleKey, textKey, t }) {
  return (
    <div className="rounded-xl border border-sky-400/30 bg-sky-400/5 p-3 text-sm text-sky-100 mb-4">
      <p className="font-semibold mb-1">{t(`liveGuide.${titleKey}`)}</p>
      <p className="text-gray-300">{t(`liveGuide.${textKey}`)}</p>
    </div>
  );
}

const PB_SYSTEMS = ['sideout', 'sideout_single', 'rally'];

function Body({ sport, scoring, t }) {
  const [tab, setTab] = useState('use');
  const [pb, setPb] = useState(PB_SYSTEMS.includes(scoring) ? scoring : 'sideout');
  useEffect(() => {
    if (PB_SYSTEMS.includes(scoring)) setPb(scoring);
  }, [scoring]);
  const other = sport === 'badminton' ? 'pickleball' : 'badminton';
  return (
    <>
      <UnderlineTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'use', label: t('liveGuide.tabUse'), icon: '👆' },
          { key: sport, label: t(`liveGuide.tab_${sport}`), icon: sport === 'badminton' ? '🏸' : '🏓' },
          { key: other, label: t(`liveGuide.tab_${other}`), icon: other === 'badminton' ? '🏸' : '🏓' },
        ]}
      />
      {tab === 'use' && (
        <>
          <Steps title="startTitle" icon="▶" keys={STEPS.start} t={t} />
          <Steps title="tapTitle" icon="👆" keys={STEPS.tap} t={t} />
          <Steps title="fixTitle" icon="↶" keys={STEPS.fix} t={t} />
          <Steps title="endTitle" icon="💾" keys={STEPS.end} t={t} />
        </>
      )}
      {tab === 'pickleball' && (
        <>
          <p className="text-gray-400 text-xs mb-1.5">{t('liveGuide.pickSystem')}</p>
          <Segmented full className="mb-4" items={PB_SYSTEMS} value={pb} onChange={setPb} label={(k) => t(`live.scoring_${k}`)} />
          <CallExample t={t} three={pb === 'sideout'} />
          {pb === 'sideout' && (
            <>
              <Steps title="pbTitle" icon="🏓" keys={STEPS.sideout} t={t} />
              <Example titleKey="pbExampleTitle" textKey="pbExample" t={t} />
            </>
          )}
          {pb === 'sideout_single' && (
            <>
              <Steps title="psTitle" icon="🏓" keys={STEPS.sideout_single} t={t} />
              <Example titleKey="pbExampleTitle" textKey="psExample" t={t} />
            </>
          )}
          {pb === 'rally' && (
            <>
              <Steps title="prTitle" icon="🏓" keys={STEPS.rally} t={t} />
              <Example titleKey="pbExampleTitle" textKey="prExample" t={t} />
            </>
          )}
          <Steps title="pfTitle" icon="⚙️" keys={STEPS.pbFormats} t={t} />
        </>
      )}
      {tab === 'badminton' && (
        <>
          <CourtExample t={t} />
          <Steps title="bmTitle" icon="🏸" keys={STEPS.badminton} t={t} />
          <Example titleKey="bmExampleTitle" textKey="bmExample" t={t} />
          <Steps title="bfTitle" icon="⚙️" keys={STEPS.bmFormats} t={t} />
        </>
      )}
    </>
  );
}

// variant 'button': a "? Guide" button opening the guide (opens by itself the first time
// on this device when `autoOpen`). variant 'card': a collapsible card for the match list.
export default function LiveGuide({ sport = 'pickleball', scoring = null, variant = 'button', autoOpen = false }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!autoOpen) return;
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      /* private mode: just don't auto-open */
    }
  }, [autoOpen]);

  function close() {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  if (variant === 'card') {
    return (
      <section className="card !p-0 mb-4 overflow-hidden">
        <button type="button" className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>
            <span className="text-white font-semibold">📖 {t('liveGuide.title')}</span>
            <span className="block text-gray-400 text-xs">{t('liveGuide.cardHint')}</span>
          </span>
          <span className="text-lime-300 text-sm shrink-0">{open ? t('liveGuide.hide') : t('liveGuide.show')}</span>
        </button>
        {open && (
          <div className="px-4 pb-4 border-t border-navy-700 pt-3">
            <Body sport={sport} scoring={scoring} t={t} />
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <button type="button" className="rounded-full border border-navy-600 px-3 py-1 text-sm text-gray-200 hover:border-lime-400 hover:text-white" onClick={() => setOpen(true)}>
        ❓ {t('liveGuide.button')}
      </button>
      <Modal open={open} title={`📖 ${t('liveGuide.title')}`} onClose={close}>
        <Body sport={sport} scoring={scoring} t={t} />
        <button type="button" className="btn-primary w-full mt-2" onClick={close}>{t('liveGuide.gotIt')}</button>
      </Modal>
    </>
  );
}
