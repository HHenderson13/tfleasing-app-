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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-3 space-y-2">
        {hasItems ? children : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">{empty}</div>
        )}
      </div>
    </section>
  );
}
