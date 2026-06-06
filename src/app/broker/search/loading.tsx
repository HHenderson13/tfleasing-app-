// Covers /broker/search/new-car, /new-van, /pre-reg-vans via Next App
// Router cascade. Matches the broker browser layout (filters left,
// results right) so the swap is visually smooth.

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-16 border-b border-slate-200 bg-white" />
      <div className="h-12 border-b border-slate-200 bg-white" />
      <main className="mx-auto max-w-7xl animate-pulse px-4 py-6 sm:px-6 sm:py-10">
        <div className="h-8 w-56 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 rounded bg-slate-200" />
        <div className="mt-6 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded-xl bg-slate-200" />)}
          </aside>
          <section>
            <div className="h-9 rounded-lg bg-slate-200" />
            <div className="mt-3 space-y-2">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-28 rounded-2xl bg-slate-200" />)}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
