// Shared section wrapper with title + empty state. Moved out of
// src/app/orders/order-row.tsx (still re-exported there for back-compat) so
// other pages don't have to reach into orders/ to render a section.

export function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const hasItems = arr.flat().filter(Boolean).length > 0;
  return (
    <section className="mt-8">
      <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-3 space-y-2">
        {hasItems ? children : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-8 text-center text-[14px] text-slate-600">{empty}</div>
        )}
      </div>
    </section>
  );
}
