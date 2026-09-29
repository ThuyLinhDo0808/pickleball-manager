import { LucideIcon } from 'lucide-react';

export function Badge({ label, icon: Icon, tone = 'neutral' }: { label: string, icon?: LucideIcon, tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent' }) {
  const tones = {
    neutral: 'bg-muted text-foreground',
    ok: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
    accent: 'bg-primary/10 text-primary',
  };
  
  return (
    <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${tones[tone]}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </div>
  );
}