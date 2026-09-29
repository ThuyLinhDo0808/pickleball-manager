import { Alert } from 'react-native';
import { t } from '../i18n/core.js';

// Turns an API error into a message in the host's language. The server sends
// stable codes (e.g. CAPACITY_LIMIT_REACHED); the wording lives here so it can be translated.
export function errorMessage(err) {
  const code = err?.code;
  const p = err?.payload || {};
  switch (code) {
    case 'CAPACITY_LIMIT_REACHED':
      if (p.requested) return t('err.capacityImport', { requested: p.requested, remaining: p.remaining });
      return t('err.capacity', { tier: t(`tier.${p.tier || 'free'}`), max: p.max_capacity, used: p.current_usage });
    case 'EVENT_NOT_OPEN': return t('err.eventNotOpen');
    case 'DUPLICATE_PARTICIPANT': return t('err.duplicate');
    case 'INVALID_STATE': return t('err.invalidState');
    case 'ALREADY_VOIDED': return t('err.alreadyVoided');
    case 'SELF_SERVE_DISABLED': return t('err.selfServe');
    case 'INVALID_CLUB': return t('err.invalidClub');
    case 'NETWORK': return t('err.network');
    case 'TIMEOUT': return t('err.timeout');
    default: break;
  }
  if (err?.status === 401) return t('err.session');
  return err?.message || t('err.generic');
}

// One place to show a failure. A plan-limit error offers a shortcut to the Plans screen.
export function showError(title, err, navigation) {
  if (err?.code === 'CAPACITY_LIMIT_REACHED') {
    Alert.alert(t('err.capacityTitle'), errorMessage(err), [
      { text: t('common.notNow'), style: 'cancel' },
      { text: t('plan.viewPlans'), onPress: () => navigation?.navigate('Plan') },
    ]);
    return;
  }
  Alert.alert(title, errorMessage(err));
}
