// Refund tiers when a player cancels (same rules as the API, backend/services/attendance):
//   before cancel_deadline_hours → 100% back · before cancel_half_hours → 50% · later → 0%.

// The 50% tier only counts when it is shorter than the 100% one.
export function halfHours(full, half) {
  if (full == null || full === '' || half == null || half === '') return null;
  return Number(half) < Number(full) ? Number(half) : null;
}

// One line for the event page / sign-up page: "Hủy trước 12 tiếng: hoàn 100% · …".
// noRefund: "Không hoàn tiền" — whenever a player cancels, nothing comes back.
export function policyText(t, full, half, noRefund = false) {
  if (noRefund) return t('policy.noRefundShort');
  if (full == null || full === '') return t('policy.noneShort');
  const h = halfHours(full, half);
  return h == null ? t('policy.tiers1', { full }) : t('policy.tiers2', { full, half: h });
}

// What a player gets back if they cancel now. deadline / halfDeadline: ISO strings from
// the API (null = no policy / no 50% tier). Only the main list pays for a late cancel.
export function refundIfCancelNow({ deadline, halfDeadline, status }, now = Date.now()) {
  if (!deadline || !['registered', 'checked_in'].includes(status) || now <= Date.parse(deadline)) return 100;
  return halfDeadline && now <= Date.parse(halfDeadline) ? 50 : 0;
}

// Hours from the deadline numbers and the start (for pages that only have the event).
export function deadlinesOf(startMs, full, half, noRefund = false) {
  if (noRefund) return { deadline: new Date(0).toISOString(), halfDeadline: null };
  if (full == null || full === '' || !startMs) return { deadline: null, halfDeadline: null };
  const h = halfHours(full, half);
  return {
    deadline: new Date(startMs - Number(full) * 3600000).toISOString(),
    halfDeadline: h == null ? null : new Date(startMs - h * 3600000).toISOString(),
  };
}

// Start of the event in app time (Asia/Ho_Chi_Minh, UTC+7, no daylight saving), so the
// tier shown matches the server whatever the viewer's device timezone is.
export function eventStartMs(eventDate, startTime) {
  return Date.parse(`${eventDate}T${(startTime || '00:00').slice(0, 5)}:00+07:00`);
}
