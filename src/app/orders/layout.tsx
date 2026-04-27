import type { ReactNode } from "react";
import { requireOrdersAccess } from "@/lib/auth-guard";

export default async function OrdersLayout({ children }: { children: ReactNode }) {
  await requireOrdersAccess();
  return <>{children}</>;
}
