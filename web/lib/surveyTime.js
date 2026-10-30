// "20:00 · Th 7, 31/10" in the viewer's time zone.
export function whenText(iso, lang) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'vi-VN', { hour: '2-digit', minute: '2-digit' });
  const day = d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${time} · ${day}`;
}
