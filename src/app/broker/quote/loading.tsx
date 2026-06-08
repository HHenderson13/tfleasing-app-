// Renders the moment the broker clicks "Get Quote" — gives them
// visual confirmation while the route picker / quote form server
// component does the loadMappedStock + lookup work. Cascade covers
// /broker/quote/[ref], /pcp, /hp, /hp-balloon, /outright.

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto h-12 max-w-7xl px-4 sm:px-6" />
      </header>
      <main className="mx-auto max-w-3xl animate-pulse px-4 py-8 sm:px-6 sm:py-12">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="mt-3 h-8 w-64 rounded bg-slate-200" />
        <div className="mt-1 h-3 w-40 rounded bg-slate-200" />
        <div className="mt-5 h-24 rounded-2xl bg-slate-200" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-slate-200" />)}
        </div>
      </main>
    </div>
  );
}
