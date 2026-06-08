// Shared skeleton for /broker/quotes (list) and /broker/quotes/[id]
// (detail) — Next App Router cascades into the deeper route from here.

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto h-12 max-w-5xl px-4 sm:px-6" />
      </header>
      <main className="mx-auto max-w-5xl animate-pulse px-4 py-8 sm:px-6 sm:py-12">
        <div className="h-8 w-48 rounded bg-slate-200" />
        <div className="mt-1 h-3 w-64 rounded bg-slate-200" />
        <div className="mt-6 space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl bg-slate-200" />)}
        </div>
      </main>
    </div>
  );
}
