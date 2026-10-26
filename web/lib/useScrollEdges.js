'use client';
import { useEffect, useState } from 'react';

// Which edges of a sideways-scrolling row still hide content (so the row can draw a fade and
// an arrow there). Re-measured on scroll and resize.
export function useScrollEdges(ref, deps = []) {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => setEdges({ left: box.scrollLeft > 4, right: box.scrollLeft + box.clientWidth < box.scrollWidth - 4 });
    measure();
    box.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    return () => { box.removeEventListener('scroll', measure); ro?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return edges;
}

// The fade + arrow drawn at an edge that hides more (phones).
export function EdgeArrow({ side, boxRef, dark = 'from-navy-950 via-navy-950/80' }) {
  const left = side === 'left';
  return (
    <button
      type="button"
      aria-label={left ? '←' : '→'}
      onClick={() => boxRef.current?.scrollBy({ left: left ? -160 : 160, behavior: 'smooth' })}
      className={`absolute inset-y-0 ${left ? 'left-0 justify-start bg-gradient-to-r' : 'right-0 justify-end bg-gradient-to-l'} ${dark} to-transparent flex w-10 items-center text-lime-300 sm:hidden`}
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={left ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
      </svg>
    </button>
  );
}
