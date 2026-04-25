import type { ReactNode } from "react";
import { TopNav } from "@/components/top-nav";
import { AdminNav } from "./admin-nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
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
