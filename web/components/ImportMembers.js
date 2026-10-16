'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { downloadMemberTemplate, readMemberFile, IMPORT_MAX } from '@/lib/importMembers';

const key = (v) => String(v || '').trim().toLowerCase();
const same = (a, b) => (a == null || a === '' ? null : typeof a === 'number' || typeof b === 'number' ? Number(a) : String(a)) === (b == null || b === '' ? null : typeof a === 'number' || typeof b === 'number' ? Number(b) : String(b));

// What would change on this member (only the fields the file has).
function changesFor(m, body) {
  const patch = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'member_type' && (v === 'review' || v === 'waiting' || v === m.member_type)) continue; // not moved from here
    if (k === 'joined_on' && String(m.joined_on || '').slice(0, 7) === String(v).slice(0, 7)) continue;
    if (k === 'birth_year' && body.birth_date === null && m.birth_date == null && same(m.birth_year, v)) continue;
    if (k === 'is_active' && (m.is_active !== false) === v) continue;
    if (!same(m[k], v)) patch[k] = v;
  }
  const type = patch.member_type || m.member_type;
  if (type !== 'fixed') delete patch.tier;
  return patch;
}

// A new member: no cleared fields, not "under review".
function forCreate(body) {
  const out = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== null && v !== undefined));
  if (out.member_type === 'review') delete out.member_type;
  if (out.member_type && out.member_type !== 'fixed') delete out.tier;
  if (out.is_active === true) delete out.is_active;
  return out;
}

// "Nhập Excel": the same form as "Xuất Excel" (download, edit, upload again). A row with
// "Mã thành viên" — or the phone / name of someone already in the club — updates that
// member (only what changed); the others are added. Same checks and plan limits as the
// buttons on the page.
export default function ImportMembers({ open, club, members, sport, onClose, onDone }) {
  const { t } = useI18n();
  const [rows, setRows] = useState(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  function close() {
    setRows(null);
    setFileError('');
    setDone(null);
    onClose();
  }

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError('');
    setDone(null);
    try {
      const res = await readMemberFile(file, t, sport);
      if (res.missing) return setFileError(t('imp.noNameCol'));
      if (!res.rows.length) return setFileError(t('imp.noRows'));
      if (res.rows.length > IMPORT_MAX) return setFileError(t('imp.tooMany', { n: IMPORT_MAX }));
      const list = members || [];
      const byId = new Map(list.map((m) => [m.id, m]));
      const byPhone = new Map(list.filter((m) => m.phone).map((m) => [key(m.phone), m]));
      const byName = new Map(list.map((m) => [key(m.full_name), m]));
      const seen = new Set();
      setRows(
        res.rows.map((r) => {
          if (r.error) return r;
          const m = (r.id && byId.get(r.id)) || (r.body.phone && byPhone.get(key(r.body.phone))) || (!r.body.phone && byName.get(key(r.body.full_name))) || null;
          const tag = m ? `m:${m.id}` : r.body.phone ? `p:${r.body.phone}` : `n:${key(r.body.full_name)}`;
          if (seen.has(tag)) return { ...r, skip: true, why: 'imp.st_twice' };
          seen.add(tag);
          if (r.id && !byId.get(r.id) && !m) return { ...r, mode: 'new', create: forCreate(r.body) }; // a row from another club's file: added
          if (!m) return { ...r, mode: 'new', create: forCreate(r.body) };
          const patch = changesFor(m, r.body);
          return Object.keys(patch).length ? { ...r, mode: 'update', member: m, patch } : { ...r, skip: true, why: 'imp.st_same' };
        })
      );
    } catch {
      setFileError(t('imp.badFile'));
    }
  }

  async function run() {
    setBusy(true);
    const out = rows.map((r) => ({ ...r }));
    let added = 0;
    let updated = 0;
    for (const r of out) {
      if (r.error || r.skip) continue;
      try {
        if (r.mode === 'update') {
          await api.patch(`/api/clubs/${club.id}/members/${r.member.id}`, r.patch);
          r.updated = true;
          updated += 1;
        } else {
          await api.post(`/api/clubs/${club.id}/members`, r.create);
          r.added = true;
          added += 1;
        }
      } catch (err) {
        r.failed = err.message;
      }
      setRows([...out]);
    }
    setBusy(false);
    setDone({ added, updated, failed: out.filter((r) => r.failed).length });
    onDone();
  }

  const fieldName = (k) => t({ full_name: 'common.name', member_type: 'xlsx.place', tier: 'members.tier', gender: 'members.gender', birth_date: 'members.birthDate', birth_year: 'members.birthDate', phone: 'common.phone', dupr_level: 'common.level', district: 'memberX.district', play_duration: 'memberX.playDuration', joined_on: 'members.joined', is_active: 'xlsx.active', notes: 'xlsx.notes' }[k] || 'common.name');
  const ready = (rows || []).filter((r) => !r.error && !r.skip).length;
  const count = (mode) => (rows || []).filter((r) => !r.error && !r.skip && r.mode === mode).length;
  const state = (r) =>
    r.added ? ['✓ ' + t('imp.st_added'), 'text-lime-300']
    : r.updated ? ['✓ ' + t('imp.st_updated'), 'text-lime-300']
    : r.failed ? ['✗ ' + r.failed, 'text-red-300']
    : r.error ? ['✗ ' + t(r.error), 'text-red-300']
    : r.skip ? ['↷ ' + t(r.why || 'imp.st_skip'), 'text-gray-400']
    : r.mode === 'update' ? ['✎ ' + t('imp.st_willUpdate', { fields: [...new Set(Object.keys(r.patch).map(fieldName))].join(', ') }), 'text-sky-200']
    : ['＋ ' + t('imp.st_ready'), 'text-gray-200'];

  return (
    <Modal open={open} title={`⬆ ${t('imp.title')}`} onClose={busy ? () => {} : close}>
      <div className="flex flex-col gap-4 text-sm">
        <ol className="list-decimal pl-5 text-gray-300 space-y-1">
          <li>
            {t('imp.step1')}{' '}
            <button type="button" className="text-lime-400 underline" onClick={() => downloadMemberTemplate(t, sport)}>⬇ {t('imp.template')}</button>
          </li>
          <li>{t('imp.step2')}</li>
          <li>{t('imp.step3')}</li>
        </ol>
        <div className="rounded-lg bg-navy-900 p-3 text-xs text-gray-400 space-y-1">
          <p><span className="text-gray-200 font-semibold">{t('common.name')} *</span> — {t('imp.how_full_name')}</p>
          <p><span className="text-gray-200 font-semibold">{t('xlsx.place')}</span> — {t('imp.how_member_type')}</p>
          <p><span className="text-gray-200 font-semibold">{t('members.birthDate')}</span> — {t('imp.how_birth')}</p>
          <p><span className="text-gray-200 font-semibold">{t('common.level')}</span> — {t('imp.how_level', { levels: sport === 'badminton' ? t('imp.levelsB') : '1.00 – 8.00' })}</p>
          <p>{t('imp.guideNote1')}</p>
        </div>

        <label className="btn-secondary text-center cursor-pointer">
          📄 {t('imp.pick')}
          <input type="file" accept=".xlsx" className="sr-only" onChange={pick} disabled={busy} />
        </label>
        {fileError && <p className="text-red-400">{fileError}</p>}

        {rows && (
          <>
            <p className="text-gray-300">{t('imp.summary2', { add: count('new'), upd: count('update'), skip: rows.filter((r) => r.skip).length, err: rows.filter((r) => r.error).length })}</p>
            <div className="table-wrap max-h-72 overflow-y-auto">
              <table className="w-full text-xs grid-table">
                <thead>
                  <tr className="text-gray-300 text-left bg-navy-900">
                    <th>{t('imp.line')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('imp.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const [text, tone] = state(r);
                    return (
                      <tr key={r.line}>
                        <td className="text-gray-400 tabular-nums">{r.line}</td>
                        <td className="text-white">{r.name || '—'}</td>
                        <td className={`${tone} !whitespace-normal`}>{text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {done ? (
              <p className="text-lime-300 font-semibold">{t('imp.done2', { n: done.added, u: done.updated, f: done.failed })}</p>
            ) : (
              <button type="button" className="btn-primary" disabled={busy || !ready} onClick={run}>
                {busy ? t('imp.running') : t('imp.run', { n: ready })}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
