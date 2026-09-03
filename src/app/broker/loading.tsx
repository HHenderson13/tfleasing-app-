export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-[89px] border-b border-slate-200 bg-white" />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-slate-100" />
        <div className="mt-6 lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
          <div className="h-96 animate-pulse rounded-2xl bg-white" />
          <div className="mt-4 space-y-2 lg:mt-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
