export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto h-12 max-w-5xl px-6" />
      </header>
      <main className="mx-auto max-w-5xl animate-pulse px-6 py-10">
        <div className="h-8 w-64 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-slate-200" />
        <div className="mt-6 h-10 rounded bg-slate-200" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-200" />
          ))}
        </div>
        <div className="mt-6 h-64 rounded-2xl bg-slate-200" />
      </main>
    </div>
  );
}
