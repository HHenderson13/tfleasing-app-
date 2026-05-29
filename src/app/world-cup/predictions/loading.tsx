// Shows immediately on navigation while the server renders the page. Makes
// tab-switching feel instant even when the upstream queries are cold.
export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto h-12 max-w-5xl px-6" />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="h-8 w-48 animate-pulse rounded-md bg-slate-200" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-slate-200/60" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-2">
                <div className="h-3 w-32 animate-pulse rounded bg-slate-200/80" />
              </div>
              <div className="space-y-3 px-4 py-4">
                <div className="flex items-center justify-between">
                  <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-6 animate-pulse rounded bg-slate-200/60" />
                  <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
                </div>
                <div className="flex items-center justify-center gap-3">
                  <div className="h-12 w-16 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-12 w-16 animate-pulse rounded-xl bg-slate-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
