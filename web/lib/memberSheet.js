// Members in Excel ("Xuất Excel" on the members page): one row per person, phone and dates
// kept as text. The same file is the upload template ("Tải lên DS", lib/memberImport.js):
// rows with a member ID are updated, new rows are added.
// [field, header i18n key]
export const MEMBER_FIELDS = [
  ['stt', null],
  ['full_name', 'common.name'],
  ['member_type', 'xlsx.place'],
  ['tier', 'members.tier'],
  ['gender', 'members.gender'],
  ['birth', 'members.birthDate'],
  ['phone', 'common.phone'],
  ['dupr_id', 'members.xlsDuprId'], // pickleball: the player's DUPR ID
  ['level', 'common.level'], // badminton: the level step
  ['dupr', 'members.colDuprLinked'], // pickleball: DUPR from the DUPR ID (no self-typed score)
  ['skill', 'members.colSkill'], // the Host's own score (not DUPR)
  ['skill_level', 'members.colLevel'], // level from the community control panel
  ['district', 'memberX.district'],
  ['joined', 'members.joined'],
  ['active', 'xlsx.active'],
  ['notes', 'xlsx.notes'],
  ['account', 'xlsx.account'],
  ['id', 'xlsx.memberId'],
];
const headerOf = (t, [f, key]) => (f === 'stt' ? 'STT' : t(key));

// Column specs for lib/xlsxBook.
// Pickleball shows the DUPR column, badminton its level.
export const fieldsFor = (pickleball) => MEMBER_FIELDS.filter(([f]) => (pickleball ? f !== 'level' : !['dupr', 'dupr_id'].includes(f)));
export { headerOf };

const WIDTH = { dupr_id: 11, dupr: 10, skill: 11, skill_level: 14, full_name: 26, member_type: 15, tier: 12, gender: 10, birth: 13, phone: 15, level: 12, district: 16, play_duration: 16, joined: 13, active: 12, notes: 32, account: 26, id: 38 };
export function memberColumns(t, pickleball = true) {
  return fieldsFor(pickleball).map((fd) => {
    const [f] = fd;
    if (f === 'stt') return { header: 'STT', field: f, type: 'int', width: 6 };
    return { header: headerOf(t, fd), field: f, width: WIDTH[f], ...(['dupr', 'skill'].includes(f) ? { type: 'decimal' } : {}), ...(['birth', 'joined'].includes(f) ? { type: 'text' } : f === 'phone' ? { type: 'phone' } : {}), ...(f === 'notes' ? { wrap: true } : {}), ...(['account', 'id'].includes(f) ? { muted: true } : {}) };
  });
}

const dmy = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');

// One member -> one row, in the column order above.
export function memberRow(m, i, t, levelText, pickleball = true) {
  return fieldsFor(pickleball).map(([f]) => {
    switch (f) {
      case 'stt': return i + 1;
      case 'full_name': return m.full_name;
      case 'member_type': return t(`xlsx.place_${m.place || (m.join_requested ? 'waiting' : m.member_type)}`);
      case 'tier': return m.member_type === 'fixed' && m.tier ? t(`members.${m.tier}`) : '';
      case 'gender': return m.gender ? t(`members.${m.gender}`) : '';
      case 'birth': return m.birth_date ? dmy(m.birth_date) : m.birth_year ? String(m.birth_year) : '';
      case 'phone': return m.phone || '';
      case 'dupr_id': return m.dupr_id || '';
      case 'level': return m.dupr_level == null ? '' : levelText ? levelText(m.dupr_level) ?? '' : m.dupr_level;
      case 'dupr': return m.dupr_linked ?? m.dupr_manual ?? '';
      case 'skill': return m.skill_score == null ? '' : Number(m.skill_score);
      case 'skill_level': return m.level?.label || '';
      case 'district': return m.district || '';
      case 'joined': return m.joined_on ? m.joined_on.slice(0, 7).split('-').reverse().join('/') : '';
      case 'active': return m.is_active === false ? t('xlsx.no') : t('xlsx.yes');
      case 'notes': return m.notes || '';
      case 'account': return m.account_email || '';
      case 'id': return m.id || '';
      default: return '';
    }
  });
}
