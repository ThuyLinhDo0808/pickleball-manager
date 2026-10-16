// The ONE Excel form for members: "Xuất Excel" writes it, the import template is the same
// form with an example row, and "Nhập Excel" reads it back — so a downloaded file can be
// kept offline, edited and uploaded again as it is. Columns with fixed values get a
// drop-down (Excel refuses anything else), the level a number check, the phone stays text.
import { BADMINTON_LEVELS } from '@/lib/levels';

export const DURATIONS = ['lt6', '6_12', '12_18', 'gt18'];

// [field, header i18n key, required]; 'stt', 'account' and 'id' are written, not read
// (except 'id', which tells the import which member a row is).
export const MEMBER_FIELDS = [
  ['stt', null],
  ['full_name', 'common.name', true],
  ['member_type', 'xlsx.place'],
  ['tier', 'members.tier'],
  ['gender', 'members.gender'],
  ['birth', 'members.birthDate'],
  ['phone', 'common.phone'],
  ['level', 'common.level'],
  ['district', 'memberX.district'],
  ['play_duration', 'memberX.playDuration'],
  ['joined', 'members.joined'],
  ['active', 'xlsx.active'],
  ['notes', 'xlsx.notes'],
  ['account', 'xlsx.account'],
  ['id', 'xlsx.memberId'],
];
export const headerOf = (t, [f, key, req]) => (f === 'stt' ? 'STT' : `${t(key)}${req ? ' *' : ''}`);

export const levelOptions = (t, sport) => (sport === 'badminton' ? BADMINTON_LEVELS.map((n) => t(`level.b${n}`)) : null);

// Column specs for lib/xlsxBook (same for export and template).
export function memberColumns(t, sport) {
  const list = {
    member_type: [t('xlsx.place_fixed'), t('xlsx.place_guest'), t('xlsx.place_waiting')],
    tier: [t('members.vip'), t('members.standard')],
    gender: [t('members.male'), t('members.female')],
    play_duration: DURATIONS.map((d) => t(`memberX.dur_${d}`)),
    active: [t('xlsx.yes'), t('xlsx.no')],
  };
  const lv = levelOptions(t, sport);
  return MEMBER_FIELDS.map((fd) => {
    const [f] = fd;
    const col = { header: headerOf(t, fd), field: f };
    if (f === 'stt') return { ...col, type: 'int', width: 6 };
    if (f === 'full_name') return { ...col, width: 26, prompt: t('imp.how_full_name') };
    if (list[f]) return { ...col, list: list[f], prompt: t(`imp.how_${f}`, { durations: list.play_duration.join(' / ') }), listError: t('imp.pickFromList', { values: list[f].join(' / ') }), width: f === 'play_duration' ? 16 : f === 'member_type' ? 15 : 12 };
    if (f === 'birth') return { ...col, type: 'text', width: 13, prompt: t('imp.how_birth') };
    if (f === 'phone') return { ...col, type: 'phone', width: 15, prompt: t('imp.how_phone') };
    if (f === 'level') return lv ? { ...col, list: lv, width: 14, prompt: t('imp.how_level', { levels: lv.join(' / ') }), listError: t('imp.pickFromList', { values: lv.join(' / ') }) } : { ...col, type: 'decimal', width: 12, decimal: { min: 1, max: 8, error: t('imp.err_level') }, prompt: t('imp.how_level', { levels: '1.00 – 8.00' }) };
    if (f === 'district') return { ...col, width: 16, prompt: t('imp.how_district') };
    if (f === 'joined') return { ...col, type: 'text', width: 13, prompt: t('imp.how_joined') };
    if (f === 'notes') return { ...col, width: 32, wrap: true, prompt: t('imp.how_notes') };
    if (f === 'account') return { ...col, width: 26, muted: true, prompt: t('imp.how_account') };
    if (f === 'id') return { ...col, width: 38, muted: true, prompt: t('imp.how_id') };
    return col;
  });
}

const dmy = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');

// One member -> one row, in the column order above.
export function memberRow(m, i, t, levelText) {
  return MEMBER_FIELDS.map(([f]) => {
    switch (f) {
      case 'stt': return i + 1;
      case 'full_name': return m.full_name;
      case 'member_type': return t(`xlsx.place_${m.place || (m.join_requested ? 'waiting' : m.member_type)}`);
      case 'tier': return m.member_type === 'fixed' && m.tier ? t(`members.${m.tier}`) : '';
      case 'gender': return m.gender ? t(`members.${m.gender}`) : '';
      case 'birth': return m.birth_date ? dmy(m.birth_date) : m.birth_year ? String(m.birth_year) : '';
      case 'phone': return m.phone || '';
      case 'level': return m.dupr_level == null ? '' : levelText ? levelText(m.dupr_level) ?? '' : m.dupr_level;
      case 'district': return m.district || '';
      case 'play_duration': return m.play_duration ? t(`memberX.dur_${m.play_duration}`) : '';
      case 'joined': return m.joined_on ? m.joined_on.slice(0, 7).split('-').reverse().join('/') : '';
      case 'active': return m.is_active === false ? t('xlsx.no') : t('xlsx.yes');
      case 'notes': return m.notes || '';
      case 'account': return m.account_email || '';
      case 'id': return m.id || '';
      default: return '';
    }
  });
}
