export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-6xl animate-pulse px-6 py-10">
        <div className="h-8 w-28 rounded bg-slate-200" />
        <div className="mt-6 h-12 rounded bg-slate-200" />
        <div className="mt-4 h-96 rounded-2xl bg-slate-200" />
      </main>
    </div>
  );
}
