'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import EmptyState from '@/components/ui/EmptyState';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import UiIcon from '@/components/ui/UiIcon';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const dash = <span className="text-gray-500">—</span>;
const dmy = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : null);

// Sinh nhật tháng này (Xem tất cả): everyone born in a month — type (thường xuyên / vãng
// lai or cố định / giao lưu), level, sessions played, last visit, phone — and Tặng quà:
// a free session, a discount or a gift at the court, with a message and an expiry.
export default function BirthdaysPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const nowMonth = new Date().getMonth() + 1;
  const [month, setMonth] = useState(nowMonth);
  const { data, error, loading, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/birthdays/month?month=${month}`) : Promise.resolve(null)), [club?.id, month]);
  const [picked, setPicked] = useState({});
  const [gift, setGift] = useState(null); // form
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState('');
  const rows = data?.members || [];
  const canGive = rows.filter((m) => !m.gift);
  const chosen = canGive.filter((m) => picked[m.id]);
  const isCommunity = (club?.kind || 'club') === 'community';
  const typeOf = (m) => (m.member_type === 'fixed' ? t(isCommunity ? 'bdays.regular' : 'bdays.fixed') : t(isCommunity ? 'bdays.dropin' : 'bdays.guest'));
  const giftText = (g) => (g.kind === 'free_session' ? t('bdays.g_free') : g.kind === 'percent' ? t('bdays.g_percentN', { n: g.percent }) : g.item);
  const allOn = canGive.length > 0 && chosen.length === canGive.length;

  function openGift() {
    setMsg('');
    setGift({ kind: 'free_session', percent: 50, item: '', message: t('bdays.defaultMsg', { club: club?.name || '' }), expires_on: data?.default_expiry || '' });
  }
  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await api.post(`/api/clubs/${club.id}/gifts`, { member_ids: chosen.map((m) => m.id), ...gift, percent: Number(gift.percent) });
      setGift(null);
      setPicked({});
      setDone(t('bdays.sent', { n: r.given }) + (r.skipped ? ` ${t('bdays.skipped', { n: r.skipped })}` : ''));
      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function act(fn) {
    setBusy(true);
    try {
      await fn();
      reload();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  const GiftCell = ({ m }) =>
    m.gift ? (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={`rounded-full px-2 py-0.5 ${m.gift.used_at ? 'bg-navy-700 text-gray-300' : 'bg-lime-400/15 text-lime-300'}`}>{m.gift.used_at ? t('bdays.used') : t('bdays.given')} · {giftText(m.gift)}</span>
        <button type="button" disabled={busy} className="underline text-gray-300 hover:text-white min-h-[44px] sm:min-h-0" onClick={() => act(() => api.patch(`/api/clubs/${club.id}/gifts/${m.gift.id}`, { used: !m.gift.used_at }))}>{m.gift.used_at ? t('bdays.unuse') : t('bdays.markUsed')}</button>
        {!m.gift.used_at && <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 min-h-[44px] sm:min-h-0" onClick={() => window.confirm(t('bdays.cancelAsk', { name: m.full_name })) && act(() => api.del(`/api/clubs/${club.id}/gifts/${m.gift.id}`))}>{t('bdays.cancelGift')}</button>}
      </span>
    ) : (
      <span className="text-gray-500 text-xs">{t('bdays.noGift')}</span>
    );

  return (
    <AppShell>
      <PageHeader
        icon="gift"
        title={t('bdays.title')}
        subtitle={club?.name}
        hint={<Hint inline text={t('bdays.hint')} />}
        actions={<button type="button" className="btn-primary" disabled={!chosen.length || !data?.gifts_ready} onClick={openGift}><UiIcon name="gift" className="w-4 h-4 inline -mt-0.5 mr-1" />{t('bdays.giveN', { n: chosen.length })}</button>}
      />
      <div className="card !p-2 mb-3 flex items-center justify-between gap-2">
        <button type="button" className="w-11 h-11 rounded-lg hover:bg-navy-800 text-gray-200" aria-label={t('bdays.prev')} onClick={() => setMonth((m) => (m === 1 ? 12 : m - 1))}>‹</button>
        <span className="text-white font-semibold">{t('bdays.month', { m: month })}{month === nowMonth ? ` · ${t('bdays.thisMonth')}` : ''}</span>
        <button type="button" className="w-11 h-11 rounded-lg hover:bg-navy-800 text-gray-200" aria-label={t('bdays.next')} onClick={() => setMonth((m) => (m === 12 ? 1 : m + 1))}>›</button>
      </div>
      {done && <p className="card mb-3 border-lime-400/50 text-lime-300 text-sm" role="status">{done}</p>}
      {data && !data.gifts_ready && <p className="card mb-3 text-amber-200 text-sm">{t('bdays.needMigration')}</p>}
      {loading && !data && <LoadingBlock rows={4} className="card" />}
      {error && <ErrorBlock message={error.message} onRetry={reload} />}
      {data && !rows.length && <EmptyState title={t('bdays.empty')}>{t('bdays.emptyHint')}</EmptyState>}
      {rows.length > 0 && (
        <section className="card !p-0 overflow-hidden">
          <div className="hidden lg:grid grid-cols-[2.75rem_minmax(0,2fr)_6rem_3rem_4.5rem_minmax(0,1.2fr)_4rem_5rem_6rem_7rem_minmax(0,2.4fr)] gap-2 px-3 py-2 text-xs text-gray-400 border-b border-navy-700 items-center">
            <label className="flex items-center justify-center min-h-[44px]"><input type="checkbox" className="w-5 h-5" aria-label={t('bdays.all')} checked={allOn} onChange={() => setPicked(allOn ? {} : Object.fromEntries(canGive.map((m) => [m.id, true])))} /></label>
            <span>{t('bdays.colName')}</span>
            <span>{t('bdays.colBirth')}</span>
            <span className="text-right">{t('bdays.colAge')}</span>
            <span>{t('bdays.colGender')}</span>
            <span>{t('bdays.colType')}</span>
            <span className="text-right">{t('bdays.colLevel')}</span>
            <span className="text-right">{t('bdays.colSessions')}</span>
            <span className="text-right">{t('bdays.colLast')}</span>
            <span>{t('bdays.colPhone')}</span>
            <span>{t('bdays.colGift')}</span>
          </div>
          <label className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-navy-700 text-sm text-gray-300 min-h-[44px]">
            <input type="checkbox" className="w-5 h-5" checked={allOn} onChange={() => setPicked(allOn ? {} : Object.fromEntries(canGive.map((m) => [m.id, true])))} /> {t('bdays.all')}
          </label>
          {rows.map((m) => (
            <div key={m.id} className={`grid grid-cols-[2.75rem_minmax(0,1fr)] lg:grid-cols-[2.75rem_minmax(0,2fr)_6rem_3rem_4.5rem_minmax(0,1.2fr)_4rem_5rem_6rem_7rem_minmax(0,2.4fr)] gap-x-2 gap-y-0.5 px-3 py-2 border-b border-navy-700 last:border-b-0 text-sm items-center ${m.is_today ? 'bg-lime-400/5' : ''}`}>
              <label className="flex items-center justify-center min-h-[44px] row-span-3 lg:row-span-1">
                <input type="checkbox" className="w-5 h-5" disabled={!!m.gift} aria-label={m.full_name} checked={!!picked[m.id]} onChange={() => setPicked({ ...picked, [m.id]: !picked[m.id] })} />
              </label>
              <span className="min-w-0 text-white break-words">
                {m.full_name}
                {m.is_today && <span className="ml-1.5 text-[11px] rounded-full bg-lime-400/20 text-lime-300 px-1.5 py-0.5">{t('bdays.today')}</span>}
                <span className="lg:hidden block text-gray-400 text-xs tabular-nums">{[dmy(m.birth_date), t('bdays.ageN', { n: m.age }), m.gender ? t(`bdays.g_${m.gender}`) : null, typeOf(m)].filter(Boolean).join(' · ')}</span>
                <span className="lg:hidden block text-gray-400 text-xs tabular-nums">{[m.level != null ? `${t('bdays.colLevel')} ${m.level.toFixed(2)}` : null, t('bdays.sessionsN', { n: m.sessions }), m.last_played ? t('bdays.lastOn', { d: dmy(m.last_played) }) : null, m.phone].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="hidden lg:block tabular-nums text-gray-200">{dmy(m.birth_date)}</span>
              <span className="hidden lg:block tabular-nums text-right text-gray-200">{m.age}</span>
              <span className="hidden lg:block text-gray-200">{m.gender ? t(`bdays.g_${m.gender}`) : dash}</span>
              <span className="hidden lg:block text-gray-200 break-words">{typeOf(m)}</span>
              <span className="hidden lg:block tabular-nums text-right text-gray-200">{m.level != null ? m.level.toFixed(2) : dash}</span>
              <span className="hidden lg:block tabular-nums text-right text-gray-200">{m.sessions || dash}</span>
              <span className="hidden lg:block tabular-nums text-right text-gray-300 text-xs">{m.last_played ? dmy(m.last_played) : dash}</span>
              <span className="hidden lg:block tabular-nums text-gray-300 text-xs break-all">{m.phone || dash}</span>
              <span className="col-start-2 lg:col-start-auto"><GiftCell m={m} /></span>
            </div>
          ))}
        </section>
      )}

      <Modal open={!!gift} title={t('bdays.giveTitle', { n: chosen.length })} onClose={() => setGift(null)}>
        {gift && (
          <form onSubmit={send} className="grid gap-3">
            <p className="text-gray-400 text-sm break-words">{chosen.map((m) => m.full_name).join(', ')}</p>
            <div role="radiogroup" aria-label={t('bdays.kind')} className="grid gap-2">
              {['free_session', 'percent', 'item'].map((k) => (
                <label key={k} className={`flex items-center gap-3 rounded-xl border px-3 min-h-[48px] cursor-pointer ${gift.kind === k ? 'border-lime-400 bg-lime-400/10' : 'border-navy-700'}`}>
                  <input type="radio" name="gift-kind" checked={gift.kind === k} onChange={() => setGift({ ...gift, kind: k })} />
                  <span className="text-sm text-white">{t(`bdays.k_${k}`)}</span>
                </label>
              ))}
            </div>
            {gift.kind === 'percent' && (
              <label className="text-xs text-gray-400">{t('bdays.percent')}<input className="input mt-0.5 text-right tabular-nums" type="number" min="1" max="100" required value={gift.percent} onChange={(e) => setGift({ ...gift, percent: e.target.value })} /></label>
            )}
            {gift.kind === 'item' && (
              <label className="text-xs text-gray-400">{t('bdays.item')}<input className="input mt-0.5" required maxLength={120} placeholder={t('bdays.itemPh')} value={gift.item} onChange={(e) => setGift({ ...gift, item: e.target.value })} /></label>
            )}
            <label className="text-xs text-gray-400">{t('bdays.message')}<textarea className="input mt-0.5 min-h-[4.5rem]" maxLength={500} value={gift.message} onChange={(e) => setGift({ ...gift, message: e.target.value })} /></label>
            <p className="text-gray-500 text-xs -mt-2">{t('bdays.nameTip')}</p>
            <label className="text-xs text-gray-400">{t('bdays.expires')}<input className="input mt-0.5" type="date" required value={gift.expires_on} onChange={(e) => setGift({ ...gift, expires_on: e.target.value })} /></label>
            <p className="text-gray-500 text-xs">{t('bdays.howUsed')}</p>
            {msg && <p className="text-red-300 text-sm">{msg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setGift(null)}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={busy}>{t('bdays.send')}</button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}
