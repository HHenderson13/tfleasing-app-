import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth-guard";

export default async function ReportsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
