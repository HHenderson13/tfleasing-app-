export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto h-12 max-w-5xl px-4 sm:px-6" />
      </header>
      <main className="mx-auto max-w-5xl animate-pulse px-4 py-8 sm:px-6 sm:py-12">
        <div className="h-8 w-56 rounded bg-slate-200" />
        <div className="mt-1 h-3 w-72 rounded bg-slate-200" />
        <div className="mt-6 h-32 rounded-2xl bg-slate-200" />
        <div className="mt-4 h-48 rounded-2xl bg-slate-200" />
      </main>
    </div>
  );
}
