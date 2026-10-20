// KPI tiles: two per row on phones (all visible, nothing to swipe), a wider grid from tablets up.
export default function KpiRow({ cols = 4, children }) {
  const lg = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }[cols];
  return <div className={`grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:grid-cols-3 ${lg}`}>{children}</div>;
}
