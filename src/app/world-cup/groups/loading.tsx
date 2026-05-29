export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto h-12 max-w-5xl px-6" />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="h-8 w-44 animate-pulse rounded-md bg-slate-200" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-slate-200/60" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="space-y-2 p-3">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="flex items-center gap-3">
                    <div className="h-4 flex-1 animate-pulse rounded bg-slate-200/80" />
                    <div className="h-4 w-8 animate-pulse rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
