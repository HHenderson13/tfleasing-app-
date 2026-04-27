import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
        <h1 className="text-lg font-semibold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-500">You don&apos;t have permission to view that page. Ask an administrator if this is wrong.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-slate-700 hover:text-slate-900">← Back to home</Link>
      </div>
    </div>
  );
}
