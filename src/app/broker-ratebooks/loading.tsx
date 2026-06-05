export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-6xl animate-pulse px-6 py-10">
        <div className="h-8 w-48 rounded bg-slate-200" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="h-24 rounded-2xl bg-slate-200" />
          <div className="h-24 rounded-2xl bg-slate-200" />
          <div className="h-24 rounded-2xl bg-slate-200" />
        </div>
        <div className="mt-6 h-96 rounded-2xl bg-slate-200" />
      </main>
    </div>
  );
}
