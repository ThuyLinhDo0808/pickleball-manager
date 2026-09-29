import { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function DateField({ label, error, ...props }: FieldProps) {
  return (
    <div className="mb-3.5 flex-1">
      {label && <label className="block text-xs font-bold text-muted-foreground mb-1.5">{label}</label>}
      <input
        type="date"
        className={`flex h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${error ? 'border-destructive' : 'border-border'}`}
        {...props}
      />
      {error && <p className="text-[12px] text-destructive mt-1">{error}</p>}
    </div>
  );
}

export function TimeField({ label, error, ...props }: FieldProps) {
  return (
    <div className="mb-3.5 flex-1">
      {label && <label className="block text-xs font-bold text-muted-foreground mb-1.5">{label}</label>}
      <input
        type="time"
        className={`flex h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${error ? 'border-destructive' : 'border-border'}`}
        {...props}
      />
      {error && <p className="text-[12px] text-destructive mt-1">{error}</p>}
    </div>
  );
}