'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'club' | 'event' | null;

interface ModeContextType {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

const ModeContext = createContext<ModeContextType | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(null);
  const router = useRouter();

  useEffect(() => {
    // Chỉ chạy trên client
    const saved = localStorage.getItem('app.mode') as Mode;
    if (saved === 'club' || saved === 'event') {
      setModeState(saved);
    } else {
      setModeState('club'); // Mặc định
    }
  }, []);

  const setMode = (next: Mode) => {
    setModeState(next);
    if (next) {
      localStorage.setItem('app.mode', next);
      router.push(next === 'club' ? '/dashboard' : '/events'); // Chuyển trang ngay khi đổi mode
    } else {
      localStorage.removeItem('app.mode');
    }
  };

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used within a ModeProvider');
  return ctx;
}