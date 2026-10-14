'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Remembers the previous page of this tab (sessionStorage), so a "← Quay lại" button knows
// whether going back stays inside the site or should open a fallback page instead.
export const PREV_KEY = 'pb_nav_prev';
const CUR_KEY = 'pb_nav_cur';

export default function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    try {
      const cur = sessionStorage.getItem(CUR_KEY);
      if (cur !== pathname) {
        if (cur) sessionStorage.setItem(PREV_KEY, cur);
        sessionStorage.setItem(CUR_KEY, pathname);
      }
    } catch {}
  }, [pathname]);
  return null;
}
