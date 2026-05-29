export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto h-12 max-w-5xl px-6" />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="h-8 w-40 animate-pulse rounded-md bg-slate-200" />
        <div className="mt-2 h-4 w-60 animate-pulse rounded bg-slate-200/60" />
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border-2 border-slate-200 bg-slate-100" />
          ))}
        </div>
        <div className="mt-6 h-20 animate-pulse rounded-2xl border border-amber-200 bg-amber-50/40" />
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0">
              <div className="h-4 w-4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 flex-1 animate-pulse rounded bg-slate-200/80" />
              <div className="h-4 w-12 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
