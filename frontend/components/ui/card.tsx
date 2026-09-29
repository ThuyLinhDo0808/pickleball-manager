import { ReactNode } from 'react';

export function Card({ children, className = '', onClick }: { children: ReactNode, className?: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`bg-card rounded-2xl p-5 border border-border shadow-sm ${onClick ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''} ${className}`}
    >
      {children}
    </div>
  );
}