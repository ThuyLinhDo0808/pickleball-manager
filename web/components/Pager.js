'use client';

// ← 2/5 → under a list.
export default function Pager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-4">
      <button type="button" className="btn-secondary !py-1 text-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>←</button>
      <span className="text-gray-400 text-sm tabular-nums">{page}/{pages}</span>
      <button type="button" className="btn-secondary !py-1 text-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>→</button>
    </div>
  );
}
