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
    <button type="button" onClick={go} className="text-xs text-slate-500 hover:text-slate-900">
      ← {label}
    </button>
  );
}
