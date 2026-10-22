// NexusZone logo (from the brand sheet): the N-arrow mark and the NEXUSZONE wordmark, both
// lime on transparent, drawn as SVG so they stay sharp at any size. `variant`: 'full' (mark +
// wordmark), 'mark' or 'word'. The height sets the size; widths follow the artwork.
export default function BrandLogo({ variant = 'full', className = '', markClass = 'h-7', wordClass = 'h-4' }) {
  return (
    <span className={`inline-flex items-center gap-2 shrink-0 ${className}`}>
      {variant !== 'word' && <img src="/brand/nexuszone-mark.svg" alt={variant === 'mark' ? 'NexusZone' : ''} className={`${markClass} w-auto`} draggable="false" />}
      {variant !== 'mark' && <img src="/brand/nexuszone-wordmark.svg" alt="NexusZone" className={`${wordClass} w-auto`} draggable="false" />}
    </span>
  );
}
