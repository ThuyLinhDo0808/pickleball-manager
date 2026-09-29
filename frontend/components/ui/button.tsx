import { Loader2 } from 'lucide-react';

export function Button({ title, onClick, variant = 'primary', icon: Icon, loading, disabled, className = '' }: any) {
  const baseStyle = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition-colors disabled:opacity-50";
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    ghost: "bg-transparent border border-border text-foreground hover:bg-muted"
  };

  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${className}`}>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : Icon && <Icon className="h-5 w-5" />}
      {title}
    </button>
  );
}