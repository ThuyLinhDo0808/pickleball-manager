// NexusZone logo (from the brand sheet): the N-arrow mark and the NEXUSZONE wordmark, drawn
// as SVG so they stay sharp at any size. Lime on the dark theme, navy on the light theme
// (both are rendered; globals.css shows the one that fits). `variant`: 'full' (mark +
// wordmark), 'mark' or 'word'. The height sets the size; widths follow the artwork.
export default function BrandLogo({ variant = 'full', className = '', markClass = 'h-7', wordClass = 'h-4' }) {
  const img = (file, cls, alt, tone) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/brand/${file}${tone === 'light' ? '-dark' : ''}.svg`} alt={alt} className={`${cls} w-auto ${tone === 'light' ? 'logo-on-light' : 'logo-on-dark'}`} draggable="false" />
  );
  return (
    <span className={`inline-flex items-center gap-2 shrink-0 ${className}`}>
      {variant !== 'word' && ['dark', 'light'].map((tone) => <span key={tone} className="contents">{img('nexuszone-mark', markClass, variant === 'mark' && tone === 'dark' ? 'NexusZone' : '', tone)}</span>)}
      {variant !== 'mark' && ['dark', 'light'].map((tone) => <span key={tone} className="contents">{img('nexuszone-wordmark', wordClass, tone === 'dark' ? 'NexusZone' : '', tone)}</span>)}
    </span>
  );
}
