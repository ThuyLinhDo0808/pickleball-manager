export function formatVnd(n) {
  return `${Number(n || 0).toLocaleString('vi-VN')} ₫`;
}

// Current month as YYYY-MM (for <input type="month">).
export function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
