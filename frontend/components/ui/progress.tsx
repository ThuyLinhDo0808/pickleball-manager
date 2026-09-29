export function ProgressBar({ value, max, colorClass = 'bg-primary', className = '' }: { value: number, max: number, colorClass?: string, className?: string }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className={`h-1.5 rounded-full bg-secondary overflow-hidden ${className}`}>
      <div className={`h-full transition-all duration-300 ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}