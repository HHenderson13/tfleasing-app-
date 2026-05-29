export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto h-12 max-w-5xl px-6" />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8 sm:py-10">
        <div className="h-48 animate-pulse rounded-3xl border border-emerald-200 bg-emerald-50/40" />
        <div className="mt-6 h-32 animate-pulse rounded-2xl border border-amber-200 bg-amber-50/40" />
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      </main>
    </div>
  );
}
