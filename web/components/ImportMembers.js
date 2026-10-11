'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { downloadMemberTemplate, readMemberFile, IMPORT_MAX } from '@/lib/importMembers';

const key = (v) => String(v || '').trim().toLowerCase();

// "Nhập Excel": download the template, pick the filled file, check the rows, then add them
// one by one (the same checks and plan limits as "+ Thêm thành viên").
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
      // Already in the club (same phone, or same name when no phone) -> skipped.
      const phones = new Set((members || []).map((m) => key(m.phone)).filter(Boolean));
      const names = new Set((members || []).map((m) => key(m.full_name)));
      const seen = new Set();
      setRows(
        res.rows.map((r) => {
          if (r.error) return r;
          const id = r.body.phone ? `p:${r.body.phone}` : `n:${key(r.body.full_name)}`;
          const dup = (r.body.phone ? phones.has(key(r.body.phone)) : names.has(key(r.body.full_name))) || seen.has(id);
          seen.add(id);
          return dup ? { ...r, skip: true } : r;
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
    for (const r of out) {
      if (r.error || r.skip) continue;
      try {
        await api.post(`/api/clubs/${club.id}/members`, r.body);
        r.added = true;
        added += 1;
      } catch (err) {
        r.failed = err.message;
      }
      setRows([...out]);
    }
    setBusy(false);
    setDone({ added, failed: out.filter((r) => r.failed).length });
    onDone();
  }

  const ready = (rows || []).filter((r) => !r.error && !r.skip).length;
  const state = (r) =>
    r.added ? ['✓ ' + t('imp.st_added'), 'text-lime-300']
    : r.failed ? ['✗ ' + r.failed, 'text-red-300']
    : r.error ? ['✗ ' + t(r.error), 'text-red-300']
    : r.skip ? ['↷ ' + t('imp.st_skip'), 'text-gray-400']
    : [t('imp.st_ready'), 'text-gray-200'];

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
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={pick} disabled={busy} />
        </label>
        {fileError && <p className="text-red-400">{fileError}</p>}

        {rows && (
          <>
            <p className="text-gray-300">{t('imp.summary', { ok: ready, skip: rows.filter((r) => r.skip).length, err: rows.filter((r) => r.error).length })}</p>
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
              <p className="text-lime-300 font-semibold">{t('imp.done', { n: done.added, f: done.failed })}</p>
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
