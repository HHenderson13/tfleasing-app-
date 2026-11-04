"use client";
import { useRouter } from "next/navigation";

export function BackLink({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  function go() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }
  return (
    <button type="button" onClick={go} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4"><path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
      {label}
    </button>
  );
}
