export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto h-12 max-w-4xl px-4 sm:px-6" />
      </header>
      <main className="mx-auto max-w-4xl animate-pulse px-4 py-6 sm:px-6 sm:py-10">
        <div className="h-8 w-48 rounded bg-slate-200" />
        <div className="mt-6 h-44 rounded-2xl bg-slate-200" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="h-32 rounded-2xl bg-slate-200" />
          <div className="h-32 rounded-2xl bg-slate-200" />
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-slate-200" />
          ))}
        </div>
      </main>
    </div>
  );
}
