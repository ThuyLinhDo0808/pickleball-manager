'use client';

interface Option {
  value: string;
  label: string;
}

interface SegmentedProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  style?: React.CSSProperties;
}

export function Segmented({ value, onChange, options, style }: SegmentedProps) {
  return (
    <div 
      style={style}
      className="flex rounded-xl bg-muted p-1 border border-border"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
              active 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}