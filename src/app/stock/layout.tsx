import type { ReactNode } from "react";
import { requireStockAccess } from "@/lib/auth-guard";

export default async function StockLayout({ children }: { children: ReactNode }) {
  await requireStockAccess();
  return <>{children}</>;
}
