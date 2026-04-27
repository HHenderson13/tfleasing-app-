import type { ReactNode } from "react";
import { TopNav } from "@/components/top-nav";
import { AdminNav } from "./admin-nav";
import { requireAdmin } from "@/lib/auth-guard";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="admin" />
      <div className="border-b border-slate-200 bg-white">
        <AdminNav />
      </div>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
