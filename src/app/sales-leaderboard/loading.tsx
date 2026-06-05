// Renders the moment the route transition starts, so users don't see the
// previous page frozen while we wait on DB. Matches the real page's
// structure so the swap is visually smooth.

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto h-12 max-w-6xl px-4 sm:px-6" />
      </header>
      <main className="mx-auto max-w-6xl animate-pulse px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="h-8 w-48 rounded bg-slate-200" />
        </div>
        <div className="mt-5 h-10 w-56 rounded-xl bg-slate-200" />
        <div className="mt-3 h-9 w-full rounded bg-slate-200" />
        <div className="mt-6 h-44 rounded-3xl bg-slate-200" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-slate-200" />
          ))}
        </div>
        <div className="mt-8 h-80 rounded-2xl bg-slate-200" />
      </main>
    </div>
  );
}
