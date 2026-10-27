'use client';
import { useRef, Children } from 'react';
import { useScrollEdges, EdgeArrow } from '@/lib/useScrollEdges';

// A row of filter chips / small tabs. Phone: ONE row that scrolls sideways (a fade and an
// arrow at the edge that hides more), so five or six filters never pile up into three lines.
// Wider screens: the chips wrap as before. `dark` = the gradient colour of the fade (match
// the card the row sits in).
export default function ChipRow({ children, className = '', innerClass = '', gap = 'gap-1.5', dark, ...rest }) {
  const row = useRef(null);
  const edges = useScrollEdges(row, [Children.count(children)]);
  return (
    <div className={`relative min-w-0 ${className}`}>
      <div
        ref={row}
        className={`flex ${gap} overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 [&>*]:whitespace-nowrap sm:flex-wrap sm:overflow-visible ${innerClass}`}
        {...rest}
      >
        {children}
      </div>
      {edges.left && <EdgeArrow side="left" boxRef={row} dark={dark} />}
      {edges.right && <EdgeArrow side="right" boxRef={row} dark={dark} />}
    </div>
  );
}
