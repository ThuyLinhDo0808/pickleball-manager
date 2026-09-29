// Extract the video id from any common YouTube URL (watch, youtu.be, shorts, live, embed).
export function youtubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(shorts|live|embed)\/([^/?]+)/);
      return m ? m[2] : null;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

// Keeps a start time like ?t=90 or &t=1m30s when embedding.
export function youtubeEmbedUrl(url) {
  const id = youtubeId(url);
  if (!id) return null;
  let start = 0;
  try {
    const t = new URL(url).searchParams.get('t') || '';
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (m) start = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  } catch {
    /* ignore */
  }
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1${start ? `&start=${start}` : ''}`;
}
