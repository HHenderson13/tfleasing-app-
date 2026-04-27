"use client";
import { useRouter } from "next/navigation";

export function ClickableRow({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("a, button, input, select, textarea")) return;
        router.push(href);
      }}
      className="cursor-pointer hover:bg-slate-50"
    >
      {children}
    </tr>
  );
}
