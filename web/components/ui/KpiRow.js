// KPI tiles: a swipeable row on phones, a grid from tablets up.
export default function KpiRow({ cols = 4, children }) {
  const lg = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }[cols];
  return (
    <div className={`flex gap-3 overflow-x-auto snap-x -mx-4 px-4 pb-1 mb-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-3 ${lg} [&>*]:min-w-[9.5rem] [&>*]:snap-start sm:[&>*]:min-w-0`}>
      {children}
    </div>
  );
}
