import type { ReactNode } from "react";
import { TopNav } from "@/components/top-nav";
import { AdminNav } from "./admin-nav";
import { requireAdmin } from "@/lib/auth-guard";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="admin" />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <div className="mb-8"><AdminNav /></div>
        {children}
      </main>
    </div>
  );
}
