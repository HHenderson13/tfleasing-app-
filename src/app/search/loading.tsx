export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl animate-pulse px-6 py-10">
        <div className="h-8 w-32 rounded bg-slate-200" />
        <div className="mt-6 h-12 rounded bg-slate-200" />
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-200" />
          ))}
        </div>
      </main>
    </div>
  );
}
