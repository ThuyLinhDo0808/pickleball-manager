// Google Maps links for a court: the Host's own Maps link when set, otherwise directions
// to the address (opens the Maps app on a phone). No API key needed.
export function mapsHref(location, mapUrl) {
  if (mapUrl && /^https:\/\//i.test(mapUrl)) return mapUrl;
  const q = (location || '').trim();
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null;
}

// A small map of the address for previews (Google's keyless embed).
export function mapsEmbed(location) {
  const q = (location || '').trim();
  return q.length >= 3 ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed` : null;
}
