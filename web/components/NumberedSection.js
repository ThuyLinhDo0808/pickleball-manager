// A form card with a numbered title (1, 2, 3…).
export default function NumberedSection({ n, title, hint, children }) {
  return (
    <section className="card mb-4">
      <h2 className="text-white font-semibold mb-3">
        <span className="inline-flex w-6 h-6 rounded-full bg-lime-400 text-navy-950 text-xs font-bold items-center justify-center mr-2">{n}</span>
        {title}
      </h2>
      {hint && <p className="text-gray-500 text-xs -mt-2 mb-3">{hint}</p>}
      {children}
    </section>
  );
}
