'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

function fmtDate(ts, lang) {
  return new Date(ts).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// SCD Type 2 timeline for one member: each value with its from → to range.
export default function MemberHistory({ club, member }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);

  async function toggle() {
    if (!open && !rows) {
      try {
        setRows(await api.get(`/api/clubs/${club.id}/members/${member.id}/history`));
      } catch {
        setRows([]);
      }
    }
    setOpen((o) => !o);
  }

  function valueLabel(h) {
    const v = h.value;
    if (v == null) return '—';
    if (h.attribute === 'member_type') return v === 'fixed' ? t('members.fixed') : t('members.guest');
    if (h.attribute === 'tier') return t(`members.${v}`);
    if (h.attribute === 'is_active') return v === 'true' ? t('history.yes') : t('history.no');
    if (h.attribute === 'status') return t(`membership.${v}`);
    if (h.attribute === 'amount') return formatVnd(v);
    if (h.attribute === 'dupr_level') return Number(v).toFixed(2);
    return v;
  }

  return (
    <section>
      <button type="button" className="text-gray-300 text-sm underline" onClick={toggle}>
        {open ? t('history.hide') : t('history.show')}
      </button>
      {open && (
        <div className="mt-2">
          <p className="text-gray-500 text-xs mb-2">{t('history.note')}</p>
          {rows === null && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
          {rows?.length === 0 && <p className="text-gray-400 text-sm">{t('history.empty')}</p>}
          <ol className="flex flex-col gap-1">
            {(rows || []).map((h, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-sm bg-navy-900 rounded-lg px-3 py-2">
                <span className="min-w-0">
                  <span className="text-gray-400">{t(`history.attr_${h.attribute}`)}</span>
                  {h.entity !== 'club_member' && (
                    <span className="text-gray-500 text-xs">
                      {' '}({h.entity === 'player' ? t('history.entity_player') : t('history.entity_membership', { period: h.period_label || '?' })})
                    </span>
                  )}
                  <span className={`block font-semibold ${h.valid_to ? 'text-gray-300' : 'text-lime-400'}`}>{valueLabel(h)}</span>
                </span>
                <span className="text-gray-500 text-xs shrink-0 text-right tabular-nums">
                  {fmtDate(h.valid_from, lang)}
                  <br />→ {h.valid_to ? fmtDate(h.valid_to, lang) : t('history.now')}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
