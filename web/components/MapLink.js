'use client';
import { useI18n } from '@/context/I18nContext';
import { mapsHref } from '@/lib/maps';

// "📍 address" that opens Google Maps with directions to the court.
export default function MapLink({ location, mapUrl, className = 'text-gray-300 text-sm', showHint = true }) {
  const { t } = useI18n();
  const href = mapsHref(location, mapUrl);
  if (!location && !href) return null;
  if (!href) return <span className={className}>📍 {location}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${className} inline-flex flex-wrap items-baseline gap-x-1.5 hover:text-lime-300`} onClick={(e) => e.stopPropagation()}>
      <span>📍 <span className="underline decoration-dotted underline-offset-2">{location || t('map.open')}</span></span>
      {showHint && <span className="text-lime-400 text-xs font-semibold whitespace-nowrap">🧭 {t('map.directions')}</span>}
    </a>
  );
}
