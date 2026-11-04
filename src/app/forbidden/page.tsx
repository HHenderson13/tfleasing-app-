import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 sm:p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Access denied</h1>
        <p className="mt-2 text-[15px] leading-6 text-slate-600">You don&apos;t have permission to view that page. Ask an administrator if this is wrong.</p>
        <Link href="/" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-[14px] font-semibold text-white hover:bg-slate-800">Back to home</Link>
      </div>
    </div>
  );
}
