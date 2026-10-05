'use client';
import { useEffect, useState } from 'react';

// The current time, refreshed every `ms` (for running clocks).
export function useNow(ms = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const iv = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(iv);
  }, [ms, active]);
  return now;
}
