import Link from "next/link";

export function TopNav(_props?: { active?: string }) {
  void _props;
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center px-6 py-3">
        <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Back to home
        </Link>
      </div>
    </header>
  );
}
